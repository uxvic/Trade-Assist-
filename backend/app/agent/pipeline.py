"""Two-stage market-analysis pipeline.

An **Analyst** agent studies a market (grounded on the deterministic engine read,
with live data tools to dig in) and produces findings; a **Reviewer** agent on a
deeper model tier critiques those findings and returns a single recommendation.

Both reuse the existing ``AgentService`` (no parallel LLM client) — the same seam
the single-pass ``get_second_opinion`` uses, just chained. Events are streamed and
tagged with a ``stage`` ("analyst" | "reviewer") so the UI renders the two passes
separately. If the user has switched on their own trading rules, those are fed into
both prompts so the recommendation respects them (recommend-only: the pipeline never
places a trade).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.agent.prompts import (
    ANALYST_SYSTEM,
    REVIEWER_SYSTEM,
    analyst_message,
    reviewer_message,
)
from app.agent.service import CLAUDE_DEEP, CLAUDE_DEFAULT, AgentEvent
from app.strategies.engine import analyze

_VERDICTS = ("CONSIDER", "WAIT", "AVOID")


def _verdict(text: str) -> str | None:
    upper = text.strip().upper()
    return next((v for v in _VERDICTS if upper.startswith(v)), None)


async def run_market_analysis(
    user_id: int, symbol: str, asset_class: str = "crypto", timeframe: str = "1h"
) -> AsyncIterator[AgentEvent]:
    """Yield AgentEvents for the Analyst pass, then the Reviewer pass, then a final
    ``done`` carrying the parsed verdict. ``timeframe`` is contextual only — the
    engine always reads its own multi-timeframe set."""
    from app.runtime import (
        HOUSE_USER_ID,
        get_agent_service,
        get_data_provider,
        get_user_rules_text,
    )

    provider = get_data_provider(asset_class)
    analysis = await analyze(symbol, asset_class, provider)
    rules = get_user_rules_text(user_id)  # the user's own rules (None if switched off)

    # Both agents run on the HOUSE registry, not the user's — so the pipeline is
    # recommend-only by construction (it can never place an order on the user's
    # real account). The user's rules are passed in via the prompt, above.

    # --- Stage 1: Analyst (routine tier, with data tools) -----------------
    yield AgentEvent("stage", {"stage": "analyst", "label": "Analyst", "verdict": None})
    analyst = get_agent_service(HOUSE_USER_ID, system=ANALYST_SYSTEM, model=CLAUDE_DEFAULT)
    findings = ""
    async for ev in analyst.run_turn(analyst_message(symbol, asset_class, analysis, rules), None):
        if ev.type == "done":
            continue  # one combined done is emitted at the very end
        if ev.type == "text":
            findings += ev.data.get("text", "")
        yield AgentEvent(ev.type, {**ev.data, "stage": "analyst"})

    # --- Stage 2: Reviewer (deep tier, judges the findings) ---------------
    yield AgentEvent("stage", {"stage": "reviewer", "label": "Reviewer"})
    reviewer = get_agent_service(HOUSE_USER_ID, system=REVIEWER_SYSTEM, model=CLAUDE_DEEP)
    review = ""
    async for ev in reviewer.run_turn(
        reviewer_message(symbol, asset_class, analysis, findings, rules), None
    ):
        if ev.type == "done":
            continue
        if ev.type == "text":
            review += ev.data.get("text", "")
        yield AgentEvent(ev.type, {**ev.data, "stage": "reviewer"})

    yield AgentEvent(
        "done",
        {"stage": "reviewer", "verdict": _verdict(review), "used_rules": bool(rules)},
    )
