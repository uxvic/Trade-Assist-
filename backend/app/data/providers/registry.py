"""Routes a request to the right market-data provider by asset class.

This is the seam that lets the app trade crypto and forex (and, later, stocks)
through one set of endpoints. Add a provider here and the whole app gains the
asset class without touching routes or the UI.
"""

from __future__ import annotations

from functools import lru_cache

from app.data.providers.base import InstrumentInfo, MarketDataProvider
from app.data.providers.crypto import BinanceProvider
from app.data.providers.forex import ForexProvider
from app.data.providers.stocks import StocksProvider

# Asset classes the UI can pick from, in display order.
ASSET_CLASSES = ["crypto", "forex", "stocks"]


@lru_cache
def _providers() -> dict[str, MarketDataProvider]:
    return {
        "crypto": BinanceProvider(),
        "forex": ForexProvider(),
        "stocks": StocksProvider(),
    }


def get_provider(asset_class: str) -> MarketDataProvider:
    providers = _providers()
    if asset_class not in providers:
        raise KeyError(f"Unsupported asset class: {asset_class!r}")
    return providers[asset_class]


async def search_instruments(
    asset_class: str, query: str = "", limit: int = 30
) -> list[InstrumentInfo]:
    return await get_provider(asset_class).search_instruments(query, limit)
