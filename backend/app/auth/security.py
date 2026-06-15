"""Authentication primitives — stdlib crypto only (no pyjwt/passlib).

- Passwords: PBKDF2-HMAC-SHA256 with a per-password salt, stored self-describing.
- Sessions: a stateless HMAC-SHA256-signed ``{uid, exp}`` token, verified with a
  constant-time compare. The signing secret comes from ``Settings.auth_secret``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from app.config import get_settings

_ITERATIONS = 240_000


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${_b64e(salt)}${_b64e(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, dk_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64d(salt_b64), int(iters))
        return hmac.compare_digest(dk, _b64d(dk_b64))
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------- #
# Session tokens
# --------------------------------------------------------------------------- #
def _secret() -> bytes:
    return get_settings().auth_secret.encode()


def sign_token(user_id: int, ttl_seconds: int = 30 * 86400) -> str:
    payload = _b64e(json.dumps({"uid": user_id, "exp": int(time.time()) + ttl_seconds}).encode())
    sig = _b64e(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_token(token: str) -> int | None:
    try:
        payload, sig = token.split(".")
        expected = _b64e(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_b64d(payload))
        if int(data["exp"]) < int(time.time()):
            return None
        return int(data["uid"])
    except (ValueError, TypeError, KeyError):
        return None
