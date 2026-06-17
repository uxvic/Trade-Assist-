"""FastAPI application entrypoint.

Run locally with:  ``uvicorn app.main:app --reload``
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agent, auth, feedback, forecast, health, market, paper, strategy
from app.api.routes import settings as settings_routes
from app.config import get_settings

settings = get_settings()

# The bot evaluates its watchlist on this cadence (entry TF is 30m, so 5 min is
# plenty). Data-only — no LLM cost. Each tick is guarded so a failure never
# crashes the app.
_BOT_INTERVAL_SECONDS = 300


async def _bot_loop() -> None:
    from app.notifications.dispatch import flush_email_alerts, maybe_send_digest
    from app.runtime import get_strategy_bot

    while True:
        with contextlib.suppress(Exception):
            await get_strategy_bot().tick()
        with contextlib.suppress(Exception):
            await flush_email_alerts()  # email new setups/entries/exits (no-op if off)
        with contextlib.suppress(Exception):
            await maybe_send_digest()  # once-a-day summary (no-op if off)
        await asyncio.sleep(_BOT_INTERVAL_SECONDS)


def _restore_state() -> None:
    """Rehydrate the shared bot from the SQLite store on boot — so its
    trades/notes/P&L survive restarts. Must run before the bot loop starts, or
    the first tick would overwrite the snapshot. Per-user accounts hydrate
    lazily on their owner's first authenticated request (see runtime.get_broker).
    """
    from app.persistence.store import get_store
    from app.runtime import get_bot_broker, get_strategy_bot

    store = get_store()
    bot_snap = store.load_snapshot("bot_broker")
    if bot_snap:
        get_bot_broker().load_snapshot(bot_snap)
    get_strategy_bot().restore()


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    with contextlib.suppress(Exception):
        _restore_state()
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
app.include_router(auth.router)
app.include_router(market.router)
app.include_router(paper.router)
app.include_router(agent.router)
app.include_router(settings_routes.router)
app.include_router(strategy.router)
app.include_router(feedback.router)
app.include_router(forecast.router)


@app.get("/", tags=["health"])
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "disclaimer": "Educational use only. Not financial advice. Paper trading only.",
    }
