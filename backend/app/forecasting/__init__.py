"""On-demand probabilistic forecasting — the honest "forecast lens".

This package wraps a heavy time-series foundation model (TimesFM) behind a
small, guarded interface. It is deliberately **not** a trading signal and is
never wired into the bot or the order ticket. Every projection is paired with a
live accuracy scorecard (``scoring``) so the learner can see for themselves that
short-term price is near-random — which is the whole pedagogical point.
"""
