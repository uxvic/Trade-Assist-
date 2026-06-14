"""Rules-based trading strategy engine.

Pure-Python, deterministic, network-free core that turns candles into support/
resistance levels, a trend read, and an entry signal — encoding a real trader's
multi-timeframe S&R + 30m-breakout method. This is *disciplined rule-application,
not price prediction.* All math here is ``float``; ``Decimal`` is only used at the
``PaperBroker`` boundary.
"""
