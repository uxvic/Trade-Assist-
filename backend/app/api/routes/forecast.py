"""The on-demand "forecast lens" — an honest probabilistic projection.

This endpoint is deliberately NOT a trading signal and is never wired into the
bot or the order ticket. It runs strictly on demand (a button), loads the heavy
model lazily, runs inference off the event loop, and pairs every projection with
a live accuracy scorecard vs a naive baseline — so the learner can watch, in
their own data, that short-term price is near-random.
"""

from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, HTTPException, Query

from app.auth.deps import CurrentUser
from app.data.providers.base import Timeframe
from app.forecasting import scoring
from app.forecasting.timesfm_model import TF_SECONDS, ForecastUnavailable, forecast
from app.persistence.store import get_store
from app.runtime import get_data_provider

router = APIRouter(prefix="/api/forecast", tags=["forecast"])

_CONTEXT = 512  # candles of history fed to the model
_HISTORY_OUT = 60  # how much recent history we hand the UI to draw alongside the projection
_DEFAULT_HORIZON = 24
_MAX_HORIZON = 64


@router.get("")
async def get_forecast(
    user_id: CurrentUser,
    symbol: str = Query(...),
    asset_class: str = Query(default="crypto"),
    timeframe: Timeframe = Query(default=Timeframe.M1),
    horizon: int = Query(default=_DEFAULT_HORIZON, ge=1, le=_MAX_HORIZON),
) -> dict:
    provider = get_data_provider(asset_class)
    try:
        candles = await provider.get_candles(symbol, timeframe, _CONTEXT)
    except Exception as exc:  # noqa: BLE001 - upstream/network errors → 502
        raise HTTPException(status_code=502, detail=f"Upstream data error: {exc}") from exc
    if len(candles) < 32:
        raise HTTPException(status_code=422, detail="Not enough price history to forecast.")

    store = get_store()
    # Keep the scorecard fresh: settle any forecasts that have since matured.
    with contextlib.suppress(Exception):
        await scoring.score_pending(store, provider, symbol, asset_class, timeframe.value)

    last = candles[-1]
    made_price = float(last.close)
    last_ts = int(last.ts.timestamp())
    step = TF_SECONDS.get(timeframe.value, 60)
    closes = [float(c.close) for c in candles]

    try:
        # Heavy + blocking — keep it off the event loop.
        result = await asyncio.to_thread(forecast, closes, horizon)
    except ForecastUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    point, lower, upper = result["point"], result["lower"], result["upper"]
    h = len(point)
    future_ts = [last_ts + (i + 1) * step for i in range(h)]

    # Persist the horizon-end prediction so it can be scored later. The baseline
    # is the naive random-walk forecast: "price stays where it is today".
    if h:
        store.add_forecast(
            symbol=symbol,
            timeframe=timeframe.value,
            made_price=made_price,
            target_ts=future_ts[-1],
            predicted=point[-1],
            baseline=made_price,
        )

    return {
        "symbol": symbol,
        "asset_class": asset_class,
        "timeframe": timeframe.value,
        "as_of": last_ts,
        "made_price": made_price,
        "horizon": h,
        "history": [
            {"ts": int(c.ts.timestamp()), "value": float(c.close)}
            for c in candles[-_HISTORY_OUT:]
        ],
        "point": [{"ts": t, "value": v} for t, v in zip(future_ts, point, strict=False)],
        "lower": [{"ts": t, "value": v} for t, v in zip(future_ts, lower, strict=False)],
        "upper": [{"ts": t, "value": v} for t, v in zip(future_ts, upper, strict=False)],
        "scorecard": scoring.scorecard(store, symbol),
    }
