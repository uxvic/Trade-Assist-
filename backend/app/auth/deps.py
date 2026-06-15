"""The ``current_user`` FastAPI dependency — resolves a bearer token to a user id."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.auth.security import verify_token


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


async def current_user_id(authorization: str | None = Header(default=None)) -> int:
    uid = verify_token(_extract_bearer(authorization) or "")
    if uid is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return uid


CurrentUser = Annotated[int, Depends(current_user_id)]
