"""Auth endpoints — signup / login / me / logout.

Tokens are returned in the JSON body and sent back via ``Authorization: Bearer``
(robust across tunnel hostnames; the coach SSE uses ``fetch``, so a header works
there too). Logout is a client-side token discard — tokens are stateless.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth.deps import CurrentUser
from app.auth.security import sign_token
from app.auth.service import AuthError, authenticate, register, user_public
from app.persistence.store import get_store

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: int


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


@router.post("/signup", response_model=AuthResponse)
async def signup(req: Credentials) -> AuthResponse:
    try:
        user = register(req.email, req.password)
    except AuthError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AuthResponse(token=sign_token(user["id"]), user=UserResponse(**user_public(user)))


@router.post("/login", response_model=AuthResponse)
async def login(req: Credentials) -> AuthResponse:
    user = authenticate(req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return AuthResponse(token=sign_token(user["id"]), user=UserResponse(**user_public(user)))


@router.get("/me", response_model=UserResponse)
async def me(user_id: CurrentUser) -> UserResponse:
    user = get_store().get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return UserResponse(**user_public(user))


@router.post("/logout")
async def logout() -> dict:
    return {"status": "ok"}
