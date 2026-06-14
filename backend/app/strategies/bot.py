"""The strategy bot: applies the rules engine to a watchlist and auto-trades on
its own demo ``PaperBroker`` so the user can compare themselves against it.

Honest framing: the bot applies a fixed checklist consistently and without
emotion — that is its only edge claim, not price prediction.
"""

from __future__ import annotations

import datetime
import time
from decimal import Decimal

from app.brokers.paper import PaperBroker
from app.domain.enums import OrderSide, OrderType
from app.domain.trading import OrderRequest
from app.strategies.engine import analyze
from app.strategies.types import Analysis

# Default instruments the bot watches (crypto + forex). User-configurable later.
DEFAULT_WATCHLIST: list[tuple[str, str]] = [
    ("BTCUSDT", "crypto"),
    ("ETHUSDT", "crypto"),
    ("EURUSD", "forex"),
]
RISK_PER_TRADE = 0.01  # 1% of equity risked per trade
FX_SESSION_CLOSE_UTC = 21  # forex "end of day"


class StrategyBot:
    def __init__(self, broker: PaperBroker):
        self.broker = broker
        self.watchlist = list(DEFAULT_WATCHLIST)
        self.trades: list[dict] = []
        self._open: dict[str, dict] = {}  # symbol -> open trade record

    async def analyze_symbol(self, symbol: str, asset_class: str) -> Analysis:
        from app.data.providers.registry import get_provider

        return await analyze(symbol, asset_class, get_provider(asset_class))

    # ---- the scheduled loop calls these -------------------------------- #
    async def tick(self) -> None:
        for symbol, asset_class in self.watchlist:
            try:
                await self._evaluate(symbol, asset_class)
            except Exception:  # noqa: BLE001 - one bad symbol must not stop the loop
                continue
        await self.enforce_eod()

    async def _evaluate(self, symbol: str, asset_class: str) -> None:
        analysis = await self.analyze_symbol(symbol, asset_class)
        price = analysis.current_price
        if price:
            self.broker.update_price(symbol, Decimal(str(price)))  # may trigger resting exits
        self._reconcile(symbol)
        if (
            analysis.signal.state == "buy"
            and analysis.proposed_trade
            and symbol not in self._open
        ):
            await self._open_trade(symbol, asset_class, analysis)

    async def _open_trade(self, symbol: str, asset_class: str, analysis: Analysis) -> None:
        pt = analysis.proposed_trade
        account = await self.broker.get_account()
        risk_amt = float(account.equity) * RISK_PER_TRADE
        if pt.risk_per_unit <= 0:
            return
        qty = risk_amt / pt.risk_per_unit
        if qty <= 0:
            return

        self.broker.update_price(symbol, Decimal(str(pt.entry)))
        order = await self.broker.place_order(
            OrderRequest(
                symbol=symbol,
                side=OrderSide.BUY,
                type=OrderType.MARKET,
                qty=Decimal(str(qty)),
            )
        )
        if order.status.value != "filled":
            return
        # Resting protective stop + 1:3 target (sells); the broker fills them with no look-ahead.
        await self.broker.place_order(
            OrderRequest(
                symbol=symbol, side=OrderSide.SELL, type=OrderType.STOP,
                qty=Decimal(str(qty)), stop_price=Decimal(str(pt.stop)),
            )
        )
        await self.broker.place_order(
            OrderRequest(
                symbol=symbol, side=OrderSide.SELL, type=OrderType.LIMIT,
                qty=Decimal(str(qty)), limit_price=Decimal(str(pt.target)),
            )
        )
        rec = {
            "symbol": symbol,
            "asset_class": asset_class,
            "side": "buy",
            "qty": qty,
            "entry": float(order.avg_fill_price or pt.entry),
            "stop": pt.stop,
            "target": pt.target,
            "level": analysis.signal.level.price if analysis.signal.level else None,
            "rationale": pt.rationale,
            "opened_at": int(time.time()),
            "closed_at": None,
            "exit_reason": None,
            "pnl": None,
            "status": "open",
            "_realized_at_open": self._realized(symbol),
        }
        self._open[symbol] = rec
        self.trades.append(rec)

    async def enforce_eod(self, now: datetime.datetime | None = None) -> None:
        now = now or datetime.datetime.now(datetime.UTC)
        for symbol in list(self._open):
            rec = self._open[symbol]
            close = (rec["asset_class"] == "forex" and now.hour >= FX_SESSION_CLOSE_UTC) or (
                rec["asset_class"] == "crypto"
                and int(now.timestamp()) - rec["opened_at"] >= 86400
            )
            if not close:
                continue
            pos = self.broker._positions.get(symbol)
            if pos and pos.qty != 0:
                await self.broker.place_order(
                    OrderRequest(
                        symbol=symbol, side=OrderSide.SELL, type=OrderType.MARKET, qty=pos.qty
                    )
                )
            rec["exit_reason"] = "eod"
            self._reconcile(symbol)

    # ---- helpers ------------------------------------------------------- #
    def _realized(self, symbol: str) -> float:
        pos = self.broker._positions.get(symbol)
        return float(pos.realized_pnl) if pos else 0.0

    def _reconcile(self, symbol: str) -> None:
        rec = self._open.get(symbol)
        if not rec:
            return
        pos = self.broker._positions.get(symbol)
        if pos and pos.qty != 0:
            return  # still open
        rec["pnl"] = self._realized(symbol) - rec["_realized_at_open"]
        rec["closed_at"] = int(time.time())
        if rec.get("exit_reason") is None:
            last = self.broker._last_prices.get(symbol)
            if last is not None:
                lp = float(last)
                to_target = abs(lp - rec["target"])
                to_stop = abs(lp - rec["stop"])
                rec["exit_reason"] = "target" if to_target < to_stop else "stop"
        rec["status"] = "closed"
        del self._open[symbol]

    def track_record(self) -> list[dict]:
        return [{k: v for k, v in t.items() if not k.startswith("_")} for t in self.trades]

    def stats(self) -> dict:
        closed = [t for t in self.trades if t["status"] == "closed" and t["pnl"] is not None]
        wins = [t for t in closed if t["pnl"] > 0]
        return {
            "trades_n": len(closed),
            "open_n": len(self._open),
            "wins": len(wins),
            "win_rate": (len(wins) / len(closed)) if closed else 0.0,
            "realized_pnl": sum(t["pnl"] for t in closed),
        }
