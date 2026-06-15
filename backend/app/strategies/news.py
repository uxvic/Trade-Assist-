"""News-blackout gate — the strategy avoids high-impact news windows.

Uses a keyless, best-effort weekly economic calendar (Forex Factory's public
JSON, the same one many calendars embed). Like our yfinance data, it's
unofficial but fine for a learning demo and needs no setup. The calendar is
fetched at most hourly by ``refresh_calendar`` (called from the engine before
each evaluation) and cached in memory; ``is_blackout`` reads that cache
synchronously so the signal logic stays pure. Any fetch failure leaves the
cache as-is and simply means "no blackout" — it never crashes a tick.
"""

from __future__ import annotations

import time
from datetime import datetime

_CAL_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
_TTL = 3600  # refresh at most hourly
_WINDOW = 30 * 60  # ± minutes around a high-impact event to stay out

_calendar: list[dict] = []  # cached: {"ts": int, "currency": str, "title": str}
_fetched_at = 0
_available = False  # whether we've successfully loaded a calendar at least once


def _parse_ts(raw: str | None) -> int | None:
    if not raw:
        return None
    try:
        return int(datetime.fromisoformat(raw).timestamp())
    except (ValueError, TypeError):
        return None


async def refresh_calendar(force: bool = False) -> None:
    """Pull this week's high-impact events (best-effort, hourly)."""
    global _calendar, _fetched_at, _available
    now = int(time.time())
    if not force and _calendar and now - _fetched_at < _TTL:
        return
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            data = (await client.get(_CAL_URL)).json()
        events = []
        for e in data:
            if (e.get("impact") or "").lower() != "high":
                continue
            ts = _parse_ts(e.get("date"))
            cur = (e.get("country") or "").upper()
            if ts and cur:
                events.append({"ts": ts, "currency": cur, "title": e.get("title", "")})
        _calendar = events
        _fetched_at = now
        _available = True
    except Exception:  # noqa: BLE001 - news is best-effort; never crash a tick
        _fetched_at = now  # back off even on failure


def symbol_currencies(symbol: str, asset_class: str) -> set[str]:
    s = symbol.upper()
    if asset_class == "forex" and len(s) == 6:
        return {s[:3], s[3:]}
    # Crypto, stocks, and metals are most sensitive to USD macro events.
    return {"USD"}


def is_blackout(symbol: str, now: int | None = None, asset_class: str = "forex") -> bool:
    now = now or int(time.time())
    curs = symbol_currencies(symbol, asset_class)
    for e in _calendar:
        if e["currency"] in curs and abs(e["ts"] - now) <= _WINDOW:
            return True
    return False


def news_available() -> bool:
    return _available
