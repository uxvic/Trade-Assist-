"""Enumerations shared across the trading domain."""

from __future__ import annotations

from enum import StrEnum


class AssetClass(StrEnum):
    CRYPTO = "crypto"
    EQUITY = "equity"
    ETF = "etf"
    FOREX = "forex"


class OrderSide(StrEnum):
    BUY = "buy"
    SELL = "sell"


class OrderType(StrEnum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderStatus(StrEnum):
    PENDING = "pending"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class TimeInForce(StrEnum):
    GTC = "gtc"
    DAY = "day"


class BrokerType(StrEnum):
    """Which execution backend an account is wired to.

    Only ``PAPER`` has a code path in v1. ``ALPACA_PAPER`` / ``ALPACA_LIVE`` are
    reserved for a later, opt-in phase and intentionally have no implementation
    yet — real money is never the default.
    """

    PAPER = "paper"
    ALPACA_PAPER = "alpaca_paper"
    ALPACA_LIVE = "alpaca_live"
