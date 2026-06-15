"""The strategy bot: applies the rules engine to a watchlist and auto-trades on
its own demo ``PaperBroker`` so the user can compare themselves against it.

Honest framing: the bot applies a fixed checklist consistently and without
emotion — that is its only edge claim, not price prediction.
"""

from __future__ import annotations

import asyncio
import datetime
import time
from decimal import Decimal

from app.brokers.paper import PaperBroker
from app.domain.enums import OrderSide, OrderType
from app.domain.trading import OrderRequest, new_id
from app.strategies.engine import analyze
from app.strategies.narrate import Note, narrate, signature
from app.strategies.types import Analysis

# Default instruments the bot watches (crypto + forex). User-configurable later.
DEFAULT_WATCHLIST: list[tuple[str, str]] = [
    ("BTCUSDT", "crypto"),
    ("ETHUSDT", "crypto"),
    ("EURUSD", "forex"),
]
RISK_PER_TRADE = 0.01  # 1% of equity risked per trade
FX_SESSION_CLOSE_UTC = 21  # forex "end of day"

ANALYSIS_TTL = 15  # seconds — frequent feed polls + the 5-min loop share one fetch
HEARTBEAT = 180  # seconds — speak at least this often even if nothing changed
NOTES_MAX = 80  # per-symbol ring buffer cap


class StrategyBot:
    def __init__(self, broker: PaperBroker, store=None):
        self.broker = broker
        self.store = store  # app.persistence.store.Store | None (None → no durability)
        self.watchlist = list(DEFAULT_WATCHLIST)
        self.trades: list[dict] = []
        self._open: dict[str, dict] = {}  # symbol -> open trade record (same obj as in trades)
        self._asset: dict[str, str] = {s: ac for s, ac in DEFAULT_WATCHLIST}  # symbol -> class
        # Live-narration state (per symbol).
        self.notes: dict[str, list[Note]] = {}  # symbol -> ring buffer, oldest first
        self._sig: dict[str, str] = {}  # symbol -> last spoken signature
        self._spoke_at: dict[str, int] = {}  # symbol -> last narration epoch
        self._cache: dict[str, tuple[int, Analysis]] = {}  # symbol -> (ts, analysis)
        self._lock = asyncio.Lock()  # serialize evaluation (avoids double entries)

    async def analyze_symbol(self, symbol: str, asset_class: str) -> Analysis:
        from app.data.providers.registry import get_provider

        return await analyze(symbol, asset_class, get_provider(asset_class))

    async def analysis_for(self, symbol: str, asset_class: str) -> Analysis:
        """A short-TTL cached analysis so polls + the loop don't re-fetch needlessly."""
        now = int(time.time())
        hit = self._cache.get(symbol)
        if hit and now - hit[0] < ANALYSIS_TTL:
            return hit[1]
        analysis = await self.analyze_symbol(symbol, asset_class)
        self._cache[symbol] = (now, analysis)
        return analysis

    # ---- the scheduled loop calls these -------------------------------- #
    async def tick(self) -> None:
        for symbol, asset_class in list(self.watchlist):
            try:
                await self._evaluate(symbol, asset_class)
            except Exception:  # noqa: BLE001 - one bad symbol must not stop the loop
                continue
        await self.enforce_eod()
        # Persist the bot's account + bookkeeping once per tick (cheap, infrequent).
        self._persist_broker()
        self._persist_state()

    def watch(self, symbol: str, asset_class: str) -> None:
        """Add an instrument to the live watchlist so the bot trades + narrates it."""
        self._asset[symbol] = asset_class
        if not any(s == symbol for s, _ in self.watchlist):
            self.watchlist.append((symbol, asset_class))

    async def feed(self, symbol: str, asset_class: str) -> dict:
        """The live console's data source: re-read (cached), narrate, trade, report."""
        self.watch(symbol, asset_class)
        call: dict | None = None
        try:
            analysis = await self._evaluate(symbol, asset_class)
            call = {
                "trend": analysis.trend.to_dict(),
                "signal": analysis.signal.to_dict(),
                "proposed_trade": (
                    analysis.proposed_trade.to_dict() if analysis.proposed_trade else None
                ),
                "levels": [lv.to_dict() for lv in analysis.levels],
                "current_price": analysis.current_price,
                "as_of": analysis.as_of,
            }
        except Exception as exc:  # noqa: BLE001 - keep the console alive on a data hiccup
            self._add_note(symbol, "watch", f"Couldn't refresh {symbol} ({exc}).")
        return {
            "symbol": symbol,
            "asset_class": asset_class,
            "call": call,
            "notes": self.recent_notes(symbol),
            "position": self._position_dict(symbol),
        }

    async def _evaluate(self, symbol: str, asset_class: str) -> Analysis:
        async with self._lock:
            analysis = await self.analysis_for(symbol, asset_class)
            price = analysis.current_price
            if price:
                self.broker.update_price(symbol, Decimal(str(price)))  # may trigger resting exits
            self._reconcile(symbol)
            self._record_notes(symbol, analysis)
            if (
                analysis.signal.state == "buy"
                and analysis.proposed_trade
                and symbol not in self._open
            ):
                await self._open_trade(symbol, asset_class, analysis)
            return analysis

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
            "trade_id": new_id("bottrade"),
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
        self._add_note(
            symbol,
            "enter",
            f"Entered {symbol} long at {rec['entry']:.5g} — stop {pt.stop:.5g}, "
            f"target {pt.target:.5g}, risking ~1%.",
            rec["opened_at"],
        )
        self._persist_trade(rec)
        self._persist_state()

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

    # ---- narration ----------------------------------------------------- #
    NOTIFY_KINDS = frozenset({"signal", "enter", "exit"})

    def _add_note(self, symbol: str, kind: str, text: str, ts: int | None = None) -> None:
        note = Note(ts=ts or int(time.time()), kind=kind, text=text)
        buf = self.notes.setdefault(symbol, [])
        buf.append(note)
        if len(buf) > NOTES_MAX:
            del buf[: len(buf) - NOTES_MAX]
        if self.store:
            self.store.append_event(
                note.ts, symbol, self._asset.get(symbol, "crypto"),
                kind, text, kind in self.NOTIFY_KINDS,
            )

    def _record_notes(self, symbol: str, analysis: Analysis) -> None:
        """Speak only when the read changes, or on a periodic heartbeat."""
        sig = signature(analysis)
        now = int(time.time())
        unchanged = sig == self._sig.get(symbol)
        if unchanged and now - self._spoke_at.get(symbol, 0) < HEARTBEAT:
            return
        for note in narrate(analysis):
            self._add_note(symbol, note.kind, note.text, note.ts)
        self._sig[symbol] = sig
        self._spoke_at[symbol] = now

    def recent_notes(self, symbol: str, n: int = 40) -> list[dict]:
        """Newest first, for the live feed."""
        buf = self.notes.get(symbol, [])
        return [note.to_dict() for note in reversed(buf[-n:])]

    # ---- durability ---------------------------------------------------- #
    def _persist_trade(self, rec: dict) -> None:
        if self.store:
            self.store.upsert_trade(rec)

    def _persist_broker(self) -> None:
        if self.store:
            self.store.save_snapshot("bot_broker", self.broker.to_snapshot())

    def _persist_state(self) -> None:
        """Snapshot the bot's bookkeeping. Open trades are derived from the
        durable trade log on restore, so they aren't duplicated here."""
        if not self.store:
            return
        self.store.save_snapshot(
            "bot_state",
            {
                "watchlist": [list(w) for w in self.watchlist],
                "asset": self._asset,
                "sig": self._sig,
                "spoke_at": self._spoke_at,
            },
        )

    def restore(self) -> None:
        """Rehydrate from the store on boot. Best-effort; a fresh store no-ops."""
        if not self.store:
            return
        # Trade log is authoritative for history + currently-open trades.
        self.trades = self.store.read_trades()
        self._open = {t["symbol"]: t for t in self.trades if t.get("status") == "open"}
        snap = self.store.load_snapshot("bot_state")
        if snap:
            wl = [tuple(w) for w in snap.get("watchlist", [])]
            if wl:
                self.watchlist = wl
            self._asset = snap.get("asset", self._asset)
            self._sig = snap.get("sig", {})
            self._spoke_at = snap.get("spoke_at", {})
        # Rebuild each symbol's note buffer (oldest-first) from the event log.
        for symbol, _ac in self.watchlist:
            evs = self.store.read_events(symbol=symbol, limit=NOTES_MAX)
            self.notes[symbol] = [Note(e["ts"], e["kind"], e["text"]) for e in reversed(evs)]

    def _position_dict(self, symbol: str) -> dict | None:
        pos = self.broker._positions.get(symbol)
        if not pos or pos.qty == 0:
            return None
        rec = self._open.get(symbol)
        return {
            "symbol": symbol,
            "qty": float(pos.qty),
            "avg_cost": float(pos.avg_cost),
            "market_price": float(pos.market_price),
            "unrealized_pnl": float(pos.unrealized_pnl),
            "entry": rec["entry"] if rec else None,
            "stop": rec["stop"] if rec else None,
            "target": rec["target"] if rec else None,
            "opened_at": rec["opened_at"] if rec else None,
        }

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
        verb = {
            "target": "Target hit",
            "stop": "Stopped out",
            "eod": "Flattened at end of day",
        }.get(rec.get("exit_reason"), "Closed")
        self._add_note(
            symbol, "exit", f"{verb} on {symbol}. P&L {rec['pnl']:+.2f}.", rec["closed_at"]
        )
        del self._open[symbol]
        self._persist_trade(rec)
        self._persist_state()

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
