"""FastAPI application entrypoint.

Run locally with:  ``uvicorn app.main:app --reload``
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agent, health, market, paper, strategy
from app.api.routes import settings as settings_routes
from app.config import get_settings

settings = get_settings()

# The bot evaluates its watchlist on this cadence (entry TF is 30m, so 5 min is
# plenty). Data-only — no LLM cost. Each tick is guarded so a failure never
# crashes the app.
_BOT_INTERVAL_SECONDS = 300


async def _bot_loop() -> None:
    from app.runtime import get_strategy_bot

    while True:
        with contextlib.suppress(Exception):
            await get_strategy_bot().tick()
        await asyncio.sleep(_BOT_INTERVAL_SECONDS)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_bot_loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(market.router)
app.include_router(paper.router)
app.include_router(agent.router)
app.include_router(settings_routes.router)
app.include_router(strategy.router)


@app.get("/", tags=["health"])
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "disclaimer": "Educational use only. Not financial advice. Paper trading only.",
    }
