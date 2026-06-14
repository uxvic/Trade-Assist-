"""Cluster pivots into support/resistance levels, score strength, merge across TFs."""

from __future__ import annotations

from app.strategies.pivots import find_pivots
from app.strategies.types import CandleF, Level, Pivot

# Per-timeframe pivot sensitivity (bars left/right) and strength weight.
PARAMS: dict[str, tuple[int, int]] = {"1M": (2, 2), "1d": (3, 3), "4h": (3, 3), "1h": (3, 3)}
TF_WEIGHT: dict[str, float] = {"1M": 1.0, "1d": 0.7, "4h": 0.45, "1h": 0.25}


def _atr(candles: list[CandleF], period: int = 14) -> float:
    if len(candles) < 2:
        return 0.0
    trs = []
    for i in range(1, len(candles)):
        h, low, prev_close = candles[i].high, candles[i].low, candles[i - 1].close
        trs.append(max(h - low, abs(h - prev_close), abs(low - prev_close)))
    period = min(period, len(trs))
    return sum(trs[-period:]) / period if period else 0.0


def _cluster(pivots: list[Pivot], threshold: float) -> list[list[Pivot]]:
    if not pivots:
        return []
    ordered = sorted(pivots, key=lambda p: p.price)
    clusters: list[list[Pivot]] = [[ordered[0]]]
    for p in ordered[1:]:
        mean = sum(x.price for x in clusters[-1]) / len(clusters[-1])
        if abs(p.price - mean) <= threshold:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return clusters


def build_levels(candles: list[CandleF], source_tf: str, last_price: float) -> list[Level]:
    left, right = PARAMS[source_tf]
    if len(candles) < left + right + 2:
        return []
    pivots = find_pivots(candles, left, right)
    if not pivots:
        return []

    threshold = max(0.0015 * last_price, 0.25 * _atr(candles))
    n = len(candles)
    levels: list[Level] = []
    for cluster in _cluster(pivots, threshold):
        price = sum(p.price for p in cluster) / len(cluster)
        touches = len(cluster)
        last_idx = max(p.index for p in cluster)
        recency = 1.0 if (n - last_idx) <= 20 else 0.3
        strength = (
            0.5 * TF_WEIGHT[source_tf] + 0.3 * (min(touches, 4) / 4) + 0.2 * recency
        )
        ltype = "support" if price < last_price else "resistance"
        levels.append(
            Level(
                price=price,
                type=ltype,
                strength=min(strength, 1.0),
                source_tf=source_tf,
                touches=touches,
                last_touch_ts=max(p.ts for p in cluster),
            )
        )
    return levels


def detect_all_levels(candle_sets: dict[str, list[CandleF]], last_price: float) -> list[Level]:
    """Run the pipeline per timeframe (Monthly→1H) and merge across TFs — when a
    higher-TF and lower-TF level coincide, the stronger (higher-TF) one wins."""
    collected: list[Level] = []
    for tf in ("1M", "1d", "4h", "1h"):
        if candle_sets.get(tf):
            collected += build_levels(candle_sets[tf], tf, last_price)

    collected.sort(key=lambda lv: TF_WEIGHT[lv.source_tf], reverse=True)
    merge_threshold = 0.0015 * last_price
    merged: list[Level] = []
    for lv in collected:
        dup = next((m for m in merged if abs(m.price - lv.price) <= merge_threshold), None)
        if dup:
            dup.touches += lv.touches
        else:
            merged.append(lv)
    merged.sort(key=lambda lv: lv.price)
    return merged
