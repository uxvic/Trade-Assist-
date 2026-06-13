"""Core trading value objects (orders, fills, positions, quotes, accounts).

All monetary and quantity values are :class:`~decimal.Decimal` — never floats —
to avoid rounding drift in P&L accounting.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from app.domain.enums import OrderSide, OrderStatus, OrderType, TimeInForce


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def _dec(value) -> Decimal:
    """Coerce ints/strings/Decimals to Decimal without going through float."""
    return value if isinstance(value, Decimal) else Decimal(str(value))


@dataclass
class Quote:
    """A point-in-time price snapshot for a symbol."""

    symbol: str
    last: Decimal
    bid: Decimal | None = None
    ask: Decimal | None = None
    ts: datetime = field(default_factory=utcnow)


@dataclass
class OrderRequest:
    """An instruction to trade, before it becomes a tracked :class:`Order`.

    Supply exactly one of ``qty`` (units) or ``notional`` (cash amount, e.g.
    "buy $100 of BTC"). The engine converts notional to quantity at the
    reference price.
    """

    symbol: str
    side: OrderSide
    type: OrderType = OrderType.MARKET
    qty: Decimal | None = None
    notional: Decimal | None = None
    limit_price: Decimal | None = None
    stop_price: Decimal | None = None
    tif: TimeInForce = TimeInForce.GTC

    def __post_init__(self) -> None:
        if self.qty is None and self.notional is None:
            raise ValueError("OrderRequest requires either qty or notional")
        if self.qty is not None:
            self.qty = _dec(self.qty)
        if self.notional is not None:
            self.notional = _dec(self.notional)
        if self.limit_price is not None:
            self.limit_price = _dec(self.limit_price)
        if self.stop_price is not None:
            self.stop_price = _dec(self.stop_price)
        if self.type in (OrderType.LIMIT, OrderType.STOP_LIMIT) and self.limit_price is None:
            raise ValueError(f"{self.type.value} order requires limit_price")
        if self.type in (OrderType.STOP, OrderType.STOP_LIMIT) and self.stop_price is None:
            raise ValueError(f"{self.type.value} order requires stop_price")


@dataclass
class Fill:
    """An immutable execution record. Fills are append-only (audit + journal)."""

    order_id: str
    qty: Decimal
    price: Decimal
    fee: Decimal
    slippage: Decimal = Decimal("0")
    id: str = field(default_factory=lambda: new_id("fill"))
    ts: datetime = field(default_factory=utcnow)


@dataclass
class Order:
    symbol: str
    side: OrderSide
    type: OrderType
    qty: Decimal
    account_id: str
    id: str = field(default_factory=lambda: new_id("ord"))
    status: OrderStatus = OrderStatus.PENDING
    filled_qty: Decimal = Decimal("0")
    avg_fill_price: Decimal | None = None
    limit_price: Decimal | None = None
    stop_price: Decimal | None = None
    tif: TimeInForce = TimeInForce.GTC
    reject_reason: str | None = None
    risk_assessment: dict | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
    fills: list[Fill] = field(default_factory=list)


@dataclass
class Position:
    symbol: str
    qty: Decimal = Decimal("0")
    avg_cost: Decimal = Decimal("0")
    realized_pnl: Decimal = Decimal("0")
    market_price: Decimal = Decimal("0")

    @property
    def market_value(self) -> Decimal:
        return self.qty * self.market_price

    @property
    def unrealized_pnl(self) -> Decimal:
        return (self.market_price - self.avg_cost) * self.qty


@dataclass
class AccountState:
    account_id: str
    cash: Decimal
    equity: Decimal
    buying_power: Decimal
    currency: str = "USD"
