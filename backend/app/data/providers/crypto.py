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

from app.data.providers.base import Candle, MarketDataProvider, Timeframe, Trade
from app.domain.enums import AssetClass
from app.domain.trading import Quote

_TF_MAP = {
    Timeframe.M1: "1m",
    Timeframe.M5: "5m",
    Timeframe.M15: "15m",
    Timeframe.H1: "1h",
    Timeframe.H4: "4h",
    Timeframe.D1: "1d",
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
