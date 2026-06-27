"""Two-stage market-analysis pipeline.

An **Analyst** agent studies a market (grounded on the deterministic engine read,
with read-only data tools to dig in) and produces findings; a **Reviewer** agent on
a deeper model tier critiques those findings and returns a single recommendation.

Both reuse the existing ``AgentService`` (no parallel LLM client) — the same seam
the single-pass ``get_second_opinion`` uses, just chained. Crucially they run on a
**read-only, asset-class-bound registry** (``build_analysis_registry``): no
order-placing tool exists, so the pipeline is recommend-only *by construction*, and
the data tools can't fetch the wrong market. Events are streamed and tagged with a
``stage`` ("analyst" | "reviewer") so the UI renders the two passes separately.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator

from app.agent.prompts import (
    ANALYST_SYSTEM,
    REVIEWER_SYSTEM,
    analyst_message,
    reviewer_message,
)
from app.agent.service import CLAUDE_DEEP, CLAUDE_DEFAULT, AgentEvent
from app.agent.tools.registry import build_analysis_registry
from app.strategies.engine import analyze

_VERDICT_RE = re.compile(r"\b(CONSIDER|WAIT|AVOID)\b")


def _verdict(text: str) -> str | None:
    """The reviewer's verdict word, robust to leading markdown/punctuation and to
    'Verdict:' prefixes, matched on a word boundary (so WAITING != WAIT)."""
    m = _VERDICT_RE.search((text or "").upper())
    return m.group(1) if m else None


async def run_market_analysis(
    user_id: int, symbol: str, asset_class: str = "crypto", timeframe: str = "1h"
) -> AsyncIterator[AgentEvent]:
    """Yield AgentEvents for the Analyst pass, then the Reviewer pass, then a final
    ``done`` carrying the parsed verdict + token usage. A terminal ``done`` is always
    emitted, even on error, so the UI never hangs without a verdict."""
    from app.runtime import (
        HOUSE_USER_ID,
        get_agent_service,
        get_data_provider,
        get_user_rules_text,
    )

    usage = {"input_tokens": 0, "output_tokens": 0}

    def _take_usage(ev: AgentEvent) -> None:
        u = ev.data.get("usage") or {}
        usage["input_tokens"] += u.get("input_tokens", 0) or 0
        usage["output_tokens"] += u.get("output_tokens", 0) or 0

    try:
        provider = get_data_provider(asset_class)
        analysis = await analyze(symbol, asset_class, provider)
    except Exception as exc:  # noqa: BLE001
        yield AgentEvent(
            "error", {"message": f"Couldn't read the market: {exc}", "stage": "analyst"}
        )
        yield AgentEvent("done", {"stage": "reviewer", "verdict": None, "used_rules": False})
        return

    # No live data → don't spend two model passes on a confident-sounding guess.
    if not analysis.current_price or not analysis.levels:
        yield AgentEvent(
            "text",
            {
                "text": (
                    "I couldn't get enough live data for this market right now "
                    "(the price feed looks empty). Try again shortly."
                ),
                "stage": "analyst",
            },
        )
        yield AgentEvent("done", {"stage": "reviewer", "verdict": None, "used_rules": False})
        return

    rules = get_user_rules_text(user_id)  # the user's own rules (None if switched off)
    registry = build_analysis_registry(asset_class)  # read-only, asset-class-bound

    review = ""
    try:
        # --- Stage 1: Analyst (routine tier, read-only data tools) --------
        yield AgentEvent("stage", {"stage": "analyst", "label": "Analyst", "verdict": None})
        analyst = get_agent_service(
            HOUSE_USER_ID, system=ANALYST_SYSTEM, model=CLAUDE_DEFAULT, registry=registry
        )
        findings = ""
        async for ev in analyst.run_turn(
            analyst_message(symbol, asset_class, analysis, rules, timeframe), None
        ):
            if ev.type == "done":
                _take_usage(ev)
                continue
            if ev.type == "text":
                findings += ev.data.get("text", "")
            yield AgentEvent(ev.type, {**ev.data, "stage": "analyst"})

        # --- Stage 2: Reviewer (deep tier, judges the findings) -----------
        yield AgentEvent("stage", {"stage": "reviewer", "label": "Reviewer"})
        reviewer = get_agent_service(
            HOUSE_USER_ID, system=REVIEWER_SYSTEM, model=CLAUDE_DEEP, registry=registry
        )
        async for ev in reviewer.run_turn(
            reviewer_message(symbol, asset_class, analysis, findings, rules, timeframe), None
        ):
            if ev.type == "done":
                _take_usage(ev)
                continue
            if ev.type == "text":
                review += ev.data.get("text", "")
            yield AgentEvent(ev.type, {**ev.data, "stage": "reviewer"})
    except Exception as exc:  # noqa: BLE001
        yield AgentEvent("error", {"message": str(exc), "stage": "reviewer"})

    yield AgentEvent(
        "done",
        {
            "stage": "reviewer",
            "verdict": _verdict(review),
            "used_rules": bool(rules),
            "usage": usage,
        },
    )
