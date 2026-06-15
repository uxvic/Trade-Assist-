"""Auth tests — password hashing, signed tokens, and the user store."""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth.security import (  # noqa: E402
    hash_password,
    sign_token,
    verify_password,
    verify_token,
)
from app.persistence.store import Store  # noqa: E402


def test_password_hash_round_trip():
    h = hash_password("correct horse battery")
    assert h.startswith("pbkdf2_sha256$")
    assert verify_password("correct horse battery", h)
    assert not verify_password("wrong", h)


def test_password_hash_is_salted():
    assert hash_password("same") != hash_password("same")  # random salt


def test_token_sign_and_verify():
    tok = sign_token(7)
    assert verify_token(tok) == 7


def test_token_rejects_tampering_and_expiry():
    tok = sign_token(7)
    payload, sig = tok.split(".")
    assert verify_token(f"{payload}.{sig}x") is None  # bad signature
    assert verify_token("garbage") is None
    assert verify_token(sign_token(7, ttl_seconds=-1)) is None  # already expired
    assert verify_token(sign_token(7, ttl_seconds=60)) == 7
    _ = time  # (kept for clarity that exp is time-based)


def test_user_store_crud_and_unique_email():
    s = Store(":memory:")
    u = s.create_user("a@b.com", hash_password("password123"))
    assert u and u["email"] == "a@b.com"
    assert s.get_user_by_email("a@b.com")["id"] == u["id"]
    assert s.get_user_by_id(u["id"])["email"] == "a@b.com"
    assert s.create_user("a@b.com", "x") is None  # duplicate → None


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"  FAIL  {t.__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
