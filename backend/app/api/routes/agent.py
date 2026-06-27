"""Agent endpoints — reactive chat and proactive trade-desk reads.

Both stream coaching turns as Server-Sent Events (SSE): each event is one
:class:`~app.agent.service.AgentEvent` serialized as JSON, so the frontend can
render assistant text, tool calls (incl. `propose_trade`), and tool results as
they happen.

Requires an LLM provider (e.g. ``ANTHROPIC_API_KEY``); without one these return
503 rather than failing mid-stream.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agent.pipeline import run_market_analysis
from app.agent.prompts import observe_prompt
from app.api.schemas import AnalyzeRequest, ChatRequest, ObserveRequest
from app.auth.deps import CurrentUser
from app.runtime import ai_configured, get_agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


def _require_ai() -> None:
    if not ai_configured():
        raise HTTPException(
            status_code=503,
            detail="No AI key set yet. Add one on the Settings page to wake up your coach.",
        )


def _sse_events(events):
    """Stream an async iterator of AgentEvents as Server-Sent Events."""

    async def event_stream():
        try:
            async for event in events:
                yield f"data: {json.dumps({'type': event.type, **event.data}, default=str)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse(service, message, history):
    return _sse_events(service.run_turn(message, history))


@router.post("/chat")
async def chat(req: ChatRequest, user_id: CurrentUser) -> StreamingResponse:
    _require_ai()
    return _sse(get_agent_service(user_id, intensity=req.intensity), req.message, req.history)


@router.post("/observe")
async def observe(req: ObserveRequest, user_id: CurrentUser) -> StreamingResponse:
    """A proactive expert 'read' of whatever the user is currently viewing."""
    _require_ai()
    message = observe_prompt(req.name or req.symbol, req.symbol, req.asset_class, req.timeframe)
    return _sse(get_agent_service(user_id, intensity=req.intensity), message, None)


@router.post("/analyze")
async def analyze_market(req: AnalyzeRequest, user_id: CurrentUser) -> StreamingResponse:
    """Two-stage pipeline: an Analyst studies the market → a Reviewer recommends.
    Streams stage-tagged events; respects the user's trading rules if switched on."""
    _require_ai()
    return _sse_events(
        run_market_analysis(user_id, req.symbol, req.asset_class, req.timeframe)
    )
