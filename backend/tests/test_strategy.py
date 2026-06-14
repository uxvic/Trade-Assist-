"""Tests for the rules-based strategy core (pure, offline).

Run via ``pytest`` or ``python tests/test_strategy.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.strategies.levels import _atr, _cluster, build_levels  # noqa: E402
from app.strategies.pips import pip_size, pips_to_price  # noqa: E402
from app.strategies.pivots import find_pivots  # noqa: E402
from app.strategies.signal import evaluate  # noqa: E402
from app.strategies.trend import classify_trend  # noqa: E402
from app.strategies.types import CandleF, Level, Pivot, Trend  # noqa: E402


def cf(i: int, high: float, low: float, close: float | None = None, open_: float | None = None):
    close = close if close is not None else (high + low) / 2
    open_ = open_ if open_ is not None else close
    return CandleF(ts=i * 1800, open=open_, high=high, low=low, close=close, volume=1.0)


# --------------------------------------------------------------------------- #
# Pivots
# --------------------------------------------------------------------------- #
def test_pivot_high_detected():
    highs = [10, 11, 12, 15, 12, 11, 10]
    candles = [cf(i, h, h - 1) for i, h in enumerate(highs)]
    pivots = find_pivots(candles, 2, 2)
    assert any(p.kind == "high" and p.index == 3 and p.price == 15 for p in pivots)


def test_pivot_no_lookahead():
    # The peak is the LAST (forming) candle — it must never be a confirmed pivot.
    highs = [10, 11, 12, 11, 10, 20]
    candles = [cf(i, h, h - 1) for i, h in enumerate(highs)]
    pivots = find_pivots(candles, 2, 2)
    assert all(p.price != 20 for p in pivots)
    assert all(p.index <= len(candles) - 1 - 2 for p in pivots)


# --------------------------------------------------------------------------- #
# Levels
# --------------------------------------------------------------------------- #
def test_cluster_groups_near_and_splits_far():
    pivots = [Pivot(0, 0, 100.0, "high"), Pivot(1, 0, 100.05, "high"), Pivot(2, 0, 105.0, "high")]
    clusters = _cluster(pivots, threshold=0.2)
    assert len(clusters) == 2
    assert len(clusters[0]) == 2  # 100.0 + 100.05 together


def test_build_levels_double_top_clusters():
    highs = [99.0] * 15
    highs[4] = 100.0
    highs[10] = 100.04
    candles = [cf(i, h, 98.4, close=98.5) for i, h in enumerate(highs)]
    levels = build_levels(candles, "1h", last_price=99.0)
    near = [lv for lv in levels if 99.9 <= lv.price <= 100.1]
    assert near, "expected a resistance level near 100"
    assert near[0].type == "resistance"
    assert near[0].touches >= 2


def test_atr_positive():
    candles = [cf(i, 101 + i * 0.1, 99 + i * 0.1, close=100 + i * 0.1) for i in range(20)]
    assert _atr(candles) > 0


# --------------------------------------------------------------------------- #
# Trend
# --------------------------------------------------------------------------- #
def _trending_daily(up: bool, n: int = 220):
    candles = []
    for i in range(n):
        base = 100 + (i if up else -i) * 0.5
        # gentle zig-zag so swing pivots form
        wobble = 1.5 if i % 6 < 3 else -1.0
        high = base + 2 + wobble
        low = base - 2 + wobble
        candles.append(cf(i, high, low, close=base + (0.5 if up else -0.5), open_=base))
    return candles


def test_trend_up():
    t = classify_trend(_trending_daily(up=True))
    assert t.direction == "up"
    assert t.confidence >= 0.5


def test_trend_not_up_when_falling():
    t = classify_trend(_trending_daily(up=False))
    assert t.direction != "up"


# --------------------------------------------------------------------------- #
# Signal
# --------------------------------------------------------------------------- #
def _buy_scenario():
    level = Level(
        price=100.0, type="resistance", strength=0.7, source_tf="1d", touches=3, last_touch_ts=0
    )
    daily = [cf(0, 96, 90, close=95, open_=91)]  # last daily bullish
    prev30 = cf(0, 99.6, 98.9, close=99.5, open_=99.0)  # below level, bullish
    last30 = cf(1, 100.6, 99.8, close=100.5, open_=100.0)  # closes above level
    return level, daily, [prev30, last30]


def test_signal_buy_with_correct_stop_target():
    level, daily, m30 = _buy_scenario()
    trend = Trend("up", 0.85, [])
    sig, trade = evaluate(
        trend=trend, daily=daily, m30=m30, levels=[level],
        symbol="EURUSD", asset_class="forex", last_price=100.5,
    )
    assert sig.state == "buy"
    assert trade is not None
    assert abs(trade.stop - (99.8 - 0.00035)) < 1e-6  # breakout low minus 3.5 pips
    expected_target = 100.5 + 3 * (100.5 - trade.stop)
    assert abs(trade.target - expected_target) < 1e-6
    assert sig.confirmations["trend_up"] and sig.confirmations["daily_bullish"]


def test_signal_blocked_when_not_uptrend():
    level, daily, m30 = _buy_scenario()
    sig, trade = evaluate(
        trend=Trend("range", 0.4, []), daily=daily, m30=m30, levels=[level],
        symbol="EURUSD", asset_class="forex", last_price=100.5,
    )
    assert sig.state == "no_trade" and trade is None


def test_signal_blocked_when_prev_30m_bearish():
    level, daily, _ = _buy_scenario()
    prev30 = cf(0, 99.6, 98.9, close=99.5, open_=99.7)  # bearish
    last30 = cf(1, 100.6, 99.8, close=100.5, open_=100.0)
    sig, trade = evaluate(
        trend=Trend("up", 0.85, []), daily=daily, m30=[prev30, last30], levels=[level],
        symbol="EURUSD", asset_class="forex", last_price=100.5,
    )
    assert sig.state == "no_trade"
    assert "30m" in sig.reason


def test_signal_blocked_when_daily_bearish():
    level, _, m30 = _buy_scenario()
    daily = [cf(0, 96, 90, close=91, open_=95)]  # bearish
    sig, _trade = evaluate(
        trend=Trend("up", 0.85, []), daily=daily, m30=m30, levels=[level],
        symbol="EURUSD", asset_class="forex", last_price=100.5,
    )
    assert sig.state == "no_trade" and "daily" in sig.reason


# --------------------------------------------------------------------------- #
# Pips
# --------------------------------------------------------------------------- #
def test_pip_sizes():
    assert pip_size("EURUSD", "forex") == 0.0001
    assert pip_size("USDJPY", "forex") == 0.01
    assert pip_size("BTCUSDT", "crypto") is None
    assert pips_to_price(10, "EURUSD", "forex", 1.08) == 0.001
    assert pips_to_price(10, "BTCUSDT", "crypto", 60000) == 0.0005 * 60000


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
