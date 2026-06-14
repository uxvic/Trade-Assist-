"""Crypto market data via Binance public endpoints (free, no API key).

REST is used for quotes and historical candles; the public WebSocket stream
provides real-time trades. ``httpx`` and ``websockets`` are imported lazily so
that importing this module never forces those dependencies on code paths (like
the unit-tested engine) that don't need them.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from decimal import Decimal

from app.data.providers.base import (
    Candle,
    InstrumentInfo,
    MarketDataProvider,
    Timeframe,
    Trade,
)
from app.domain.enums import AssetClass
from app.domain.trading import Quote

_TF_MAP = {
    Timeframe.M1: "1m",
    Timeframe.M5: "5m",
    Timeframe.M15: "15m",
    Timeframe.M30: "30m",
    Timeframe.H1: "1h",
    Timeframe.H4: "4h",
    Timeframe.D1: "1d",
    Timeframe.W1: "1w",
    Timeframe.MN1: "1M",
}


class BinanceProvider(MarketDataProvider):
    asset_classes = (AssetClass.CRYPTO,)
    supports_streaming = True

    def __init__(
        self,
        rest_url: str = "https://api.binance.com",
        ws_url: str = "wss://stream.binance.com:9443/stream",
        timeout: float = 10.0,
    ):
        self.rest_url = rest_url.rstrip("/")
        self.ws_url = ws_url
        self.timeout = timeout

    async def get_quote(self, symbol: str) -> Quote:
        import httpx

        sym = symbol.upper()
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.rest_url}/api/v3/ticker/bookTicker", params={"symbol": sym}
            )
            resp.raise_for_status()
            data = resp.json()
        bid = Decimal(data["bidPrice"])
        ask = Decimal(data["askPrice"])
        return Quote(symbol=sym, last=(bid + ask) / 2, bid=bid, ask=ask)

    async def get_candles(
        self, symbol: str, timeframe: Timeframe = Timeframe.M1, limit: int = 200
    ) -> list[Candle]:
        import httpx

        sym = symbol.upper()
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.rest_url}/api/v3/klines",
                params={"symbol": sym, "interval": _TF_MAP[timeframe], "limit": limit},
            )
            resp.raise_for_status()
            rows = resp.json()

        candles: list[Candle] = []
        for row in rows:
            candles.append(
                Candle(
                    symbol=sym,
                    ts=datetime.fromtimestamp(row[0] / 1000, tz=UTC),
                    open=Decimal(row[1]),
                    high=Decimal(row[2]),
                    low=Decimal(row[3]),
                    close=Decimal(row[4]),
                    volume=Decimal(row[5]),
                    timeframe=timeframe,
                )
            )
        return candles

    # Cached USDT spot pairs from Binance exchangeInfo (loaded once per process).
    _pairs_cache: list[dict] | None = None
    _POPULAR = [
        "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX",
        "LINK", "DOT", "MATIC", "LTC", "TRX", "SHIB", "UNI", "ATOM",
    ]

    async def _load_pairs(self) -> list[dict]:
        if BinanceProvider._pairs_cache is not None:
            return BinanceProvider._pairs_cache
        import httpx

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{self.rest_url}/api/v3/exchangeInfo")
            resp.raise_for_status()
            data = resp.json()

        pairs = [
            {"symbol": s["symbol"], "base": s["baseAsset"]}
            for s in data.get("symbols", [])
            if s.get("status") == "TRADING" and s.get("quoteAsset") == "USDT"
        ]
        rank = {b: i for i, b in enumerate(self._POPULAR)}
        pairs.sort(key=lambda p: (rank.get(p["base"], 9_999), p["base"]))
        BinanceProvider._pairs_cache = pairs
        return pairs

    async def search_instruments(self, query: str = "", limit: int = 30) -> list[InstrumentInfo]:
        pairs = await self._load_pairs()
        q = query.strip().upper()
        results: list[InstrumentInfo] = []
        for p in pairs:
            if q and q not in p["symbol"] and q not in p["base"]:
                continue
            results.append(
                InstrumentInfo(
                    symbol=p["symbol"], name=p["base"], ticker=p["base"], asset_class="crypto"
                )
            )
            if len(results) >= limit:
                break
        return results

    async def stream_trades(self, symbols: list[str]) -> AsyncIterator[Trade]:
        import websockets

        streams = "/".join(f"{s.lower()}@trade" for s in symbols)
        url = f"{self.ws_url}?streams={streams}"
        async with websockets.connect(url, ping_interval=20) as ws:
            async for raw in ws:
                msg = json.loads(raw)
                payload = msg.get("data", msg)
                if payload.get("e") != "trade":
                    continue
                yield Trade(
                    symbol=payload["s"],
                    price=Decimal(payload["p"]),
                    size=Decimal(payload["q"]),
                    ts=datetime.fromtimestamp(payload["T"] / 1000, tz=UTC),
                )
