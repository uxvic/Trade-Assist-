"""The market-data provider abstraction."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from app.domain.enums import AssetClass
from app.domain.trading import Quote


class Timeframe(StrEnum):
    M1 = "1m"
    M5 = "5m"
    M15 = "15m"
    M30 = "30m"
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"


@dataclass
class InstrumentInfo:
    """A tradeable instrument, returned by instrument search."""

    symbol: str  # provider symbol, e.g. "BTCUSDT" or "EURUSD"
    name: str  # human name, e.g. "Bitcoin" or "Euro / US Dollar"
    ticker: str  # short display, e.g. "BTC" or "EUR/USD"
    asset_class: str  # "crypto" | "forex"


@dataclass
class Candle:
    symbol: str
    ts: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    timeframe: Timeframe = Timeframe.M1


@dataclass
class Trade:
    symbol: str
    price: Decimal
    size: Decimal
    ts: datetime


class MarketDataProvider(ABC):
    """Read interface for quotes, historical candles, and (optionally) a live
    trade stream. Implementations are responsible for symbol-format mapping and
    honoring upstream rate limits."""

    asset_classes: tuple[AssetClass, ...] = ()
    supports_streaming: bool = False

    @abstractmethod
    async def get_quote(self, symbol: str) -> Quote:
        """Return the latest quote for ``symbol``."""

    @abstractmethod
    async def get_candles(
        self, symbol: str, timeframe: Timeframe = Timeframe.M1, limit: int = 200
    ) -> list[Candle]:
        """Return up to ``limit`` historical OHLCV candles, oldest first."""

    async def search_instruments(self, query: str = "", limit: int = 30) -> list[InstrumentInfo]:
        """Return tradeable instruments matching ``query``. Override per provider."""
        return []

    async def stream_trades(self, symbols: list[str]) -> AsyncIterator[Trade]:
        """Yield live trades for ``symbols``. Override in streaming providers."""
        raise NotImplementedError("This provider does not support streaming")
        yield  # pragma: no cover - makes this an async generator
