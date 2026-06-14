"""Forex market data via Yahoo Finance (yfinance) — no API key required.

yfinance is unofficial and best-effort; perfectly fine for a personal learning
demo. A licensed feed (e.g. Twelve Data) can replace this behind
``MarketDataProvider`` with no UI change. yfinance is blocking, so calls run in
a worker thread. ``yfinance``/``pandas`` are imported lazily.
"""

from __future__ import annotations

import asyncio
from datetime import UTC
from decimal import Decimal

from app.data.providers.base import Candle, InstrumentInfo, MarketDataProvider, Timeframe
from app.domain.enums import AssetClass
from app.domain.trading import Quote

# Trade-Assist timeframe -> yfinance interval. yfinance has no native 4h, so it
# falls back to 1h (good enough for a demo; a licensed feed fixes this).
_INTERVALS = {
    Timeframe.M1: "1m",
    Timeframe.M5: "5m",
    Timeframe.M15: "15m",
    Timeframe.M30: "30m",
    Timeframe.H1: "60m",
    Timeframe.H4: "60m",
    Timeframe.D1: "1d",
}
# How much history to request per interval (yfinance caps intraday lookback).
_PERIODS = {"1m": "5d", "5m": "60d", "15m": "60d", "30m": "60d", "60m": "60d", "1d": "2y"}

FOREX_PAIRS: list[tuple[str, str]] = [
    ("EURUSD", "Euro / US Dollar"),
    ("GBPUSD", "British Pound / US Dollar"),
    ("USDJPY", "US Dollar / Japanese Yen"),
    ("USDCHF", "US Dollar / Swiss Franc"),
    ("USDCAD", "US Dollar / Canadian Dollar"),
    ("AUDUSD", "Australian Dollar / US Dollar"),
    ("NZDUSD", "New Zealand Dollar / US Dollar"),
    ("EURGBP", "Euro / British Pound"),
    ("EURJPY", "Euro / Japanese Yen"),
    ("GBPJPY", "British Pound / Japanese Yen"),
    ("EURCHF", "Euro / Swiss Franc"),
    ("AUDJPY", "Australian Dollar / Japanese Yen"),
    ("EURAUD", "Euro / Australian Dollar"),
    ("GBPCHF", "British Pound / Swiss Franc"),
    ("CADJPY", "Canadian Dollar / Japanese Yen"),
    ("NZDJPY", "New Zealand Dollar / Japanese Yen"),
    ("EURCAD", "Euro / Canadian Dollar"),
    ("AUDNZD", "Australian Dollar / New Zealand Dollar"),
    ("GBPCAD", "British Pound / Canadian Dollar"),
    ("USDSGD", "US Dollar / Singapore Dollar"),
    ("XAUUSD", "Gold / US Dollar"),
]


def _yahoo_ticker(symbol: str) -> str:
    s = symbol.upper().replace("/", "")
    if s == "XAUUSD":
        return "GC=F"  # gold futures
    return f"{s}=X"


def _pretty(symbol: str) -> str:
    s = symbol.upper().replace("/", "")
    return f"{s[:3]}/{s[3:]}" if len(s) == 6 else s


class ForexProvider(MarketDataProvider):
    asset_classes = (AssetClass.FOREX,)
    supports_streaming = False

    def __init__(self, timeout: float = 12.0):
        self.timeout = timeout

    async def get_quote(self, symbol: str) -> Quote:
        last = await asyncio.to_thread(self._last_price, symbol)
        return Quote(symbol=symbol.upper(), last=last, bid=last, ask=last)

    def _last_price(self, symbol: str) -> Decimal:
        import yfinance as yf

        hist = yf.Ticker(_yahoo_ticker(symbol)).history(period="1d", interval="1m")
        if hist.empty:
            raise RuntimeError(f"No data for {symbol}")
        return Decimal(str(hist["Close"].iloc[-1]))

    async def get_candles(
        self, symbol: str, timeframe: Timeframe = Timeframe.M1, limit: int = 200
    ) -> list[Candle]:
        return await asyncio.to_thread(self._history, symbol, timeframe, limit)

    def _history(self, symbol: str, timeframe: Timeframe, limit: int) -> list[Candle]:
        import yfinance as yf

        interval = _INTERVALS[timeframe]
        period = _PERIODS.get(interval, "60d")
        df = yf.Ticker(_yahoo_ticker(symbol)).history(period=period, interval=interval)
        if df.empty:
            return []
        df = df.tail(limit)

        candles: list[Candle] = []
        for ts, row in df.iterrows():
            dt = ts.to_pydatetime()
            dt = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
            candles.append(
                Candle(
                    symbol=symbol.upper(),
                    ts=dt,
                    open=Decimal(str(row["Open"])),
                    high=Decimal(str(row["High"])),
                    low=Decimal(str(row["Low"])),
                    close=Decimal(str(row["Close"])),
                    volume=Decimal(str(row.get("Volume", 0) or 0)),
                    timeframe=timeframe,
                )
            )
        return candles

    async def search_instruments(self, query: str = "", limit: int = 30) -> list[InstrumentInfo]:
        q = query.strip().upper().replace("/", "")
        out: list[InstrumentInfo] = []
        for sym, name in FOREX_PAIRS:
            if q and q not in sym and q not in name.upper():
                continue
            out.append(
                InstrumentInfo(symbol=sym, name=name, ticker=_pretty(sym), asset_class="forex")
            )
            if len(out) >= limit:
                break
        return out
