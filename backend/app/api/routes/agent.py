"""Agent chat endpoint.

Streams coaching turns as Server-Sent Events (SSE). Each event is one
:class:`~app.agent.service.AgentEvent` serialized as JSON, so the frontend can
render assistant text, tool calls, and tool results as they happen.

Requires an LLM provider to be configured (e.g. ``ANTHROPIC_API_KEY``); without
one this returns 503 rather than failing mid-stream.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.api.schemas import ChatRequest
from app.runtime import ai_configured, get_agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    if not ai_configured():
        raise HTTPException(
            status_code=503,
            detail="No AI key set yet. Add one on the Settings page to wake up your coach.",
        )

    service = get_agent_service()

    async def event_stream():
        try:
            async for event in service.run_turn(req.message, req.history):
                yield f"data: {json.dumps({'type': event.type, **event.data}, default=str)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
