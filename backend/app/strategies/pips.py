"""Pip / stop-buffer model — keeps her FX pip rule and a sane crypto equivalent."""

from __future__ import annotations


def pip_size(symbol: str, asset_class: str) -> float | None:
    """The price value of one pip, or None for instruments without a pip convention."""
    if asset_class == "forex":
        return 0.01 if symbol.upper().endswith("JPY") else 0.0001
    return None  # crypto has no pip convention


def pips_to_price(pips: float, symbol: str, asset_class: str, last_price: float) -> float:
    """Convert a pip buffer to a price distance.

    FX uses real pips (3.5 pips -> 0.00035, or 0.035 for JPY pairs). Crypto has no
    pips, so use a small relative buffer (5 bps of price) as the equivalent.
    """
    ps = pip_size(symbol, asset_class)
    if ps is not None:
        return pips * ps
    return 0.0005 * last_price
