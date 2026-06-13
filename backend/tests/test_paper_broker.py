"""Tests for the paper-trading engine.

Runnable two ways:
  * ``pytest backend/tests/test_paper_broker.py``
  * ``python backend/tests/test_paper_broker.py``  (no third-party deps needed)
"""

from __future__ import annotations

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

# Allow running directly (python tests/test_paper_broker.py) without install.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.brokers.paper import FillModel, PaperBroker  # noqa: E402
from app.domain.enums import OrderSide, OrderStatus, OrderType  # noqa: E402
from app.domain.trading import OrderRequest  # noqa: E402
from app.risk.limits import RiskLimits  # noqa: E402

D = Decimal


def run(coro):
    return asyncio.run(coro)


def _frictionless(starting_cash="100000", risk_limits=None) -> PaperBroker:
    """A broker with no slippage/fees for clean arithmetic assertions."""
    return PaperBroker(
        starting_cash=starting_cash,
        fill_model=FillModel(slippage_bps=0, fee_bps=0),
        risk_limits=risk_limits or RiskLimits(max_position_pct=D("1")),
    )


def test_market_buy_updates_cash_and_position():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    order = run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))

    assert order.status == OrderStatus.FILLED
    assert order.avg_fill_price == D("50000")
    assert b.cash == D("50000")
    pos = run(b.get_position("BTCUSDT"))
    assert pos is not None and pos.qty == D("1") and pos.avg_cost == D("50000")


def test_unrealized_pnl_marks_to_market():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))

    b.update_price("BTCUSDT", "55000")
    pos = run(b.get_position("BTCUSDT"))
    assert pos.unrealized_pnl == D("5000")
    acct = run(b.get_account())
    assert acct.equity == D("105000")  # 50,000 cash + 55,000 market value


def test_market_sell_realizes_pnl():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))
    b.update_price("BTCUSDT", "55000")
    run(b.place_order(OrderRequest("BTCUSDT", OrderSide.SELL, qty=D("1"))))

    assert b.cash == D("105000")
    assert run(b.get_position("BTCUSDT")) is None  # flat
    assert b._positions["BTCUSDT"].realized_pnl == D("5000")


def test_weighted_average_cost():
    b = _frictionless()
    b.update_price("ETHUSDT", "2000")
    run(b.place_order(OrderRequest("ETHUSDT", OrderSide.BUY, qty=D("1"))))
    b.update_price("ETHUSDT", "3000")
    run(b.place_order(OrderRequest("ETHUSDT", OrderSide.BUY, qty=D("1"))))

    pos = run(b.get_position("ETHUSDT"))
    assert pos.qty == D("2")
    assert pos.avg_cost == D("2500")  # (2000 + 3000) / 2


def test_notional_order_converts_to_qty():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    order = run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, notional=D("25000"))))
    assert order.qty == D("0.5")
    assert b.cash == D("75000")


def test_limit_buy_rests_then_fills_on_cross():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    order = run(
        b.place_order(
            OrderRequest(
                "BTCUSDT",
                OrderSide.BUY,
                type=OrderType.LIMIT,
                qty=D("1"),
                limit_price=D("48000"),
            )
        )
    )
    assert order.status == OrderStatus.PENDING  # price above limit, rests

    fills = b.update_price("BTCUSDT", "47000")  # crosses the limit
    assert len(fills) == 1
    refreshed = run(b.get_order(order.id))
    assert refreshed.status == OrderStatus.FILLED
    assert refreshed.avg_fill_price == D("48000")  # filled at the limit price
    assert b.cash == D("52000")


def test_stop_sell_triggers_as_market():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))
    stop = run(
        b.place_order(
            OrderRequest(
                "BTCUSDT",
                OrderSide.SELL,
                type=OrderType.STOP,
                qty=D("1"),
                stop_price=D("45000"),
            )
        )
    )
    assert stop.status == OrderStatus.PENDING

    b.update_price("BTCUSDT", "44000")  # drops through the stop
    refreshed = run(b.get_order(stop.id))
    assert refreshed.status == OrderStatus.FILLED
    assert run(b.get_position("BTCUSDT")) is None


def test_insufficient_cash_rejected():
    b = _frictionless(starting_cash="100000", risk_limits=RiskLimits(max_position_pct=D("10")))
    b.update_price("BTCUSDT", "50000")
    order = run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("3"))))  # needs 150k
    assert order.status == OrderStatus.REJECTED
    assert "cash" in order.reject_reason.lower()
    assert b.cash == D("100000")  # untouched


def test_short_sell_rejected():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    order = run(b.place_order(OrderRequest("BTCUSDT", OrderSide.SELL, qty=D("1"))))  # nothing held
    assert order.status == OrderStatus.REJECTED
    assert "short" in order.reject_reason.lower()


def test_risk_limit_blocks_oversized_position():
    # Default 25% cap; a 50k buy on a 100k account is 50% → rejected.
    b = PaperBroker(starting_cash="100000", fill_model=FillModel(0, 0))
    b.update_price("BTCUSDT", "50000")
    order = run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))
    assert order.status == OrderStatus.REJECTED
    assert order.risk_assessment["position_pct"] == 0.5
    assert any("one position" in r for r in order.risk_assessment["reasons"])


def test_market_order_without_data_rejected():
    b = _frictionless()
    order = run(b.place_order(OrderRequest("DOGEUSDT", OrderSide.BUY, qty=D("1"))))
    assert order.status == OrderStatus.REJECTED
    assert "market data" in order.reject_reason.lower()


def test_slippage_and_fees_applied():
    b = PaperBroker(
        starting_cash="100000",
        fill_model=FillModel(slippage_bps=10, fee_bps=10),  # 0.10% each
        risk_limits=RiskLimits(max_position_pct=D("1")),
    )
    b.update_price("BTCUSDT", "50000")
    order = run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))
    # Buy slips up 0.10%: 50,000 -> 50,050. Fee 0.10% of 50,050 = 50.05.
    assert order.avg_fill_price == D("50050")
    assert b.cash == D("100000") - D("50050") - D("50.05")


# --------------------------------------------------------------------------- #
# Standalone runner (no pytest required)
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"  FAIL  {t.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"  ERROR {t.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
