"""Daily trend classification — structure (HH/HL) AND moving-average slope must
agree before we call it an uptrend (the buys-only gate)."""

from __future__ import annotations

from app.strategies.pivots import find_pivots
from app.strategies.types import CandleF, Trend


def sma(values: list[float], n: int) -> float | None:
    if len(values) < n:
        return None
    return sum(values[-n:]) / n


def ema(values: list[float], n: int) -> float | None:
    if len(values) < n:
        return None
    k = 2 / (n + 1)
    e = sum(values[:n]) / n
    for v in values[n:]:
        e = v * k + e * (1 - k)
    return e


def classify_trend(daily: list[CandleF]) -> Trend:
    closes = [c.close for c in daily]
    if len(closes) < 10:
        return Trend("range", 0.2, ["Not enough daily history to read the trend"], None, None)

    ma50 = ema(closes, 50)
    ma200 = sma(closes, 200)
    reasons: list[str] = []

    # --- structure: higher highs & higher lows? ---
    pivots = find_pivots(daily, 3, 3)
    highs = [p for p in pivots if p.kind == "high"][-2:]
    lows = [p for p in pivots if p.kind == "low"][-2:]
    structure = "range"
    if len(highs) == 2 and len(lows) == 2:
        if highs[1].price > highs[0].price and lows[1].price > lows[0].price:
            structure = "up"
            reasons.append("Higher highs and higher lows on the daily")
        elif highs[1].price < highs[0].price and lows[1].price < lows[0].price:
            structure = "down"
            reasons.append("Lower highs and lower lows on the daily")

    # --- moving-average slope ---
    last = closes[-1]
    ma_up = ma50 is not None and last > ma50 and (ma200 is None or ma50 > ma200)
    slope_up = False
    if len(closes) >= 60 and ma50 is not None:
        prev_ma50 = ema(closes[:-10], 50)
        slope_up = prev_ma50 is not None and ma50 > prev_ma50
    if ma_up and slope_up:
        reasons.append("Price above a rising 50-EMA")

    direction, confidence = "range", 0.4
    if structure == "up" and ma_up and slope_up:
        direction, confidence = "up", 0.85
    elif structure == "down" and not ma_up:
        direction, confidence = "down", 0.8
        if "Lower highs and lower lows on the daily" not in reasons:
            reasons.append("Price below the 50-EMA")

    return Trend(direction, confidence, reasons, ma50, ma200)
