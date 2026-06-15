"""Stocks & ETFs via Yahoo Finance — reuses the forex provider's yfinance
machinery (fetch, resample-to-4h, intervals/periods); only the ticker mapping
and the searchable universe differ. No API key required.

Same honest caveats as forex: yfinance is unofficial/best-effort and intraday
history is capped — fine for a learning demo, swappable for a licensed feed.
"""

from __future__ import annotations

from app.data.providers.base import InstrumentInfo
from app.data.providers.forex import ForexProvider
from app.domain.enums import AssetClass

# A curated, popular universe (big-cap stocks + common ETFs).
STOCKS: list[tuple[str, str]] = [
    ("AAPL", "Apple"),
    ("MSFT", "Microsoft"),
    ("NVDA", "NVIDIA"),
    ("AMZN", "Amazon"),
    ("GOOGL", "Alphabet (Google)"),
    ("META", "Meta Platforms"),
    ("TSLA", "Tesla"),
    ("NFLX", "Netflix"),
    ("AMD", "AMD"),
    ("JPM", "JPMorgan Chase"),
    ("V", "Visa"),
    ("DIS", "Disney"),
    ("KO", "Coca-Cola"),
    ("BA", "Boeing"),
    ("SPY", "S&P 500 ETF (SPY)"),
    ("QQQ", "Nasdaq 100 ETF (QQQ)"),
    ("VTI", "Total US Market ETF (VTI)"),
    ("DIA", "Dow Jones ETF (DIA)"),
    ("IWM", "Russell 2000 ETF (IWM)"),
    ("ARKK", "ARK Innovation ETF (ARKK)"),
]


class StocksProvider(ForexProvider):
    asset_classes = (AssetClass.EQUITY, AssetClass.ETF)
    supports_streaming = False

    def _ticker(self, symbol: str) -> str:
        # For equities the symbol IS the Yahoo ticker (AAPL → AAPL).
        return symbol.upper()

    async def search_instruments(self, query: str = "", limit: int = 30) -> list[InstrumentInfo]:
        q = query.strip().upper()
        out: list[InstrumentInfo] = []
        for sym, name in STOCKS:
            if q and q not in sym and q not in name.upper():
                continue
            out.append(InstrumentInfo(symbol=sym, name=name, ticker=sym, asset_class="stocks"))
            if len(out) >= limit:
                break
        return out
