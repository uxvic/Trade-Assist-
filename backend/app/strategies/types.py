"""Strategy value objects (float math; serialized to JSON for the API)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CandleF:
    """A candle with float OHLC (converted from the provider's Decimal candles)."""

    ts: int  # epoch seconds
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class Pivot:
    index: int
    ts: int
    price: float
    kind: str  # "high" | "low"


@dataclass
class Level:
    price: float
    type: str  # "support" | "resistance" (relative to current price)
    strength: float  # 0..1
    source_tf: str  # "1M" | "1d" | "4h" | "1h"
    touches: int
    last_touch_ts: int

    def to_dict(self) -> dict:
        return {
            "price": self.price,
            "type": self.type,
            "strength": round(self.strength, 3),
            "source_tf": self.source_tf,
            "touches": self.touches,
            "last_touch_ts": self.last_touch_ts,
        }


@dataclass
class Trend:
    direction: str  # "up" | "down" | "range"
    confidence: float
    reasons: list[str] = field(default_factory=list)
    ma50: float | None = None
    ma200: float | None = None

    def to_dict(self) -> dict:
        return {
            "direction": self.direction,
            "confidence": round(self.confidence, 2),
            "reasons": self.reasons,
            "ma50": self.ma50,
            "ma200": self.ma200,
        }


@dataclass
class Signal:
    state: str  # "buy" | "no_trade"
    reason: str
    level: Level | None = None
    confirmations: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "reason": self.reason,
            "level": self.level.to_dict() if self.level else None,
            "confirmations": self.confirmations,
        }


@dataclass
class ProposedTrade:
    symbol: str
    asset_class: str
    entry: float
    stop: float
    target: float
    risk_per_unit: float
    rationale: str
    side: str = "buy"
    rr: float = 3.0
    exit_policy: str = "eod"

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "asset_class": self.asset_class,
            "side": self.side,
            "entry": self.entry,
            "stop": self.stop,
            "target": self.target,
            "rr": self.rr,
            "risk_per_unit": self.risk_per_unit,
            "exit_policy": self.exit_policy,
            "rationale": self.rationale,
        }


@dataclass
class Analysis:
    symbol: str
    asset_class: str
    as_of: int
    current_price: float
    trend: Trend
    levels: list[Level]
    signal: Signal
    proposed_trade: ProposedTrade | None

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "asset_class": self.asset_class,
            "as_of": self.as_of,
            "current_price": self.current_price,
            "trend": self.trend.to_dict(),
            "levels": [lv.to_dict() for lv in self.levels],
            "signal": self.signal.to_dict(),
            "proposed_trade": self.proposed_trade.to_dict() if self.proposed_trade else None,
        }
