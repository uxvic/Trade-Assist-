"""The broker abstraction — the paper-now / real-later seam.

Both the agent's order tool and the order-ticket API call *only* this
interface, never a concrete broker. Switching execution backends is therefore
a configuration change (``account.broker_type``), not a rewrite.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.trading import AccountState, Order, OrderRequest, Position


class BrokerInterface(ABC):
    @abstractmethod
    async def get_account(self) -> AccountState:
        """Return cash, equity, and buying power for the account."""

    @abstractmethod
    async def get_positions(self) -> list[Position]:
        """Return all currently open positions."""

    @abstractmethod
    async def get_position(self, symbol: str) -> Position | None:
        """Return the open position for ``symbol``, or ``None``."""

    @abstractmethod
    async def place_order(self, request: OrderRequest) -> Order:
        """Validate and submit an order. May fill immediately or rest pending."""

    @abstractmethod
    async def cancel_order(self, order_id: str) -> Order:
        """Cancel a resting order. No-op semantics if already filled/cancelled."""

    @abstractmethod
    async def get_order(self, order_id: str) -> Order | None:
        """Look up a single order by id."""

    @abstractmethod
    async def get_orders(self) -> list[Order]:
        """Return all orders for the account, newest first."""
