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
from app.domain.enums import OrderSide, OrderType
from app.domain.trading import Order, OrderRequest
from app.runtime import get_broker

router = APIRouter(prefix="/api/paper", tags=["paper-trading"])


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
async def update_price(update: PriceUpdate) -> dict:
    fills = get_broker().update_price(update.symbol, update.price)
    return {"symbol": update.symbol, "price": str(update.price), "triggered_fills": len(fills)}


@router.post("/orders", response_model=OrderResponse)
async def place_order(req: PlaceOrderRequest) -> OrderResponse:
    order = await get_broker().place_order(
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
    return _order_to_response(order)


@router.get("/orders", response_model=list[OrderResponse])
async def list_orders() -> list[OrderResponse]:
    return [_order_to_response(o) for o in await get_broker().get_orders()]


@router.get("/account", response_model=AccountResponse)
async def account() -> AccountResponse:
    a = await get_broker().get_account()
    return AccountResponse(
        account_id=a.account_id,
        cash=a.cash,
        equity=a.equity,
        buying_power=a.buying_power,
        currency=a.currency,
    )


@router.get("/positions", response_model=list[PositionResponse])
async def positions() -> list[PositionResponse]:
    return [
        PositionResponse(
            symbol=p.symbol,
            qty=p.qty,
            avg_cost=p.avg_cost,
            market_price=p.market_price,
            unrealized_pnl=p.unrealized_pnl,
            realized_pnl=p.realized_pnl,
        )
        for p in await get_broker().get_positions()
    ]
