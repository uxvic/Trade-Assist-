"""Zero-config durability so the bot's life and the user's paper account survive
restarts.

Model = **snapshot + append-log**:
- ``state_snapshots`` holds the serialized broker/bot state, overwritten on
  change and replayed once on boot — the source of truth for *restoring* the
  engine.
- ``bot_events`` and ``bot_trades`` are append/upsert logs that power the live
  feed history, the notification centre, and the bot's track record (uncapped,
  unlike the in-memory ring buffer).

Stdlib ``sqlite3`` only (no new deps). Writes are tiny and infrequent (per tick
~5 min, per order) so they run synchronously under a lock in WAL mode — fast
enough to not matter on the event loop, and far simpler than juggling tasks.
Every operation is best-effort: a missing/corrupt file degrades to an in-memory
database and the app keeps running, never crashing on a persistence error.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from functools import lru_cache

from app.config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS bot_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    symbol      TEXT,
    asset_class TEXT,
    kind        TEXT NOT NULL,
    text        TEXT NOT NULL,
    notify      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_events_symbol_ts ON bot_events(symbol, ts);
CREATE INDEX IF NOT EXISTS ix_events_notify_ts ON bot_events(notify, ts);

CREATE TABLE IF NOT EXISTS bot_trades (
    trade_id    TEXT PRIMARY KEY,
    symbol      TEXT NOT NULL,
    asset_class TEXT,
    side        TEXT,
    opened_at   INTEGER,
    closed_at   INTEGER,
    pnl         REAL,
    status      TEXT NOT NULL,
    data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trades_status ON bot_trades(status);
CREATE INDEX IF NOT EXISTS ix_trades_opened ON bot_trades(opened_at);

CREATE TABLE IF NOT EXISTS state_snapshots (
    scope       TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
"""

EVENTS_KEEP = 5000  # prune ceiling so the file can't grow without bound


class Store:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._conn = self._open(db_path)

    def _open(self, db_path: str) -> sqlite3.Connection:
        try:
            if db_path != ":memory:":
                os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
            conn = sqlite3.connect(db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.executescript(_SCHEMA)
            conn.commit()
            return conn
        except (OSError, sqlite3.Error):
            # Corrupt or unwritable file → run in memory rather than crash.
            conn = sqlite3.connect(":memory:", check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.executescript(_SCHEMA)
            conn.commit()
            return conn

    # ---- snapshots ----------------------------------------------------- #
    def save_snapshot(self, scope: str, payload: dict) -> None:
        try:
            with self._lock:
                self._conn.execute(
                    "INSERT INTO state_snapshots(scope, payload, updated_at) VALUES(?,?,?) "
                    "ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload, "
                    "updated_at=excluded.updated_at",
                    (scope, json.dumps(payload), int(time.time())),
                )
                self._conn.commit()
        except (sqlite3.Error, TypeError, ValueError):
            pass  # best-effort

    def load_snapshot(self, scope: str) -> dict | None:
        try:
            with self._lock:
                row = self._conn.execute(
                    "SELECT payload FROM state_snapshots WHERE scope=?", (scope,)
                ).fetchone()
            return json.loads(row["payload"]) if row else None
        except (sqlite3.Error, ValueError):
            return None

    def clear_scope(self, scope: str) -> None:
        try:
            with self._lock:
                self._conn.execute("DELETE FROM state_snapshots WHERE scope=?", (scope,))
                self._conn.commit()
        except sqlite3.Error:
            pass

    # ---- events -------------------------------------------------------- #
    def append_event(
        self, ts: int, symbol: str, asset_class: str, kind: str, text: str, notify: bool
    ) -> None:
        try:
            with self._lock:
                self._conn.execute(
                    "INSERT INTO bot_events(ts, symbol, asset_class, kind, text, notify) "
                    "VALUES(?,?,?,?,?,?)",
                    (ts, symbol, asset_class, kind, text, 1 if notify else 0),
                )
                self._conn.commit()
        except sqlite3.Error:
            pass

    def read_events(
        self, symbol: str | None = None, notify_only: bool = False, limit: int = 200
    ) -> list[dict]:
        """Newest first."""
        try:
            clauses, params = [], []
            if symbol:
                clauses.append("symbol=?")
                params.append(symbol)
            if notify_only:
                clauses.append("notify=1")
            where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
            params.append(limit)
            with self._lock:
                rows = self._conn.execute(
                    f"SELECT ts, symbol, asset_class, kind, text, notify FROM bot_events"
                    f"{where} ORDER BY id DESC LIMIT ?",
                    params,
                ).fetchall()
            return [dict(r) for r in rows]
        except sqlite3.Error:
            return []

    def prune_events(self, keep: int = EVENTS_KEEP) -> None:
        try:
            with self._lock:
                self._conn.execute(
                    "DELETE FROM bot_events WHERE id NOT IN "
                    "(SELECT id FROM bot_events ORDER BY id DESC LIMIT ?)",
                    (keep,),
                )
                self._conn.commit()
        except sqlite3.Error:
            pass

    # ---- trades -------------------------------------------------------- #
    def upsert_trade(self, rec: dict) -> None:
        try:
            with self._lock:
                self._conn.execute(
                    "INSERT INTO bot_trades(trade_id, symbol, asset_class, side, opened_at, "
                    "closed_at, pnl, status, data) VALUES(?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(trade_id) DO UPDATE SET closed_at=excluded.closed_at, "
                    "pnl=excluded.pnl, status=excluded.status, data=excluded.data",
                    (
                        rec.get("trade_id"),
                        rec.get("symbol"),
                        rec.get("asset_class"),
                        rec.get("side"),
                        rec.get("opened_at"),
                        rec.get("closed_at"),
                        rec.get("pnl"),
                        rec.get("status", "open"),
                        json.dumps(rec),
                    ),
                )
                self._conn.commit()
        except (sqlite3.Error, TypeError, ValueError):
            pass

    def read_trades(self) -> list[dict]:
        """Full trade records (oldest first), as the bot stored them."""
        try:
            with self._lock:
                rows = self._conn.execute(
                    "SELECT data FROM bot_trades ORDER BY opened_at ASC"
                ).fetchall()
            return [json.loads(r["data"]) for r in rows]
        except (sqlite3.Error, ValueError):
            return []

    def clear_trades(self) -> None:
        try:
            with self._lock:
                self._conn.execute("DELETE FROM bot_trades")
                self._conn.execute("DELETE FROM bot_events")
                self._conn.commit()
        except sqlite3.Error:
            pass


@lru_cache
def get_store() -> Store:
    return Store(get_settings().sqlite_path)
