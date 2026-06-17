"""The honest accuracy scorecard — the teaching core of the forecast lens.

Every forecast we serve is stored with the price it was made at, the predicted
price at the horizon, and a *naive baseline* (today's price — the random-walk
guess). Once a forecast's target time has passed we look up the realized price
and score it: did the model call the direction right, and did it actually beat
the naive guess? Aggregated, this almost always lands near a coin flip — which
is exactly the lesson: short-term price is near-random, so don't trade on a
prediction.

Pure and dependency-light: the only inputs are a :class:`~app.persistence.store.Store`
and a market-data provider, both easy to fake in tests.
"""

from __future__ import annotations

import time

from app.data.providers.base import Timeframe

_MAX_SCORE_PER_CALL = 20  # bound the work done on any single (on-demand) request
_SCORECARD_WINDOW = 200  # most recent scored forecasts to summarise


async def score_pending(store, provider, symbol: str, asset_class: str, timeframe: str) -> int:
    """Score any matured-but-unscored forecasts for ``(symbol, timeframe)``.

    Best-effort: an upstream/network hiccup just leaves rows for next time.
    Returns the number newly scored.
    """
    now = int(time.time())
    due = store.unscored_forecasts_due(symbol, timeframe, now, limit=_MAX_SCORE_PER_CALL)
    if not due:
        return 0
    try:
        candles = await provider.get_candles(symbol, Timeframe(timeframe), 500)
    except Exception:  # noqa: BLE001 - upstream/network error → score later
        return 0

    scored = 0
    for row in due:
        realized = _realized_at(candles, int(row["target_ts"]))
        if realized is None:
            continue
        store.score_forecast(int(row["id"]), realized)
        scored += 1
    return scored


def _realized_at(candles, target_ts: int) -> float | None:
    """The close of the first candle at/after ``target_ts`` — the realized price
    nearest the forecast's target. ``None`` if the data doesn't reach that far."""
    for c in candles:
        if int(c.ts.timestamp()) >= target_ts:
            return float(c.close)
    return None


def scorecard(store, symbol: str) -> dict:
    """Summarise how this symbol's matured forecasts actually did."""
    rows = store.scored_forecasts(symbol, limit=_SCORECARD_WINDOW)
    n = len(rows)
    if n == 0:
        return {
            "n": 0,
            "directional_acc": None,
            "beat_naive_pct": None,
            "verdict": "No forecasts have matured yet — run a few and check back as time passes.",
        }

    dir_correct = 0
    beat_naive = 0
    for r in rows:
        made, pred, real = float(r["made_price"]), float(r["predicted"]), float(r["realized"])
        pred_dir = pred - made
        real_dir = real - made
        if pred_dir * real_dir > 0 or (pred_dir == 0 and real_dir == 0):
            dir_correct += 1
        if abs(pred - real) < abs(made - real):  # closer than the naive (last-price) guess
            beat_naive += 1

    dir_acc = round(100 * dir_correct / n)
    beat_pct = round(100 * beat_naive / n)
    return {
        "n": n,
        "directional_acc": dir_acc,
        "beat_naive_pct": beat_pct,
        "verdict": _verdict(dir_acc, n),
    }


def _verdict(dir_acc: int, n: int) -> str:
    if n < 8:
        return f"Only {n} forecast(s) scored so far — too few to judge. Keep going."
    if 42 <= dir_acc <= 58:
        return (
            "About a coin flip — and that's the point: short-term price moves are "
            "near-random, so a confident-looking line is not an edge to trade on."
        )
    if dir_acc > 58:
        return (
            f"Right on direction {dir_acc}% of the time on this small sample — better "
            "than chance here, but small samples flatter forecasts. Watch it regress."
        )
    return (
        f"Right only {dir_acc}% of the time — worse than a coin flip. Another reminder "
        "that predicting short-term price is a losing game."
    )
