"""Live market-data endpoints (crypto via the configured provider)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.data.providers.base import Timeframe
from app.runtime import get_data_provider

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/quote/{symbol}")
async def quote(symbol: str) -> dict:
    try:
        q = await get_data_provider().get_quote(symbol)
    except Exception as exc:  # noqa: BLE001 - upstream/network errors → 502
        raise HTTPException(status_code=502, detail=f"Upstream data error: {exc}") from exc
    return {
        "symbol": q.symbol,
        "last": str(q.last),
        "bid": str(q.bid) if q.bid is not None else None,
        "ask": str(q.ask) if q.ask is not None else None,
        "ts": q.ts.isoformat(),
    }


@router.get("/candles/{symbol}")
async def candles(
    symbol: str,
    timeframe: Timeframe = Query(default=Timeframe.M1),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    try:
        rows = await get_data_provider().get_candles(symbol, timeframe, limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Upstream data error: {exc}") from exc
    return {
        "symbol": symbol,
        "timeframe": timeframe.value,
        "candles": [
            {
                "time": int(c.ts.timestamp()),
                "open": float(c.open),
                "high": float(c.high),
                "low": float(c.low),
                "close": float(c.close),
                "volume": float(c.volume),
            }
            for c in rows
        ],
    }
