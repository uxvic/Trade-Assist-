"""The agent tool registry.

A ``Tool`` is a name + description + JSON-schema + async handler. The
``ToolRegistry`` is the single source of truth that can emit schemas in either
Anthropic or OpenAI tool-calling format, so the same tools work across every
provider. ``build_default_registry`` wires the tools to live services (the
broker and the market-data provider).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from decimal import Decimal

from app.brokers.base import BrokerInterface
from app.data.providers.base import Timeframe
from app.data.providers.registry import get_provider
from app.domain.enums import OrderSide, OrderType
from app.domain.trading import OrderRequest

ToolHandler = Callable[[dict], Awaitable[dict]]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict  # JSON schema (object)
    handler: ToolHandler

    def to_anthropic(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }

    def to_openai(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return list(self._tools)

    def to_anthropic(self) -> list[dict]:
        return [t.to_anthropic() for t in self._tools.values()]

    def to_openai(self) -> list[dict]:
        return [t.to_openai() for t in self._tools.values()]

    async def call(self, name: str, arguments: dict) -> dict:
        tool = self._tools.get(name)
        if tool is None:
            return {"error": f"Unknown tool: {name}"}
        try:
            return await tool.handler(arguments)
        except Exception as exc:  # noqa: BLE001 - surfaced to the model, not crashed
            return {"error": f"{type(exc).__name__}: {exc}"}


_ASSET_CLASS_PROP = {
    "type": "string",
    "enum": ["crypto", "forex"],
    "default": "crypto",
    "description": "Which market the symbol belongs to.",
}


def build_default_registry(broker: BrokerInterface) -> ToolRegistry:
    """Wire the core MVP tools to live services."""

    registry = ToolRegistry()

    # -- read: market data -------------------------------------------------
    async def get_quote(args: dict) -> dict:
        provider = get_provider(args.get("asset_class", "crypto"))
        q = await provider.get_quote(args["symbol"])
        return {"symbol": q.symbol, "last": str(q.last), "bid": str(q.bid), "ask": str(q.ask)}

    registry.register(
        Tool(
            name="get_quote",
            description="Get the latest price (last/bid/ask) for a symbol, e.g. BTCUSDT or EURUSD.",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "Ticker symbol"},
                    "asset_class": _ASSET_CLASS_PROP,
                },
                "required": ["symbol"],
            },
            handler=get_quote,
        )
    )

    async def get_chart(args: dict) -> dict:
        provider = get_provider(args.get("asset_class", "crypto"))
        tf = Timeframe(args.get("timeframe", "1m"))
        candles = await provider.get_candles(args["symbol"], tf, int(args.get("limit", 50)))
        return {
            "symbol": args["symbol"],
            "timeframe": tf.value,
            "candles": [
                {
                    "ts": c.ts.isoformat(),
                    "o": str(c.open),
                    "h": str(c.high),
                    "l": str(c.low),
                    "c": str(c.close),
                    "v": str(c.volume),
                }
                for c in candles
            ],
        }

    registry.register(
        Tool(
            name="get_chart",
            description="Get recent OHLCV candles for a symbol to reason about price action.",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "asset_class": _ASSET_CLASS_PROP,
                    "timeframe": {
                        "type": "string",
                        "enum": [tf.value for tf in Timeframe],
                        "default": "1m",
                    },
                    "limit": {"type": "integer", "default": 50, "maximum": 200},
                },
                "required": ["symbol"],
            },
            handler=get_chart,
        )
    )

    # -- read: account -----------------------------------------------------
    async def get_portfolio(_args: dict) -> dict:
        account = await broker.get_account()
        positions = await broker.get_positions()
        return {
            "cash": str(account.cash),
            "equity": str(account.equity),
            "currency": account.currency,
            "positions": [
                {
                    "symbol": p.symbol,
                    "qty": str(p.qty),
                    "avg_cost": str(p.avg_cost),
                    "market_price": str(p.market_price),
                    "unrealized_pnl": str(p.unrealized_pnl),
                    "realized_pnl": str(p.realized_pnl),
                }
                for p in positions
            ],
        }

    registry.register(
        Tool(
            name="get_portfolio",
            description="Get the user's paper account: cash, equity, and open positions with P&L.",
            parameters={"type": "object", "properties": {}},
            handler=get_portfolio,
        )
    )

    # -- act: place a paper order -----------------------------------------
    async def place_paper_order(args: dict) -> dict:
        # Price the order off the live market first, like the order-ticket API.
        try:
            provider = get_provider(args.get("asset_class", "crypto"))
            quote = await provider.get_quote(args["symbol"])
            broker.update_price(args["symbol"], quote.last)  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass
        req = OrderRequest(
            symbol=args["symbol"],
            side=OrderSide(args["side"]),
            type=OrderType(args.get("type", "market")),
            qty=Decimal(str(args["qty"])) if args.get("qty") is not None else None,
            notional=Decimal(str(args["notional"])) if args.get("notional") is not None else None,
            limit_price=Decimal(str(args["limit_price"])) if args.get("limit_price") else None,
            stop_price=Decimal(str(args["stop_price"])) if args.get("stop_price") else None,
        )
        order = await broker.place_order(req)
        return {
            "order_id": order.id,
            "status": order.status.value,
            "symbol": order.symbol,
            "side": order.side.value,
            "qty": str(order.qty),
            "avg_fill_price": str(order.avg_fill_price) if order.avg_fill_price else None,
            "reject_reason": order.reject_reason,
            "risk_assessment": order.risk_assessment,
        }

    registry.register(
        Tool(
            name="place_paper_order",
            description=(
                "Place a simulated (paper) order. Always passes through the risk check "
                "first; report the risk assessment to the user. Provide either qty or notional."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "asset_class": _ASSET_CLASS_PROP,
                    "side": {"type": "string", "enum": ["buy", "sell"]},
                    "type": {
                        "type": "string",
                        "enum": ["market", "limit", "stop"],
                        "default": "market",
                    },
                    "qty": {"type": "number", "description": "Quantity in units"},
                    "notional": {"type": "number", "description": "Cash amount instead of qty"},
                    "limit_price": {"type": "number"},
                    "stop_price": {"type": "number"},
                },
                "required": ["symbol", "side"],
            },
            handler=place_paper_order,
        )
    )

    # -- teach: RAG over the knowledge base (stub until KB is populated) ---
    async def explain_concept(args: dict) -> dict:
        concept = args["concept"]
        return {
            "concept": concept,
            "note": (
                "Knowledge-base retrieval is not wired yet (Phase 1 RAG). "
                "Explain from first principles in beginner-friendly terms for now."
            ),
        }

    registry.register(
        Tool(
            name="explain_concept",
            description="Retrieve grounded teaching material for a trading concept (RAG).",
            parameters={
                "type": "object",
                "properties": {"concept": {"type": "string"}},
                "required": ["concept"],
            },
            handler=explain_concept,
        )
    )

    # -- co-pilot: propose a complete trade for the user to approve --------
    async def propose_trade(args: dict) -> dict:
        # Suggestion only — never executes. The UI renders it as an approve card.
        keys = [
            "symbol", "asset_class", "side", "notional",
            "entry", "stop", "target", "leverage", "rationale", "risk",
        ]
        return {"proposal": {k: args.get(k) for k in keys}}

    registry.register(
        Tool(
            name="propose_trade",
            description=(
                "Propose a complete trade for the user to approve (co-pilot mode). Does NOT "
                "execute — the user taps to confirm. Always include rationale and the key risk."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "asset_class": _ASSET_CLASS_PROP,
                    "side": {"type": "string", "enum": ["buy", "sell"]},
                    "notional": {"type": "number", "description": "Suggested size in dollars"},
                    "entry": {"type": "number", "description": "Suggested entry price (optional)"},
                    "stop": {"type": "number", "description": "Suggested stop-loss price"},
                    "target": {"type": "number", "description": "Suggested take-profit price"},
                    "leverage": {"type": "number", "description": "Suggested leverage (1 = none)"},
                    "rationale": {"type": "string"},
                    "risk": {"type": "string", "description": "The key risk in plain language"},
                },
                "required": ["symbol", "side", "rationale"],
            },
            handler=propose_trade,
        )
    )

    return registry


def build_analysis_registry(asset_class: str) -> ToolRegistry:
    """A read-only registry for the market-analysis agents (Analyst/Reviewer).

    Recommend-only **by construction**: it has no order-placing tool, so the
    pipeline can never touch any account. The data tools are pre-bound to the
    instrument's ``asset_class`` so the model cannot accidentally fetch crypto
    data while analysing a forex pair (it can't pass the wrong ``asset_class``).
    ``propose_trade`` is included — it only *suggests* (never executes), letting
    the Reviewer hand the user a fillable entry/stop/target.
    """
    registry = ToolRegistry()
    provider = get_provider(asset_class)

    async def get_quote(args: dict) -> dict:
        q = await provider.get_quote(args["symbol"])
        return {"symbol": q.symbol, "last": str(q.last), "bid": str(q.bid), "ask": str(q.ask)}

    registry.register(
        Tool(
            name="get_quote",
            description=f"Get the latest price (last/bid/ask) for a {asset_class} symbol.",
            parameters={
                "type": "object",
                "properties": {"symbol": {"type": "string", "description": "Ticker symbol"}},
                "required": ["symbol"],
            },
            handler=get_quote,
        )
    )

    async def get_chart(args: dict) -> dict:
        tf = Timeframe(args.get("timeframe", "1h"))
        candles = await provider.get_candles(args["symbol"], tf, int(args.get("limit", 80)))
        return {
            "symbol": args["symbol"],
            "timeframe": tf.value,
            "candles": [
                {
                    "ts": c.ts.isoformat(),
                    "o": str(c.open),
                    "h": str(c.high),
                    "l": str(c.low),
                    "c": str(c.close),
                    "v": str(c.volume),
                }
                for c in candles
            ],
        }

    registry.register(
        Tool(
            name="get_chart",
            description="Get recent OHLCV candles for the symbol to reason about price action.",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "timeframe": {
                        "type": "string",
                        "enum": [tf.value for tf in Timeframe],
                        "default": "1h",
                    },
                    "limit": {"type": "integer", "default": 80, "maximum": 200},
                },
                "required": ["symbol"],
            },
            handler=get_chart,
        )
    )

    async def explain_concept(args: dict) -> dict:
        return {
            "concept": args.get("concept", ""),
            "note": "Explain from first principles in beginner-friendly terms.",
        }

    registry.register(
        Tool(
            name="explain_concept",
            description="Retrieve grounded teaching material for a trading concept.",
            parameters={
                "type": "object",
                "properties": {"concept": {"type": "string"}},
                "required": ["concept"],
            },
            handler=explain_concept,
        )
    )

    async def propose_trade(args: dict) -> dict:
        keys = [
            "symbol", "asset_class", "side", "notional",
            "entry", "stop", "target", "leverage", "rationale", "risk",
        ]
        return {"proposal": {k: args.get(k) for k in keys}}

    registry.register(
        Tool(
            name="propose_trade",
            description=(
                "Suggest a complete trade for the user to review (entry/stop/target/side). Does "
                "NOT execute — the user taps to confirm in their order form. Include a rationale "
                "and the key risk."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "asset_class": {"type": "string"},
                    "side": {"type": "string", "enum": ["buy", "sell"]},
                    "notional": {"type": "number", "description": "Suggested size in dollars"},
                    "entry": {"type": "number"},
                    "stop": {"type": "number"},
                    "target": {"type": "number"},
                    "leverage": {"type": "number"},
                    "rationale": {"type": "string"},
                    "risk": {"type": "string"},
                },
                "required": ["symbol", "side", "rationale"],
            },
            handler=propose_trade,
        )
    )

    return registry
