"""Swing-high / swing-low (pivot) detection.

A pivot needs ``right`` *closed* bars after it to be confirmed — so the forming
(latest) candle can never be a pivot. That is the core no-look-ahead guarantee.
"""

from __future__ import annotations

from app.strategies.types import CandleF, Pivot


def _is_swing_high(candles: list[CandleF], i: int, left: int, right: int) -> bool:
    h = candles[i].high
    for j in range(i - left, i):
        if candles[j].high >= h:
            return False
    for j in range(i + 1, i + right + 1):
        if candles[j].high > h:
            return False
    return True


def _is_swing_low(candles: list[CandleF], i: int, left: int, right: int) -> bool:
    low = candles[i].low
    for j in range(i - left, i):
        if candles[j].low <= low:
            return False
    for j in range(i + 1, i + right + 1):
        if candles[j].low < low:
            return False
    return True


def find_pivots(candles: list[CandleF], left: int, right: int) -> list[Pivot]:
    """Return confirmed swing highs and lows. ``i`` only ranges where ``right``
    closed bars exist after it (no look-ahead)."""
    out: list[Pivot] = []
    n = len(candles)
    for i in range(left, n - right):
        c = candles[i]
        if _is_swing_high(candles, i, left, right):
            out.append(Pivot(i, c.ts, c.high, "high"))
        if _is_swing_low(candles, i, left, right):
            out.append(Pivot(i, c.ts, c.low, "low"))
    return out
