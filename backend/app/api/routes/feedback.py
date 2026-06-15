"""Tester feedback — store a note and (if email is configured) ping the owner."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth.deps import CurrentUser
from app.persistence.store import get_store

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    message: str
    page: str = ""


@router.post("")
async def submit_feedback(req: FeedbackRequest, user_id: CurrentUser) -> dict:
    message = (req.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Write a message first.")

    store = get_store()
    user = store.get_user_by_id(user_id)
    email = user["email"] if user else None
    store.add_feedback(user_id, email, req.page[:120], message[:4000])

    # Best-effort: notify the owner by email if they configured one.
    try:
        from app.notifications.email import send_email
        from app.runtime import get_email_config

        cfg = get_email_config()
        if cfg:
            body = f"From: {email or 'unknown'}\nPage: {req.page or '—'}\n\n{message}"
            await send_email(cfg, "Trade-Assist feedback", body)
    except Exception:  # noqa: BLE001
        pass

    return {"status": "ok"}
