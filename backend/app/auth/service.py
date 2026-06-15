"""Auth orchestration: register / authenticate against the SQLite user store."""

from __future__ import annotations

from app.auth.security import hash_password, verify_password
from app.persistence.store import get_store


class AuthError(Exception):
    """A user-facing auth failure (the route maps it to 400/409)."""


def register(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise AuthError("Enter a valid email address.")
    if len(password or "") < 8:
        raise AuthError("Password must be at least 8 characters.")
    user = get_store().create_user(email, hash_password(password))
    if user is None:
        raise AuthError("That email is already registered.")
    return user


def authenticate(email: str, password: str) -> dict | None:
    user = get_store().get_user_by_email((email or "").strip().lower())
    if user and verify_password(password or "", user["password_hash"]):
        return user
    return None


def user_public(user: dict) -> dict:
    return {"id": user["id"], "email": user["email"], "created_at": user["created_at"]}
