"""Market-data providers.

Each market sits behind :class:`MarketDataProvider` so that swapping a free
feed for a paid one (or one exchange for another) is a configuration change,
not a rewrite. Crypto has the only genuinely-free real-time streaming feed and
therefore carries the MVP.
"""
