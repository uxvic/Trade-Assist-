"""In-memory paper-trading engine.

A deterministic simulator that prices orders against **real live market data**
(fed in via :meth:`PaperBroker.update_price`) but never touches real money.

Design notes
------------
* Money and quantities are :class:`~decimal.Decimal` throughout.
* Market orders fill immediately at the latest price plus modeled slippage.
* Limit / stop orders rest ``PENDING`` and are evaluated by ``update_price``
  using only prices *at or after* the order was placed (no look-ahead bias).
* Every accepted order is run through the deterministic risk gate
  (:func:`app.risk.limits.assess_order`) before it can fill.
"""

from __future__ import annotations

from decimal import Decimal

from app.brokers.base import BrokerInterface
from app.domain.enums import OrderSide, OrderStatus, OrderType
from app.domain.trading import (
    AccountState,
    Fill,
    Order,
    OrderRequest,
    Position,
    utcnow,
)
from app.risk.limits import RiskLimits, assess_order

ZERO = Decimal("0")


def _dec(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


class FillModel:
    """Models execution friction: slippage on market fills and trading fees.

    Both are expressed in basis points (1 bp = 0.01%). Defaults are deliberately
    crypto-ish; per-asset-class schedules can be layered on later.
    """

    def __init__(self, slippage_bps: Decimal | int | str = 5, fee_bps: Decimal | int | str = 10):
        self.slippage_bps = _dec(slippage_bps)
        self.fee_bps = _dec(fee_bps)

    def fill_price(self, ref_price: Decimal, side: OrderSide) -> Decimal:
        slip = ref_price * self.slippage_bps / Decimal("10000")
        return ref_price + slip if side == OrderSide.BUY else ref_price - slip

    def fee(self, notional: Decimal) -> Decimal:
        return abs(notional) * self.fee_bps / Decimal("10000")


class PaperBroker(BrokerInterface):
    def __init__(
        self,
        account_id: str = "paper-account",
        starting_cash: Decimal | int | str = 100_000,
        base_currency: str = "USD",
        fill_model: FillModel | None = None,
        risk_limits: RiskLimits | None = None,
    ):
        self.account_id = account_id
        self.base_currency = base_currency
        self.cash = _dec(starting_cash)
        self.fill_model = fill_model or FillModel()
        self.risk_limits = risk_limits or RiskLimits()
        self._positions: dict[str, Position] = {}
        self._orders: dict[str, Order] = {}
        self._fills: list[Fill] = []
        self._last_prices: dict[str, Decimal] = {}

    # ------------------------------------------------------------------ #
    # Market-data feed (called by the ingestion layer / tests)
    # ------------------------------------------------------------------ #
    def update_price(self, symbol: str, price: Decimal | int | str) -> list[Fill]:
        """Record the latest price for ``symbol`` and return any new fills.

        Updating the price marks open positions to market and may trigger
        resting limit/stop orders.
        """
        price = _dec(price)
        self._last_prices[symbol] = price
        if symbol in self._positions:
            self._positions[symbol].market_price = price
        return self._process_pending(symbol, price)

    def _last(self, symbol: str) -> Decimal | None:
        return self._last_prices.get(symbol)

    # ------------------------------------------------------------------ #
    # BrokerInterface
    # ------------------------------------------------------------------ #
    async def place_order(self, request: OrderRequest) -> Order:
        ref_price = self._reference_price(request)
        qty = self._resolve_qty(request, ref_price)
        order = Order(
            symbol=request.symbol,
            side=request.side,
            type=request.type,
            qty=qty,
            account_id=self.account_id,
            limit_price=request.limit_price,
            stop_price=request.stop_price,
            tif=request.tif,
        )
        self._orders[order.id] = order

        # A market order with no price data cannot be assessed or filled.
        if request.type == OrderType.MARKET and ref_price is None:
            return self._reject(order, "No market data available for this symbol yet.")

        assessment = self._assess(request.symbol, request.side, qty, ref_price or ZERO)
        order.risk_assessment = assessment.to_dict()
        if not assessment.passed:
            return self._reject(order, "; ".join(assessment.reasons))

        if request.type == OrderType.MARKET:
            self._execute(order, ref_price)  # type: ignore[arg-type]
        else:
            # Limit / stop orders rest, then try to trigger against the last price.
            order.status = OrderStatus.PENDING
            last = self._last(request.symbol)
            if last is not None:
                self._maybe_trigger(order, last)
        return order

    async def cancel_order(self, order_id: str) -> Order:
        order = self._orders.get(order_id)
        if order is None:
            raise KeyError(f"Unknown order {order_id}")
        if order.status == OrderStatus.PENDING:
            order.status = OrderStatus.CANCELLED
            order.updated_at = utcnow()
        return order

    async def get_order(self, order_id: str) -> Order | None:
        return self._orders.get(order_id)

    async def get_orders(self) -> list[Order]:
        return sorted(self._orders.values(), key=lambda o: o.created_at, reverse=True)

    async def get_positions(self) -> list[Position]:
        return [p for p in self._positions.values() if p.qty != ZERO]

    async def get_position(self, symbol: str) -> Position | None:
        pos = self._positions.get(symbol)
        return pos if pos and pos.qty != ZERO else None

    async def get_account(self) -> AccountState:
        equity = self._equity()
        return AccountState(
            account_id=self.account_id,
            cash=self.cash,
            equity=equity,
            buying_power=self.cash,  # no margin in v1
            currency=self.base_currency,
        )

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    def _reference_price(self, request: OrderRequest) -> Decimal | None:
        """The price used for sizing and risk assessment before execution."""
        if request.type == OrderType.MARKET:
            return self._last(request.symbol)
        if request.type == OrderType.LIMIT:
            return request.limit_price
        return request.stop_price  # STOP / STOP_LIMIT

    def _resolve_qty(self, request: OrderRequest, ref_price: Decimal | None) -> Decimal:
        if request.qty is not None:
            return request.qty
        if not ref_price or ref_price == ZERO:
            return ZERO
        return request.notional / ref_price  # type: ignore[operator]

    def _assess(self, symbol: str, side: OrderSide, qty: Decimal, ref_price: Decimal):
        existing_qty = self._positions[symbol].qty if symbol in self._positions else ZERO
        notional = qty * ref_price
        fee = self.fill_model.fee(notional)
        return assess_order(
            self.risk_limits,
            side=side,
            qty=qty,
            price=ref_price,
            equity=self._equity(),
            existing_qty=existing_qty,
            cash=self.cash,
            fee=fee,
        )

    def _reject(self, order: Order, reason: str) -> Order:
        order.status = OrderStatus.REJECTED
        order.reject_reason = reason
        order.updated_at = utcnow()
        return order

    def _execute(self, order: Order, ref_price: Decimal, apply_slippage: bool = True) -> None:
        """Fill an order in full at ``ref_price`` (with optional slippage)."""
        fill_price = (
            self.fill_model.fill_price(ref_price, order.side) if apply_slippage else ref_price
        )
        notional = order.qty * fill_price
        fee = self.fill_model.fee(notional)

        if order.side == OrderSide.BUY:
            cost = notional + fee
            if cost > self.cash:
                self._reject(order, "Insufficient cash at execution price.")
                return
            self.cash -= cost
            self._apply_buy(order.symbol, order.qty, fill_price)
        else:
            pos = self._positions.get(order.symbol)
            if pos is None or pos.qty < order.qty:
                self._reject(order, "Insufficient position to sell at execution.")
                return
            self.cash += notional - fee
            self._apply_sell(order.symbol, order.qty, fill_price)

        slippage = abs(fill_price - ref_price) * order.qty
        fill = Fill(order_id=order.id, qty=order.qty, price=fill_price, fee=fee, slippage=slippage)
        self._fills.append(fill)
        order.fills.append(fill)
        order.filled_qty = order.qty
        order.avg_fill_price = fill_price
        order.status = OrderStatus.FILLED
        order.updated_at = utcnow()

    def _apply_buy(self, symbol: str, qty: Decimal, price: Decimal) -> None:
        pos = self._positions.get(symbol)
        if pos is None:
            pos = Position(symbol=symbol)
            self._positions[symbol] = pos
        new_qty = pos.qty + qty
        pos.avg_cost = (pos.qty * pos.avg_cost + qty * price) / new_qty
        pos.qty = new_qty
        pos.market_price = self._last_prices.get(symbol, price)

    def _apply_sell(self, symbol: str, qty: Decimal, price: Decimal) -> None:
        pos = self._positions[symbol]
        pos.realized_pnl += (price - pos.avg_cost) * qty
        pos.qty -= qty
        pos.market_price = self._last_prices.get(symbol, price)
        if pos.qty == ZERO:
            pos.avg_cost = ZERO

    def _process_pending(self, symbol: str, price: Decimal) -> list[Fill]:
        before = len(self._fills)
        for order in list(self._orders.values()):
            if order.status != OrderStatus.PENDING or order.symbol != symbol:
                continue
            self._maybe_trigger(order, price)
        return self._fills[before:]

    def _maybe_trigger(self, order: Order, price: Decimal) -> None:
        if order.type == OrderType.LIMIT:
            crossed = (
                order.side == OrderSide.BUY and price <= order.limit_price  # type: ignore[operator]
            ) or (
                order.side == OrderSide.SELL and price >= order.limit_price  # type: ignore[operator]
            )
            if crossed:
                # A limit order fills at its limit price (price guarantee), no slippage.
                self._execute(order, order.limit_price, apply_slippage=False)  # type: ignore[arg-type]
        elif order.type == OrderType.STOP:
            triggered = (
                order.side == OrderSide.BUY and price >= order.stop_price  # type: ignore[operator]
            ) or (
                order.side == OrderSide.SELL and price <= order.stop_price  # type: ignore[operator]
            )
            if triggered:
                # A stop becomes a market order once triggered → slippage applies.
                self._execute(order, price, apply_slippage=True)

    def _equity(self) -> Decimal:
        market_value = sum((p.qty * p.market_price for p in self._positions.values()), ZERO)
        return self.cash + market_value
