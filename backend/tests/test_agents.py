"""Trading-rules persistence + analysis-pipeline unit behaviour."""

import asyncio

import app.agent.pipeline as pipeline
from app.agent.pipeline import _verdict, run_market_analysis
from app.agent.tools.registry import build_analysis_registry
from app.persistence.store import Store
from app.strategies.types import Analysis, Signal, Trend


def test_user_rules_default_and_roundtrip():
    s = Store(":memory:")
    # A user who has never saved rules gets empty, switched-off defaults.
    assert s.get_user_rules(7) == {"rules_text": "", "use_rules": False, "updated_at": 0}

    saved = s.save_user_rules(7, "Only buy in a clear uptrend.", True)
    assert saved["rules_text"] == "Only buy in a clear uptrend."
    assert saved["use_rules"] is True
    assert saved["updated_at"] > 0

    got = s.get_user_rules(7)
    assert got["rules_text"] == "Only buy in a clear uptrend."
    assert got["use_rules"] is True

    # Rules are scoped per user.
    assert s.get_user_rules(8)["use_rules"] is False


def test_pipeline_verdict_parsing():
    # leading verdict word
    assert _verdict("CONSIDER a small long near support.") == "CONSIDER"
    assert _verdict("  wait — no clean setup yet") == "WAIT"
    assert _verdict("AVOID: it's chopping") == "AVOID"
    # robust to markdown / quotes / dashes / 'Verdict:' prefixes
    assert _verdict("**CONSIDER** a small long") == "CONSIDER"
    assert _verdict('"CONSIDER" here') == "CONSIDER"
    assert _verdict("- WAIT for the pullback") == "WAIT"
    assert _verdict("Verdict: AVOID") == "AVOID"
    # word boundary: longer words must NOT match
    assert _verdict("WAITING for confirmation") is None
    assert _verdict("CONSIDERING the options") is None
    assert _verdict("No clear call here") is None
    assert _verdict("") is None


def test_analysis_registry_is_read_only_and_asset_bound():
    reg = build_analysis_registry("forex")
    names = set(reg.names())
    # No order-placing tool — recommend-only by construction.
    assert "place_paper_order" not in names
    # No account tool — the pipeline runs on the house account, irrelevant here.
    assert "get_portfolio" not in names
    # Read + suggest tools are present.
    assert {"get_quote", "get_chart", "explain_concept", "propose_trade"} <= names
    # Data tools no longer expose an asset_class arg (it's pre-bound).
    assert "asset_class" not in reg.get("get_quote").parameters["properties"]


def test_pipeline_short_circuits_on_empty_market(monkeypatch):
    """No live data → don't spend two model passes; emit a done with verdict None."""
    empty = Analysis(
        symbol="BTCUSDT",
        asset_class="crypto",
        as_of=0,
        current_price=0.0,
        trend=Trend(direction="range", confidence=0.0),
        levels=[],
        signal=Signal(state="no_trade", reason="no data"),
        proposed_trade=None,
    )

    async def fake_analyze(*_a, **_k):
        return empty

    monkeypatch.setattr(pipeline, "analyze", fake_analyze)
    monkeypatch.setattr("app.runtime.get_data_provider", lambda _ac: object())

    def boom(*_a, **_k):
        raise AssertionError("the pipeline must not build an agent on empty data")

    monkeypatch.setattr("app.runtime.get_agent_service", boom)

    async def collect():
        return [ev async for ev in run_market_analysis(0, "BTCUSDT", "crypto", "1h")]

    events = asyncio.run(collect())
    assert events[-1].type == "done"
    assert events[-1].data.get("verdict") is None
