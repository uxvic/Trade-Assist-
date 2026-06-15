"""Decide when to email the user about the bot — alerts + a daily digest.

Driven from the bot loop. A watermark in the ``email_state`` snapshot stops
duplicate sends; on first configuration we baseline to "now" so the user is
never spammed with historical activity.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime


def _baseline(store, state: dict) -> bool:
    """On first run with email on, set watermarks and send nothing yet."""
    if "last_alert_ts" not in state:
        state["last_alert_ts"] = int(time.time())
        state["last_digest_day"] = datetime.now(UTC).date().isoformat()
        store.save_snapshot("email_state", state)
        return True
    return False


async def flush_email_alerts() -> None:
    from app.notifications.email import send_email
    from app.persistence.store import get_store
    from app.runtime import get_email_config

    cfg = get_email_config()
    if not cfg:
        return
    store = get_store()
    state = store.load_snapshot("email_state") or {}
    if _baseline(store, state):
        return

    since = state.get("last_alert_ts", 0)
    events = [e for e in store.read_events(notify_only=True, limit=50) if e["ts"] > since]
    if not events:
        return
    events.sort(key=lambda e: e["ts"])
    lines = [
        f"- {datetime.fromtimestamp(e['ts'], UTC):%H:%M} {e['symbol'] or ''}: {e['text']}"
        for e in events
    ]
    body = (
        "Your Trade-Assist bot:\n\n"
        + "\n".join(lines)
        + "\n\n(Practice money. Educational only.)"
    )
    if await send_email(cfg, f"Bot: {len(events)} update(s)", body):
        state["last_alert_ts"] = events[-1]["ts"]
        store.save_snapshot("email_state", state)


async def maybe_send_digest() -> None:
    from app.notifications.email import send_email
    from app.persistence.store import get_store
    from app.runtime import get_email_config, get_strategy_bot

    cfg = get_email_config()
    if not cfg or not cfg.get("digest", True):
        return
    store = get_store()
    state = store.load_snapshot("email_state") or {}
    if _baseline(store, state):
        return

    today = datetime.now(UTC).date().isoformat()
    if state.get("last_digest_day") == today:
        return
    stats = get_strategy_bot().stats()
    body = (
        f"Daily bot digest ({today}):\n\n"
        f"- Closed trades: {stats['trades_n']}\n"
        f"- Win rate: {stats['win_rate'] * 100:.0f}%\n"
        f"- Open positions: {stats['open_n']}\n"
        f"- Realized P&L: {stats['realized_pnl']:+.2f}\n\n"
        "(Practice money. Educational only.)"
    )
    if await send_email(cfg, "Your bot — daily digest", body):
        state["last_digest_day"] = today
        store.save_snapshot("email_state", state)
