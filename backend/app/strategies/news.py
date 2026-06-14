"""News-blackout gate (stub).

Her strategy avoids high/medium-impact news windows. We don't have an economic
calendar wired yet, so this always returns False (no blackout) but the call site
exists so a real feed (Marketaux / a calendar) drops in later without touching
the signal logic.
"""

from __future__ import annotations


def is_blackout(symbol: str, now: int | None = None) -> bool:
    return False
