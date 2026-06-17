"""Forecast-lens tests: the storage round-trip, the scoring/maturation pass, and
the honest accuracy scorecard (including a case where the naive baseline wins).

The heavy TimesFM model is never touched here — these exercise the persistence
and scoring math, which is where the teaching value lives. Runnable two ways:
  * ``pytest backend/tests/test_forecast.py``
  * ``python backend/tests/test_forecast.py``
"""

from __future__ import annotations

import asyncio
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.forecasting import scoring  # noqa: E402
from app.forecasting.timesfm_model import TF_SECONDS, ForecastUnavailable, forecast  # noqa: E402
from app.persistence.store import Store  # noqa: E402


def run(coro):
    return asyncio.run(coro)


@dataclass
class _Candle:
    ts: datetime
    close: Decimal


class _FakeProvider:
    """Returns a fixed candle series; records the get_candles call."""

    def __init__(self, candles):
        self._candles = candles
        self.calls = 0

    async def get_candles(self, symbol, timeframe, limit=200):
        self.calls += 1
        return self._candles


def _candles_from(prices: list[tuple[int, float]]):
    return [_Candle(datetime.fromtimestamp(ts, tz=UTC), Decimal(str(p))) for ts, p in prices]


# --------------------------------------------------------------------------- #
# Storage round-trip
# --------------------------------------------------------------------------- #
def test_forecast_store_round_trip():
    s = Store(":memory:")
    now = int(time.time())
    s.add_forecast("BTCUSDT", "1m", made_price=100.0, target_ts=now - 60, predicted=105.0,
                   baseline=100.0)
    s.add_forecast("BTCUSDT", "1m", made_price=100.0, target_ts=now + 600, predicted=110.0,
                   baseline=100.0)  # not due yet

    due = s.unscored_forecasts_due("BTCUSDT", "1m", now)
    assert len(due) == 1, "only the matured forecast is due for scoring"
    assert s.scored_forecasts("BTCUSDT") == []  # nothing scored yet

    s.score_forecast(int(due[0]["id"]), realized=104.0)
    assert s.unscored_forecasts_due("BTCUSDT", "1m", now) == []  # consumed
    scored = s.scored_forecasts("BTCUSDT")
    assert len(scored) == 1 and scored[0]["realized"] == 104.0


# --------------------------------------------------------------------------- #
# Maturation pass (score_pending)
# --------------------------------------------------------------------------- #
def test_score_pending_settles_matured_only():
    s = Store(":memory:")
    now = int(time.time())
    s.add_forecast("ETHUSDT", "1m", made_price=2000.0, target_ts=now - 120, predicted=2100.0,
                   baseline=2000.0)
    s.add_forecast("ETHUSDT", "1m", made_price=2000.0, target_ts=now + 600, predicted=2200.0,
                   baseline=2000.0)
    # Realized price at the matured target is 2080.
    provider = _FakeProvider(_candles_from([(now - 120, 2080.0), (now - 60, 2090.0)]))

    n = run(scoring.score_pending(s, provider, "ETHUSDT", "crypto", "1m"))
    assert n == 1
    scored = s.scored_forecasts("ETHUSDT")
    assert len(scored) == 1 and scored[0]["realized"] == 2080.0
    # The future-dated forecast is left untouched for next time.
    assert len(s.unscored_forecasts_due("ETHUSDT", "1m", now + 1000)) == 1


def test_score_pending_swallows_provider_errors():
    s = Store(":memory:")
    now = int(time.time())
    s.add_forecast("BTCUSDT", "1m", 100.0, now - 60, 105.0, 100.0)

    class _Boom:
        async def get_candles(self, *a, **k):
            raise RuntimeError("upstream down")

    assert run(scoring.score_pending(s, _Boom(), "BTCUSDT", "crypto", "1m")) == 0
    # Row remains unscored so it can be settled on a later, healthy call.
    assert len(s.unscored_forecasts_due("BTCUSDT", "1m", now)) == 1


# --------------------------------------------------------------------------- #
# The honest scorecard
# --------------------------------------------------------------------------- #
def test_scorecard_empty():
    card = scoring.scorecard(Store(":memory:"), "BTCUSDT")
    assert card["n"] == 0
    assert card["directional_acc"] is None
    assert "matured" in card["verdict"].lower()


def test_scorecard_directional_and_beat_naive():
    s = Store(":memory:")
    now = int(time.time())

    def add_and_score(made, predicted, realized):
        s.add_forecast("BTCUSDT", "1m", made, now - 60, predicted, made)
        due = s.unscored_forecasts_due("BTCUSDT", "1m", now)
        s.score_forecast(int(due[-1]["id"]), realized)

    # 1) called UP, went UP, and landed closer than naive:
    #    |103-104|=1 < naive |100-104|=4 → direction✓, beat✓
    add_and_score(made=100.0, predicted=103.0, realized=104.0)
    # 2) called UP, went DOWN → direction✗; |108-96|=12 vs naive |100-96|=4 → beat✗
    add_and_score(made=100.0, predicted=108.0, realized=96.0)

    card = scoring.scorecard(s, "BTCUSDT")
    assert card["n"] == 2
    assert card["directional_acc"] == 50  # 1 of 2 directions right
    assert card["beat_naive_pct"] == 50  # 1 of 2 beat the naive guess


def test_scorecard_naive_can_win():
    """A confident-but-wrong model loses to 'price stays put' — the whole lesson."""
    s = Store(":memory:")
    now = int(time.time())
    for _ in range(10):
        s.add_forecast("XRPUSDT", "1m", 1.00, now - 60, 1.50, 1.00)  # wildly bullish
        due = s.unscored_forecasts_due("XRPUSDT", "1m", now)
        s.score_forecast(int(due[-1]["id"]), 1.01)  # barely moved

    card = scoring.scorecard(s, "XRPUSDT")
    assert card["n"] == 10
    assert card["beat_naive_pct"] == 0  # naive (1.00) is always closer than 1.50


# --------------------------------------------------------------------------- #
# Model wrapper guards (no TimesFM installed in CI → graceful)
# --------------------------------------------------------------------------- #
def test_tf_seconds_covers_all_timeframes():
    from app.data.providers.base import Timeframe

    for tf in Timeframe:
        assert tf.value in TF_SECONDS


def test_forecast_rejects_short_history():
    try:
        forecast([1.0, 2.0, 3.0], horizon=4)
    except ForecastUnavailable as exc:
        assert "history" in str(exc).lower()
    else:  # pragma: no cover - would only hit if validation regressed
        raise AssertionError("expected ForecastUnavailable for too-short history")


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
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"  ERROR {t.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
