"""Trading-rules persistence + the analysis pipeline's verdict parsing."""

from app.agent.pipeline import _verdict
from app.persistence.store import Store


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
    assert _verdict("CONSIDER a small long near support.") == "CONSIDER"
    assert _verdict("  wait — no clean setup yet") == "WAIT"
    assert _verdict("AVOID: it's chopping") == "AVOID"
    assert _verdict("No clear verdict here") is None
