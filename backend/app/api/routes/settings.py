"""Runtime settings — currently just the AI provider key.

The key is held in memory for this local session only: never persisted to disk,
never logged, never returned to the client. This lets a non-technical user turn
the coach on by pasting a key, instead of editing environment files.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.runtime import ai_configured, set_ai_credentials

router = APIRouter(prefix="/api/settings", tags=["settings"])


class AISettingsRequest(BaseModel):
    provider: str = "claude"  # "claude" | "litellm"
    api_key: str | None = None


class AISettingsStatus(BaseModel):
    configured: bool
    provider: str


@router.get("/ai", response_model=AISettingsStatus)
async def get_ai_settings() -> AISettingsStatus:
    return AISettingsStatus(configured=ai_configured(), provider="claude")


@router.post("/ai", response_model=AISettingsStatus)
async def set_ai_settings(req: AISettingsRequest) -> AISettingsStatus:
    set_ai_credentials(req.provider, (req.api_key or "").strip() or None)
    return AISettingsStatus(configured=ai_configured(), provider=req.provider)
