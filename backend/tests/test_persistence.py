"""Durability tests: the broker + bot survive a 'restart' (snapshot → restore).

Runnable two ways:
  * ``pytest backend/tests/test_persistence.py``
  * ``python backend/tests/test_persistence.py``  (no third-party deps needed)
"""

from __future__ import annotations

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.brokers.paper import FillModel, PaperBroker  # noqa: E402
from app.domain.enums import OrderSide, OrderStatus, OrderType  # noqa: E402
from app.domain.trading import OrderRequest  # noqa: E402
from app.persistence.store import Store  # noqa: E402
from app.risk.limits import RiskLimits  # noqa: E402
from app.strategies.bot import StrategyBot  # noqa: E402

D = Decimal


def run(coro):
    return asyncio.run(coro)


def _frictionless(account_id="paper") -> PaperBroker:
    return PaperBroker(
        account_id=account_id,
        fill_model=FillModel(slippage_bps=0, fee_bps=0),
        risk_limits=RiskLimits(max_position_pct=D("1")),
    )


# --------------------------------------------------------------------------- #
# Broker snapshot / restore
# --------------------------------------------------------------------------- #
def test_broker_snapshot_round_trip():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))

    restored = _frictionless()
    restored.load_snapshot(b.to_snapshot())

    assert restored.cash == b.cash
    pos = run(restored.get_position("BTCUSDT"))
    assert pos is not None and pos.qty == D("1") and pos.avg_cost == D("50000")
    assert restored._last_prices["BTCUSDT"] == D("50000")


def test_resting_stop_survives_restart_and_fills():
    b = _frictionless()
    b.update_price("BTCUSDT", "50000")
    run(b.place_order(OrderRequest("BTCUSDT", OrderSide.BUY, qty=D("1"))))
    # A protective stop rests below the market.
    run(
        b.place_order(
            OrderRequest("BTCUSDT", OrderSide.SELL, type=OrderType.STOP, qty=D("1"),
                         stop_price=D("48000"))
        )
    )

    # "Restart": serialize, rebuild a fresh broker, restore.
    restored = _frictionless()
    restored.load_snapshot(b.to_snapshot())

    # Restoring alone must NOT fill anything (no look-ahead).
    assert any(o.status == OrderStatus.PENDING for o in restored._orders.values())
    pos = run(restored.get_position("BTCUSDT"))
    assert pos is not None and pos.qty == D("1")

    # The next live price below the stop triggers it exactly as before.
    restored.update_price("BTCUSDT", "47900")
    assert all(o.status != OrderStatus.PENDING for o in restored._orders.values())
    assert run(restored.get_position("BTCUSDT")) is None  # flattened


# --------------------------------------------------------------------------- #
# Store primitives
# --------------------------------------------------------------------------- #
def test_store_events_and_trades_round_trip():
    s = Store(":memory:")
    s.append_event(100, "EURUSD", "forex", "analysis", "Trend up", False)
    s.append_event(200, "EURUSD", "forex", "signal", "Setup!", True)
    assert len(s.read_events(symbol="EURUSD")) == 2
    assert len(s.read_events(notify_only=True)) == 1  # only the signal notifies

    s.upsert_trade({"trade_id": "t1", "symbol": "EURUSD", "status": "open", "pnl": None,
                    "opened_at": 100})
    s.upsert_trade({"trade_id": "t1", "symbol": "EURUSD", "status": "closed", "pnl": 12.5,
                    "opened_at": 100})
    trades = s.read_trades()
    assert len(trades) == 1 and trades[0]["status"] == "closed" and trades[0]["pnl"] == 12.5


def test_bot_restore_rehydrates_trades_and_notes():
    store = Store(":memory:")
    broker = _frictionless("bot")
    bot = StrategyBot(broker, store=store)
    bot.watch("EURUSD", "forex")
    bot._add_note("EURUSD", "analysis", "Trend up — hunting a buy.")
    bot._persist_trade(
        {"trade_id": "t1", "symbol": "EURUSD", "asset_class": "forex", "side": "buy",
         "status": "open", "pnl": None, "opened_at": 100, "entry": 1.1}
    )
    bot._persist_state()

    # "Restart": a brand-new bot on the same store.
    fresh = StrategyBot(_frictionless("bot"), store=store)
    fresh.restore()

    assert any(t["trade_id"] == "t1" for t in fresh.trades)
    assert "EURUSD" in fresh._open  # open trade rebuilt from the log
    assert fresh.recent_notes("EURUSD"), "notes should be rehydrated"


def test_bot_without_store_still_works():
    # Persistence is additive — the no-store path must behave exactly as before.
    bot = StrategyBot(_frictionless("bot"))
    bot._add_note("BTCUSDT", "analysis", "hi")
    assert bot.recent_notes("BTCUSDT")


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
