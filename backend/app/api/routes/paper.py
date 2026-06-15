"""Paper-trading endpoints backed by the in-memory engine.

``POST /api/paper/price`` exists so the loop can be driven without a live feed
attached (handy for local testing and demos); in normal operation the ingestion
worker feeds prices into the same broker.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter

from app.api.schemas import (
    AccountResponse,
    OrderResponse,
    PlaceOrderRequest,
    PositionResponse,
    PriceUpdate,
)
from app.auth.deps import CurrentUser
from app.domain.enums import OrderSide, OrderType
from app.domain.trading import Order, OrderRequest
from app.runtime import get_broker, get_data_provider, reset_broker, save_user_broker

router = APIRouter(prefix="/api/paper", tags=["paper-trading"])


def _infer_asset_class(symbol: str) -> str:
    """Crypto pairs in our universe quote in USDT; everything else is forex."""
    return "crypto" if symbol.upper().endswith("USDT") else "forex"


async def _refresh_price(broker, symbol: str, asset_class: str) -> None:
    """Pull the latest live price so paper orders fill at the real market price.

    Network/upstream errors are swallowed: if no price is available the engine
    will reject the order with a friendly "no market data" message, which the UI
    surfaces — far better than a 500.
    """
    try:
        quote = await get_data_provider(asset_class).get_quote(symbol)
        broker.update_price(symbol, quote.last)
    except Exception:  # noqa: BLE001
        pass


def _order_to_response(order: Order) -> OrderResponse:
    return OrderResponse(
        id=order.id,
        symbol=order.symbol,
        side=order.side.value,
        type=order.type.value,
        qty=order.qty,
        status=order.status.value,
        filled_qty=order.filled_qty,
        avg_fill_price=order.avg_fill_price,
        reject_reason=order.reject_reason,
        risk_assessment=order.risk_assessment,
    )


@router.post("/price")
async def update_price(update: PriceUpdate, user_id: CurrentUser) -> dict:
    fills = get_broker(user_id).update_price(update.symbol, update.price)
    return {"symbol": update.symbol, "price": str(update.price), "triggered_fills": len(fills)}


@router.post("/orders", response_model=OrderResponse)
async def place_order(req: PlaceOrderRequest, user_id: CurrentUser) -> OrderResponse:
    broker = get_broker(user_id)
    # Price the order off the live market before it touches the engine.
    await _refresh_price(broker, req.symbol, req.asset_class)
    order = await broker.place_order(
        OrderRequest(
            symbol=req.symbol,
            side=OrderSide(req.side),
            type=OrderType(req.type),
            qty=Decimal(req.qty) if req.qty is not None else None,
            notional=Decimal(req.notional) if req.notional is not None else None,
            limit_price=Decimal(req.limit_price) if req.limit_price is not None else None,
            stop_price=Decimal(req.stop_price) if req.stop_price is not None else None,
        )
    )
    save_user_broker(user_id)
    return _order_to_response(order)


@router.get("/orders", response_model=list[OrderResponse])
async def list_orders(user_id: CurrentUser) -> list[OrderResponse]:
    return [_order_to_response(o) for o in await get_broker(user_id).get_orders()]


@router.get("/account", response_model=AccountResponse)
async def account(user_id: CurrentUser) -> AccountResponse:
    a = await get_broker(user_id).get_account()
    return AccountResponse(
        account_id=a.account_id,
        cash=a.cash,
        equity=a.equity,
        buying_power=a.buying_power,
        currency=a.currency,
    )


@router.get("/positions", response_model=list[PositionResponse])
async def positions(user_id: CurrentUser) -> list[PositionResponse]:
    broker = get_broker(user_id)
    # Mark open positions to the latest live price so P&L is current.
    for pos in await broker.get_positions():
        await _refresh_price(broker, pos.symbol, _infer_asset_class(pos.symbol))
    return [
        PositionResponse(
            symbol=p.symbol,
            qty=p.qty,
            avg_cost=p.avg_cost,
            market_price=p.market_price,
            unrealized_pnl=p.unrealized_pnl,
            realized_pnl=p.realized_pnl,
        )
        for p in await broker.get_positions()
    ]


@router.post("/reset")
async def reset(user_id: CurrentUser) -> dict:
    """Start over with a fresh practice account."""
    broker = reset_broker(user_id)
    account = await broker.get_account()
    return {"status": "reset", "cash": str(account.cash)}
