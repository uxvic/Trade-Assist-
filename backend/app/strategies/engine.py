"""Top-level analyzer: fetch the multi-timeframe candle set, run the pipeline,
return an :class:`Analysis`. Drops the forming candle of each series so the
detection layer only ever reads closed bars (no look-ahead)."""

from __future__ import annotations

import asyncio
import time

from app.data.providers.base import Candle, MarketDataProvider, Timeframe
from app.strategies.levels import detect_all_levels
from app.strategies.signal import evaluate
from app.strategies.trend import classify_trend
from app.strategies.types import Analysis, CandleF, Trend

# Candle counts per timeframe (enough history for levels/trend without hammering feeds).
_TF_LIMITS: dict[Timeframe, int] = {
    Timeframe.MN1: 36,
    Timeframe.D1: 250,
    Timeframe.H4: 180,
    Timeframe.H1: 200,
    Timeframe.M30: 60,
}
_TF_KEY = {Timeframe.MN1: "1M", Timeframe.D1: "1d", Timeframe.H4: "4h", Timeframe.H1: "1h"}


def _to_candlef(candles: list[Candle], drop_forming: bool = True) -> list[CandleF]:
    rows = candles[:-1] if (drop_forming and candles) else candles
    return [
        CandleF(
            ts=int(c.ts.timestamp()),
            open=float(c.open),
            high=float(c.high),
            low=float(c.low),
            close=float(c.close),
            volume=float(c.volume),
        )
        for c in rows
    ]


async def analyze(symbol: str, asset_class: str, provider: MarketDataProvider) -> Analysis:
    tfs = [Timeframe.MN1, Timeframe.D1, Timeframe.H4, Timeframe.H1, Timeframe.M30]
    results = await asyncio.gather(
        *[provider.get_candles(symbol, tf, _TF_LIMITS[tf]) for tf in tfs],
        return_exceptions=True,
    )
    sets: dict[Timeframe, list[CandleF]] = {}
    for tf, res in zip(tfs, results, strict=False):
        sets[tf] = [] if isinstance(res, BaseException) else _to_candlef(res)

    m30 = sets[Timeframe.M30]
    daily = sets[Timeframe.D1]
    last_price = m30[-1].close if m30 else (daily[-1].close if daily else 0.0)

    candle_sets = {key: sets[tf] for tf, key in _TF_KEY.items()}
    levels = detect_all_levels(candle_sets, last_price) if last_price else []
    trend = classify_trend(daily) if daily else Trend("range", 0.0, [], None, None)
    signal, proposed = evaluate(
        trend=trend,
        daily=daily,
        m30=m30,
        levels=levels,
        symbol=symbol,
        asset_class=asset_class,
        last_price=last_price,
    )

    return Analysis(
        symbol=symbol,
        asset_class=asset_class,
        as_of=int(time.time()),
        current_price=last_price,
        trend=trend,
        levels=levels,
        signal=signal,
        proposed_trade=proposed,
    )
