"""Deterministic order risk assessment.

The :func:`assess_order` function is the single source of truth for whether an
order is allowed. It returns a structured assessment that the broker uses to
accept/reject and that the agent surfaces to the user as a teachable moment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.domain.enums import OrderSide

ZERO = Decimal("0")


@dataclass
class RiskLimits:
    """Per-account risk configuration. Beginner-safe defaults."""

    # Max fraction of account equity allowed in a single new position.
    max_position_pct: Decimal = Decimal("0.25")
    # Short selling and margin are off for beginners in v1.
    allow_short: bool = False
    allow_margin: bool = False
    # Overtrading guard (evaluated by the engine over a rolling window).
    max_orders_per_window: int = 20
    window_seconds: int = 300


@dataclass
class RiskAssessment:
    passed: bool
    position_pct: Decimal
    notional: Decimal
    reasons: list[str] = field(default_factory=list)  # hard failures (reject)
    warnings: list[str] = field(default_factory=list)  # soft nudges (allow)

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "position_pct": float(self.position_pct),
            "notional": float(self.notional),
            "reasons": list(self.reasons),
            "warnings": list(self.warnings),
        }


def assess_order(
    limits: RiskLimits,
    *,
    side: OrderSide,
    qty: Decimal,
    price: Decimal,
    equity: Decimal,
    existing_qty: Decimal,
    cash: Decimal,
    fee: Decimal,
) -> RiskAssessment:
    """Assess a proposed order against the account's risk limits.

    ``reasons`` are hard failures that block the order; ``warnings`` are soft
    nudges that still allow it. The split is what lets the coach say "you *can*
    do this, but here's the risk" versus "I won't let you do that".
    """

    notional = qty * price
    position_pct = (notional / equity) if equity > 0 else ZERO
    reasons: list[str] = []
    warnings: list[str] = []

    if side == OrderSide.SELL and not limits.allow_short and qty > existing_qty:
        reasons.append(
            f"Short selling is disabled: you can't sell {qty} when you hold {existing_qty}."
        )

    if side == OrderSide.BUY and not limits.allow_margin and (notional + fee) > cash:
        reasons.append("Insufficient cash for this order (trading on margin is disabled).")

    if side == OrderSide.BUY and position_pct > limits.max_position_pct:
        reasons.append(
            f"This would put {position_pct:.0%} of your account into one position; "
            f"the safety limit is {limits.max_position_pct:.0%}. Consider a smaller size."
        )

    # Soft nudge once a buy crosses half the per-position limit.
    half_limit = limits.max_position_pct / 2
    if side == OrderSide.BUY and half_limit < position_pct <= limits.max_position_pct:
        warnings.append(
            "This is a sizeable position relative to your account — make sure you "
            "have a stop-loss level in mind before you commit."
        )

    return RiskAssessment(
        passed=not reasons,
        position_pct=position_pct,
        notional=notional,
        reasons=reasons,
        warnings=warnings,
    )
