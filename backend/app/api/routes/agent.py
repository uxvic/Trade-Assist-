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
from app.config import get_settings
from app.runtime import get_agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


def _provider_configured(settings) -> bool:
    if settings.agent_provider == "claude":
        return bool(settings.anthropic_api_key)
    return True  # litellm reads its own env (OpenAI key, Ollama host, etc.)


@router.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    settings = get_settings()
    if not _provider_configured(settings):
        raise HTTPException(
            status_code=503,
            detail="No LLM provider configured. Set ANTHROPIC_API_KEY (or switch agent_provider).",
        )

    service = get_agent_service()

    async def event_stream():
        try:
            async for event in service.run_turn(req.message, req.history):
                yield f"data: {json.dumps({'type': event.type, **event.data}, default=str)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
