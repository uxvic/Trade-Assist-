"""Live integration tests for the two-stage agent pipeline + trading-rules API.

These exercise the real FastAPI app via ``TestClient`` (real routing, auth,
SSE serialization, store round-trips) but stub out the two network seams:

* ``app.agent.pipeline.analyze`` — the deterministic engine read (would hit a
  market-data provider) is replaced with a canned :class:`Analysis`.
* ``app.runtime.get_agent_service`` — the LLM-backed agent is replaced with a
  ``FakeAgentService`` whose ``run_turn`` is a scripted async generator. The fake
  records the ``(user_id, system, model)`` it was built with and the ``message``
  it was handed, so we can assert the pipeline wires the two stages correctly.

No real API key and no network are ever used: ``ai_configured()`` is made true by
setting an in-memory credential, but because ``get_agent_service`` is monkeypatched
the credential is never handed to Anthropic.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import app.agent.pipeline as pipeline  # noqa: E402
import app.persistence.store as store_mod  # noqa: E402
import app.runtime as runtime  # noqa: E402
from app.agent.service import CLAUDE_DEEP, CLAUDE_DEFAULT, AgentEvent  # noqa: E402
from app.main import app  # noqa: E402
from app.persistence.store import Store  # noqa: E402
from app.strategies.types import Analysis, Level, Signal, Trend  # noqa: E402


# --------------------------------------------------------------------------- #
# Canned engine read (no provider/network). Includes a level + non-zero price so
# the pipeline's "no live data" short-circuit does not trip.
# --------------------------------------------------------------------------- #
def _canned_analysis() -> Analysis:
    return Analysis(
        symbol="BTCUSDT",
        asset_class="crypto",
        as_of=1_700_000_000,
        current_price=42_000.0,
        trend=Trend(direction="up", confidence=0.6, reasons=["above the 50-MA"]),
        levels=[
            Level(
                price=41_000.0,
                type="support",
                strength=0.6,
                source_tf="1d",
                touches=3,
                last_touch_ts=1_699_000_000,
            )
        ],
        signal=Signal(state="no_trade", reason="waiting for a pullback"),
        proposed_trade=None,
    )


# --------------------------------------------------------------------------- #
# Fake agent service: scripted async generator that records how it was wired.
# --------------------------------------------------------------------------- #
class FakeAgentService:
    # Class-level ledger so the test can inspect every construction + turn.
    built: list[dict] = []
    turns: list[dict] = []

    def __init__(self, user_id, system, model):
        self.user_id = user_id
        self.system = system
        self.model = model
        FakeAgentService.built.append(
            {"user_id": user_id, "system": system, "model": model}
        )

    async def run_turn(self, message, history=None):
        FakeAgentService.turns.append(
            {"user_id": self.user_id, "system": self.system, "message": message}
        )
        # Stage-appropriate scripted output. The reviewer must START with a
        # verdict word so the pipeline can parse it into the final ``done``.
        from app.agent.prompts import REVIEWER_SYSTEM

        if self.system == REVIEWER_SYSTEM:
            yield AgentEvent("text", {"text": "CONSIDER a small long; "})
            yield AgentEvent("text", {"text": "watch the 41k level."})
            yield AgentEvent("done", {"stop_reason": "end_turn"})
        else:
            yield AgentEvent("text", {"text": "Trend is up. "})
            yield AgentEvent("tool_call", {"name": "get_quote", "input": {"symbol": "BTCUSDT"}})
            yield AgentEvent("text", {"text": "Price holding above support."})
            yield AgentEvent("done", {"stop_reason": "end_turn"})


@pytest.fixture
def fake_get_agent_service(monkeypatch):
    """Replace runtime.get_agent_service with the fake, resetting the ledgers."""
    FakeAgentService.built = []
    FakeAgentService.turns = []

    def _factory(user_id, intensity=None, system=None, model=None, registry=None):
        return FakeAgentService(user_id=user_id, system=system, model=model)

    monkeypatch.setattr(runtime, "get_agent_service", _factory)
    return FakeAgentService


@pytest.fixture
def memory_store(monkeypatch):
    """Point the cached ``get_store`` at a fresh in-memory Store for the test.

    Every call site does ``get_store()`` on the same cached function object, so
    priming its cache with an in-memory Store isolates the whole app from disk.
    """
    s = Store(":memory:")
    store_mod.get_store.cache_clear()
    monkeypatch.setattr(store_mod.get_store, "__wrapped__", lambda: s, raising=False)

    # The lru_cache wrapper still calls the original; override by stuffing the
    # cache through a one-shot replacement that returns our store.
    def _get_store():
        return s

    # Replace the attribute on the module AND patch the bound names that imported
    # it eagerly (settings route, auth service) so they see the same store.
    monkeypatch.setattr(store_mod, "get_store", _get_store)
    import app.api.routes.settings as settings_route
    import app.auth.service as auth_service

    monkeypatch.setattr(settings_route, "get_store", _get_store)
    monkeypatch.setattr(auth_service, "get_store", _get_store)
    return s


@pytest.fixture
def ai_on():
    """Make ai_configured() true without any real key; restore afterward."""
    runtime.set_ai_credentials("claude", "sk-test")
    yield
    runtime.set_ai_credentials(None, None)


@pytest.fixture
def client():
    return TestClient(app)


def _signup(client, email="trader@example.com", password="password123") -> str:
    resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _parse_sse(text: str) -> list[dict]:
    import json

    events = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: ") :]))
    return events


# --------------------------------------------------------------------------- #
# 503 when no AI key.
# --------------------------------------------------------------------------- #
def test_analyze_requires_ai_key(client, memory_store, fake_get_agent_service):
    # Ensure no credential is set.
    runtime.set_ai_credentials(None, None)
    token = _signup(client)
    resp = client.post(
        "/api/agent/analyze",
        json={"symbol": "BTCUSDT", "asset_class": "crypto"},
        headers=_auth(token),
    )
    assert resp.status_code == 503
    assert "AI key" in resp.json()["detail"]


# --------------------------------------------------------------------------- #
# Full two-stage stream: stages, tagged text, final verdict, house wiring.
# --------------------------------------------------------------------------- #
def test_analyze_two_stage_stream(
    client, memory_store, fake_get_agent_service, ai_on, monkeypatch
):
    monkeypatch.setattr(pipeline, "analyze", lambda *a, **k: _async_value(_canned_analysis()))
    token = _signup(client)

    resp = client.post(
        "/api/agent/analyze",
        json={"symbol": "BTCUSDT", "asset_class": "crypto", "timeframe": "1h"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    events = _parse_sse(resp.text)

    # ---- stage events, in order: analyst then reviewer --------------------
    stages = [e for e in events if e["type"] == "stage"]
    assert [s["stage"] for s in stages] == ["analyst", "reviewer"], events

    # ---- text events forwarded, each tagged with the right stage ----------
    analyst_text = [e for e in events if e["type"] == "text" and e["stage"] == "analyst"]
    reviewer_text = [e for e in events if e["type"] == "text" and e["stage"] == "reviewer"]
    assert analyst_text and reviewer_text
    assert "".join(e["text"] for e in analyst_text).startswith("Trend is up.")
    assert "".join(e["text"] for e in reviewer_text).startswith("CONSIDER")

    # ---- tool_call from the analyst is forwarded, stage-tagged ------------
    tool_calls = [e for e in events if e["type"] == "tool_call"]
    assert tool_calls and tool_calls[0]["stage"] == "analyst"

    # ---- exactly ONE done, at the very end, carrying the parsed verdict ----
    dones = [e for e in events if e["type"] == "done"]
    assert len(dones) == 1, dones  # the per-stage AgentService dones are swallowed
    assert events[-1]["type"] == "done"
    assert dones[0]["verdict"] == "CONSIDER"
    assert dones[0]["stage"] == "reviewer"

    # ---- recommend-only: BOTH stages built on the HOUSE account (uid 0) ----
    built = fake_get_agent_service.built
    assert len(built) == 2, built
    assert [b["user_id"] for b in built] == [runtime.HOUSE_USER_ID, runtime.HOUSE_USER_ID]
    assert runtime.HOUSE_USER_ID == 0

    # ---- analyst then reviewer system prompts; reviewer on the deep model ---
    from app.agent.prompts import ANALYST_SYSTEM, REVIEWER_SYSTEM

    assert built[0]["system"] == ANALYST_SYSTEM
    assert built[1]["system"] == REVIEWER_SYSTEM
    assert built[0]["model"] == CLAUDE_DEFAULT
    assert built[1]["model"] == CLAUDE_DEEP


# --------------------------------------------------------------------------- #
# Rules injection: present when enabled, absent when disabled.
# --------------------------------------------------------------------------- #
def test_rules_injected_when_enabled(
    client, memory_store, fake_get_agent_service, ai_on, monkeypatch
):
    monkeypatch.setattr(pipeline, "analyze", lambda *a, **k: _async_value(_canned_analysis()))
    token = _signup(client)

    rules_text = "Never risk more than 1 percent and only trade with the daily trend."
    saved = client.post(
        "/api/settings/rules",
        json={"rules_text": rules_text, "use_rules": True},
        headers=_auth(token),
    )
    assert saved.status_code == 200, saved.text

    resp = client.post(
        "/api/agent/analyze",
        json={"symbol": "BTCUSDT", "asset_class": "crypto"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    turns = fake_get_agent_service.turns
    assert len(turns) == 2
    for t in turns:  # rules go into BOTH stage prompts
        assert rules_text in t["message"], t["message"]

    # done reports it used the rules
    done = [e for e in _parse_sse(resp.text) if e["type"] == "done"][0]
    assert done["used_rules"] is True


def test_rules_absent_when_disabled(
    client, memory_store, fake_get_agent_service, ai_on, monkeypatch
):
    monkeypatch.setattr(pipeline, "analyze", lambda *a, **k: _async_value(_canned_analysis()))
    token = _signup(client)

    rules_text = "Never risk more than 1 percent and only trade with the daily trend."
    # Saved but the toggle is OFF.
    client.post(
        "/api/settings/rules",
        json={"rules_text": rules_text, "use_rules": False},
        headers=_auth(token),
    )

    resp = client.post(
        "/api/agent/analyze",
        json={"symbol": "BTCUSDT", "asset_class": "crypto"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text

    turns = fake_get_agent_service.turns
    assert len(turns) == 2
    for t in turns:
        assert rules_text not in t["message"], t["message"]

    done = [e for e in _parse_sse(resp.text) if e["type"] == "done"][0]
    assert done["used_rules"] is False


# --------------------------------------------------------------------------- #
# /api/settings/rules round-trips per user and isolates between users.
# --------------------------------------------------------------------------- #
def test_rules_roundtrip_and_per_user_isolation(client, memory_store):
    alice = _signup(client, email="alice@example.com")
    bob = _signup(client, email="bob@example.com")

    # Alice has empty defaults to begin with.
    got = client.get("/api/settings/rules", headers=_auth(alice)).json()
    assert got == {"rules_text": "", "use_rules": False, "updated_at": 0}

    # Alice saves rules.
    rules = "Cut losers fast; let winners run."
    posted = client.post(
        "/api/settings/rules",
        json={"rules_text": rules, "use_rules": True},
        headers=_auth(alice),
    ).json()
    assert posted["rules_text"] == rules
    assert posted["use_rules"] is True
    assert posted["updated_at"] > 0

    # Alice reads them back.
    reread = client.get("/api/settings/rules", headers=_auth(alice)).json()
    assert reread["rules_text"] == rules
    assert reread["use_rules"] is True

    # Bob does NOT see Alice's rules.
    bobs = client.get("/api/settings/rules", headers=_auth(bob)).json()
    assert bobs == {"rules_text": "", "use_rules": False, "updated_at": 0}


def test_rules_requires_auth(client, memory_store):
    assert client.get("/api/settings/rules").status_code == 401
    assert (
        client.post("/api/settings/rules", json={"rules_text": "x", "use_rules": True}).status_code
        == 401
    )


# --------------------------------------------------------------------------- #
# Small helper: wrap a value in an awaitable so the patched ``analyze`` matches
# the ``await analyze(...)`` call site without pulling in asyncio plumbing.
# --------------------------------------------------------------------------- #
async def _async_value(value):
    return value
