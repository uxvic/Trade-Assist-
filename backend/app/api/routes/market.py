"""Live market-data endpoints (asset-class aware: crypto, forex, …)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.data.providers.base import Timeframe
from app.data.providers.registry import ASSET_CLASSES, search_instruments
from app.runtime import get_data_provider

router = APIRouter(prefix="/api/market", tags=["market"])

# Friendly, beginner-facing crypto shortlist used by the Home market overview.
SUPPORTED_SYMBOLS = [
    {"symbol": "BTCUSDT", "name": "Bitcoin", "ticker": "BTC"},
    {"symbol": "ETHUSDT", "name": "Ethereum", "ticker": "ETH"},
    {"symbol": "SOLUSDT", "name": "Solana", "ticker": "SOL"},
    {"symbol": "XRPUSDT", "name": "XRP", "ticker": "XRP"},
]


@router.get("/asset-classes")
async def asset_classes() -> dict:
    return {"asset_classes": ASSET_CLASSES}


@router.get("/symbols")
async def symbols() -> dict:
    return {"symbols": SUPPORTED_SYMBOLS}


@router.get("/instruments")
async def instruments(
    asset_class: str = Query(default="crypto"),
    search: str = Query(default=""),
    limit: int = Query(default=30, ge=1, le=100),
) -> dict:
    try:
        rows = await search_instruments(asset_class, search, limit)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - upstream/network errors → 502
        raise HTTPException(status_code=502, detail=f"Upstream data error: {exc}") from exc
    return {
        "asset_class": asset_class,
        "instruments": [
            {"symbol": r.symbol, "name": r.name, "ticker": r.ticker, "asset_class": r.asset_class}
            for r in rows
        ],
    }


@router.get("/quote/{symbol}")
async def quote(symbol: str, asset_class: str = Query(default="crypto")) -> dict:
    try:
        q = await get_data_provider(asset_class).get_quote(symbol)
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
    asset_class: str = Query(default="crypto"),
    timeframe: Timeframe = Query(default=Timeframe.M1),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    try:
        rows = await get_data_provider(asset_class).get_candles(symbol, timeframe, limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Upstream data error: {exc}") from exc
    return {
        "symbol": symbol,
        "asset_class": asset_class,
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
