"""The 30m breakout entry with all of her confirmations.

Evaluation is fail-fast and reads only *closed* candles (the engine drops the
forming candle before calling here): trend up → previous daily bullish → a 30m
candle closes above a strong level → previous 30m bullish → news clear. Then:
stop = breakout-candle low − pip buffer, target = entry + 3R, exit by EOD.
"""

from __future__ import annotations

from app.strategies.levels import TF_WEIGHT
from app.strategies.news import is_blackout
from app.strategies.pips import pips_to_price
from app.strategies.types import CandleF, Level, ProposedTrade, Signal, Trend


def evaluate(
    *,
    trend: Trend,
    daily: list[CandleF],
    m30: list[CandleF],
    levels: list[Level],
    symbol: str,
    asset_class: str,
    last_price: float,
) -> tuple[Signal, ProposedTrade | None]:
    conf = {
        "trend_up": False,
        "daily_bullish": False,
        "prev_30m_bullish": False,
        "news_clear": False,
    }

    if not (trend.direction == "up" and trend.confidence >= 0.5):
        return Signal("no_trade", "Not a clear uptrend — standing down", None, conf), None
    conf["trend_up"] = True

    if not daily or not (daily[-1].close > daily[-1].open):
        return Signal("no_trade", "Previous daily candle didn't close bullish", None, conf), None
    conf["daily_bullish"] = True

    if len(m30) < 2:
        return Signal("no_trade", "Not enough 30m data", None, conf), None
    last30, prev30 = m30[-1], m30[-2]

    # A 30m candle closed above a strong level that the prior candle was below.
    broken = [
        lv
        for lv in levels
        if lv.strength >= 0.4 and prev30.close <= lv.price < last30.close
    ]
    if not broken:
        return Signal("no_trade", "No key level broken on the 30m", None, conf), None
    level = max(broken, key=lambda lv: (TF_WEIGHT.get(lv.source_tf, 0.0), lv.strength))

    if not (prev30.close > prev30.open):
        return Signal("no_trade", "Previous 30m candle didn't close bullish", level, conf), None
    conf["prev_30m_bullish"] = True

    if is_blackout(symbol):
        return Signal("no_trade", "High-impact news window — staying out", level, conf), None
    conf["news_clear"] = True

    entry = last_price
    buffer = pips_to_price(3.5, symbol, asset_class, last_price)
    stop = last30.low - buffer
    risk = entry - stop
    if risk <= 0:
        return Signal("no_trade", "Stop would be above entry — invalid", level, conf), None
    target = entry + 3 * risk

    rationale = (
        f"Uptrend; previous daily closed bullish; a 30m candle closed above the "
        f"{level.source_tf} level near {level.price:.5g}. Stop under the breakout candle "
        f"({stop:.5g}), target at 1:3 ({target:.5g})."
    )
    proposed = ProposedTrade(
        symbol=symbol,
        asset_class=asset_class,
        entry=entry,
        stop=stop,
        target=target,
        risk_per_unit=risk,
        rationale=rationale,
    )
    return Signal("buy", rationale, level, conf), proposed
