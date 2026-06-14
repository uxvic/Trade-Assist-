"""Turn an :class:`Analysis` into short, deterministic trader's notes.

The bot "thinks out loud" without spending a single token: every note here is
derived mechanically from the analysis. A per-symbol *signature* lets the caller
speak only when something meaningful changes (plus a periodic heartbeat), so the
feed reads like a trader narrating — not a log spammer.

Honest framing: these notes describe disciplined checklist-following, never a
prediction of where price is going.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.strategies.pips import pip_size
from app.strategies.types import Analysis, Level

# Note kinds drive the icon/colour on the frontend feed.
KIND_ANALYSIS = "analysis"
KIND_WATCH = "watch"
KIND_SIGNAL = "signal"
KIND_ENTER = "enter"
KIND_EXIT = "exit"


@dataclass
class Note:
    ts: int
    kind: str
    text: str

    def to_dict(self) -> dict:
        return {"ts": self.ts, "kind": self.kind, "text": self.text}


def _nearest_level(analysis: Analysis) -> Level | None:
    if not analysis.levels or not analysis.current_price:
        return None
    return min(analysis.levels, key=lambda lv: abs(lv.price - analysis.current_price))


def _distance_text(a: float, b: float, symbol: str, asset_class: str) -> str:
    """How far price ``a`` is from level ``b`` — in pips for FX, percent otherwise."""
    diff = abs(a - b)
    ps = pip_size(symbol, asset_class)
    if ps:
        return f"{diff / ps:.0f} pips"
    if b:
        return f"{diff / b * 100:.1f}%"
    return f"{diff:.5g}"


def signature(analysis: Analysis) -> str:
    """A compact fingerprint of the current read.

    Changes when the trend flips, the signal flips, or price crosses into a new
    nearest-level bucket — i.e. when a trader would actually have something new
    to say.
    """
    near = _nearest_level(analysis)
    bucket = f"{near.source_tf}:{near.price:.6g}" if near else "none"
    return f"{analysis.trend.direction}|{analysis.signal.state}|{bucket}"


def narrate(analysis: Analysis) -> list[Note]:
    """1–3 concise notes describing what the bot sees right now."""
    notes: list[Note] = []
    now = analysis.as_of
    t = analysis.trend
    sig = analysis.signal
    price = analysis.current_price

    # 1) The trend read — the buys-only gate.
    if t.direction == "up":
        trend_txt = f"Trend up ({t.confidence:.0%}) — hunting for a buy setup."
    elif t.direction == "down":
        trend_txt = f"Trend down ({t.confidence:.0%}) — standing down (buys only)."
    else:
        trend_txt = f"No clear trend ({t.confidence:.0%}) — waiting for direction."
    notes.append(Note(now, KIND_ANALYSIS, trend_txt))

    # 2) The setup, or what it's watching while it waits.
    if sig.state == "buy" and analysis.proposed_trade:
        pt = analysis.proposed_trade
        notes.append(
            Note(
                now,
                KIND_SIGNAL,
                f"Setup! BUY {analysis.symbol} — entry {pt.entry:.5g}, "
                f"stop {pt.stop:.5g}, target {pt.target:.5g} (1:3).",
            )
        )
    else:
        near = _nearest_level(analysis)
        if near and price:
            dist = _distance_text(price, near.price, analysis.symbol, analysis.asset_class)
            notes.append(
                Note(
                    now,
                    KIND_WATCH,
                    f"Watching the {near.source_tf} {near.type} at {near.price:.5g} "
                    f"— {dist} away. {sig.reason}.",
                )
            )
        else:
            notes.append(Note(now, KIND_WATCH, f"{sig.reason}."))

    return notes
