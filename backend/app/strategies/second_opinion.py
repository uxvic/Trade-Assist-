"""AI second opinion — an independent read alongside the deterministic bot.

Reuses the existing ``AgentService`` (no parallel LLM client) with a dedicated
system prompt. The AI is fed the engine's levels/trend/proposed-trade and may
disagree with the bot — that disagreement is the teaching moment.
"""

from __future__ import annotations

from app.strategies.types import Analysis

_VERDICTS = ("AGREE", "WAIT", "DISAGREE")


async def get_second_opinion(symbol: str, asset_class: str, analysis: Analysis) -> dict:
    from app.agent.prompts import SECOND_OPINION_SYSTEM, second_opinion_message
    from app.runtime import ai_configured, get_agent_service

    if not ai_configured():
        return {"market_read": None, "agrees_with_bot": None, "available": False}

    service = get_agent_service(system=SECOND_OPINION_SYSTEM)
    message = second_opinion_message(symbol, asset_class, analysis)

    text = ""
    try:
        async for event in service.run_turn(message, None):
            if event.type == "text":
                text += event.data.get("text", "")
    except Exception as exc:  # noqa: BLE001
        return {
            "market_read": f"(coach unavailable: {exc})",
            "agrees_with_bot": None,
            "available": False,
        }

    text = text.strip()
    upper = text.upper()
    agrees: bool | None = None
    read = text
    for token in _VERDICTS:
        if upper.startswith(token):
            agrees = token == "AGREE"
            read = text[len(token):].lstrip(" :-—.").strip()
            break

    return {"market_read": read or text, "agrees_with_bot": agrees, "available": True}
