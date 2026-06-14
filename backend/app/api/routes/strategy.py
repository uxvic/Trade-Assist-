"""Strategy endpoints: live analysis, the AI second opinion, and the demo bot."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.api.schemas import AccountResponse, PositionResponse
from app.data.providers.registry import get_provider
from app.runtime import get_bot_broker, get_broker, get_strategy_bot, reset_bot
from app.strategies.engine import analyze
from app.strategies.second_opinion import get_bot_commentary, get_second_opinion

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


@router.get("/analyze")
async def analyze_route(
    symbol: str,
    asset_class: str = Query(default="crypto"),
    include_ai: bool = Query(default=False),
) -> dict:
    try:
        analysis = await analyze(symbol, asset_class, get_provider(asset_class))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Strategy/data error: {exc}") from exc

    data = analysis.to_dict()
    data["ai_second_opinion"] = (
        await get_second_opinion(symbol, asset_class, analysis) if include_ai else None
    )
    return data


def _account_response(account) -> AccountResponse:
    return AccountResponse(
        account_id=account.account_id,
        cash=account.cash,
        equity=account.equity,
        buying_power=account.buying_power,
        currency=account.currency,
    )


@router.get("/bot/account", response_model=AccountResponse)
async def bot_account() -> AccountResponse:
    return _account_response(await get_bot_broker().get_account())


@router.get("/bot/positions", response_model=list[PositionResponse])
async def bot_positions() -> list[PositionResponse]:
    return [
        PositionResponse(
            symbol=p.symbol,
            qty=p.qty,
            avg_cost=p.avg_cost,
            market_price=p.market_price,
            unrealized_pnl=p.unrealized_pnl,
            realized_pnl=p.realized_pnl,
        )
        for p in await get_bot_broker().get_positions()
    ]


@router.get("/bot/trades")
async def bot_trades() -> dict:
    bot = get_strategy_bot()
    return {"trades": bot.track_record(), "stats": bot.stats(), "watching": bot.watchlist}


@router.get("/bot/feed")
async def bot_feed(symbol: str, asset_class: str = Query(default="crypto")) -> dict:
    """The live console: re-reads the market (cached), narrates, trades, reports.

    Cheap and deterministic — safe for the console to poll every ~15s.
    """
    try:
        return await get_strategy_bot().feed(symbol, asset_class)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Bot feed error: {exc}") from exc


@router.get("/bot/commentary")
async def bot_commentary(symbol: str, asset_class: str = Query(default="crypto")) -> dict:
    """On-demand AI colour commentary on the bot's current read (costs a token call)."""
    bot = get_strategy_bot()
    try:
        analysis = await bot.analysis_for(symbol, asset_class)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Strategy/data error: {exc}") from exc
    return await get_bot_commentary(symbol, asset_class, analysis, bot.recent_notes(symbol))


@router.post("/bot/reset")
async def bot_reset() -> dict:
    reset_bot()
    account = await get_bot_broker().get_account()
    return {"status": "reset", "cash": str(account.cash)}


@router.get("/compare")
async def compare() -> dict:
    user = await get_broker().get_account()
    bot_acct = await get_bot_broker().get_account()
    start = 100_000.0
    return {
        "user": {"equity": float(user.equity), "pnl": float(user.equity) - start},
        "bot": {
            "equity": float(bot_acct.equity),
            "pnl": float(bot_acct.equity) - start,
            **get_strategy_bot().stats(),
        },
    }
