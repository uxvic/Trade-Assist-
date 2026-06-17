"""A thin, guarded wrapper around Google's TimesFM time-series model.

Design constraints that matter here:

* **Lazy + cached.** The model (PyTorch + ~800 MB of weights downloaded on first
  use) loads once, on the first forecast request — never at import time. So the
  app boots and the test suite runs with no ML dependency present.
* **Graceful.** Any failure (missing dependency, no network for the weight
  download, OOM, version drift in the TimesFM API) raises :class:`ForecastUnavailable`,
  which the route turns into a clean 503. The rest of the app is unaffected.
* **Off the event loop.** Inference is blocking; callers run :func:`forecast`
  inside ``asyncio.to_thread`` so the always-on bot loop and request handlers
  never stall on it.

The public contract is intentionally tiny: feed recent close prices, get back a
point path plus a P10/P90 uncertainty band.
"""

from __future__ import annotations

import threading

# Seconds per timeframe — used to project forecast points onto future
# timestamps. Mirrors ``app.data.providers.base.Timeframe`` values.
TF_SECONDS: dict[str, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
    "1M": 2629800,
}

_MODEL_REPO = "google/timesfm-2.5-200m-pytorch"
_MAX_CONTEXT = 1024
_MAX_HORIZON = 256
_MIN_CONTEXT = 32  # below this the model has nothing useful to chew on

_model = None
_model_lock = threading.Lock()


class ForecastUnavailable(RuntimeError):
    """The forecasting model can't be loaded or run right now.

    Carries a user-facing message (missing dependency, offline first-run,
    not enough history, …). The API surfaces it as a 503 — never a 500.
    """


def _compile(model, timesfm) -> None:
    """Compile with the continuous quantile head (for P10/P90 bands).

    Falls back to the minimal config if a kwarg isn't recognised by the
    installed TimesFM version, so optional-flag drift can't break loading.
    """
    try:
        model.compile(
            timesfm.ForecastConfig(
                max_context=_MAX_CONTEXT,
                max_horizon=_MAX_HORIZON,
                normalize_inputs=True,
                use_continuous_quantile_head=True,
                fix_quantile_crossing=True,
            )
        )
    except TypeError:
        model.compile(timesfm.ForecastConfig(max_context=_MAX_CONTEXT, max_horizon=_MAX_HORIZON))


def _load():
    """Load + compile the model once (thread-safe). Raises ForecastUnavailable."""
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        try:
            import timesfm
        except Exception as exc:  # noqa: BLE001 - ImportError or a partial install
            raise ForecastUnavailable(
                "The forecasting model isn't installed. Add the optional "
                "'timesfm[torch]' dependency to enable forecasts."
            ) from exc
        try:
            model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(_MODEL_REPO)
            _compile(model, timesfm)
        except Exception as exc:  # noqa: BLE001 - download/network/OOM/API drift
            raise ForecastUnavailable(
                "Couldn't load the forecasting model. The first run downloads "
                "~800 MB of weights and needs network access; it's also slow on CPU."
            ) from exc
        _model = model
        return _model


def _stddev(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    return (sum((v - mean) ** 2 for v in values) / (n - 1)) ** 0.5


def _band(
    quantiles, point_row: list[float], context: list[float]
) -> tuple[list[float], list[float]]:
    """Extract a P10/P90 band from the model's quantile head.

    TimesFM returns ``(batch, horizon, n_quantiles)`` where the last axis is
    ``[mean, q10, q20, …, q90]``. If that layout isn't present (version drift),
    fall back to a volatility-derived band so the caller always gets *some*
    honest uncertainty rather than a bare line.
    """
    h = len(point_row)
    try:
        import numpy as np

        q = np.asarray(quantiles[0])
        if q.ndim == 2 and q.shape[1] >= 10:
            lower = [float(x) for x in q[:h, 1]]  # P10
            upper = [float(x) for x in q[:h, 9]]  # P90
            return lower, upper
    except Exception:  # noqa: BLE001 - any shape/version surprise → fall through
        pass
    # ~1.28σ ≈ the 10th/90th percentile of a normal — a reasonable stand-in.
    spread = _stddev(context) * 1.28
    return [p - spread for p in point_row], [p + spread for p in point_row]


def forecast(values: list[float], horizon: int) -> dict[str, list[float]]:
    """Forecast the next ``horizon`` steps of a price series.

    ``values`` are recent close prices (oldest first). Returns ``point`` (the
    median path) plus ``lower``/``upper`` (the P10/P90 band). Raises
    :class:`ForecastUnavailable` if the model can't run or there's too little
    history. Blocking — call via ``asyncio.to_thread``.
    """
    series = [float(v) for v in values if v == v]  # drop NaNs
    if len(series) < _MIN_CONTEXT:
        raise ForecastUnavailable("Not enough price history to forecast.")
    horizon = max(1, min(int(horizon), _MAX_HORIZON))
    context = series[-_MAX_CONTEXT:]

    model = _load()
    try:
        import numpy as np

        point, quantiles = model.forecast(
            horizon=horizon, inputs=[np.asarray(context, dtype=float)]
        )
    except ForecastUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ForecastUnavailable(f"The forecast failed to run: {exc}") from exc

    point_row = [float(x) for x in list(point[0])[:horizon]]
    lower, upper = _band(quantiles, point_row, context)
    return {"point": point_row, "lower": lower, "upper": upper}
