"""Pydantic request/response schemas for the HTTP API.

Kept separate from the pure-Python trading domain (``app.domain``): the domain
is the engine's vocabulary; these are the transport contracts.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class PriceUpdate(BaseModel):
    symbol: str
    price: Decimal


class PlaceOrderRequest(BaseModel):
    symbol: str
    asset_class: str = "crypto"
    side: str = Field(pattern="^(buy|sell)$")
    type: str = Field(default="market", pattern="^(market|limit|stop)$")
    qty: Decimal | None = None
    notional: Decimal | None = None
    limit_price: Decimal | None = None
    stop_price: Decimal | None = None

    @model_validator(mode="after")
    def _check_qty_or_notional(self) -> PlaceOrderRequest:
        if self.qty is None and self.notional is None:
            raise ValueError("Provide either qty or notional")
        return self


class PositionResponse(BaseModel):
    symbol: str
    qty: Decimal
    avg_cost: Decimal
    market_price: Decimal
    unrealized_pnl: Decimal
    realized_pnl: Decimal


class AccountResponse(BaseModel):
    account_id: str
    cash: Decimal
    equity: Decimal
    buying_power: Decimal
    currency: str


class OrderResponse(BaseModel):
    id: str
    symbol: str
    side: str
    type: str
    qty: Decimal
    status: str
    filled_qty: Decimal
    avg_fill_price: Decimal | None = None
    reject_reason: str | None = None
    risk_assessment: dict | None = None


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None
    intensity: str = "reads"


class ObserveRequest(BaseModel):
    symbol: str
    asset_class: str = "crypto"
    timeframe: str = "1m"
    name: str = ""
    intensity: str = "reads"


class AnalyzeRequest(BaseModel):
    symbol: str
    asset_class: str = "crypto"
    timeframe: str = "1h"
