"""Process-wide singletons for the v1 single-user demo.

v1 runs with one in-memory paper account, which is enough to exercise the full
learn-by-doing loop. When multi-tenancy lands, these are replaced by per-account
brokers hydrated from the database. Keeping the wiring behind these accessors
means routes and the agent never depend on that being the case.
"""

from __future__ import annotations

from functools import lru_cache

from app.agent.service import AgentService, build_agent_service
from app.agent.tools.registry import ToolRegistry, build_default_registry
from app.brokers.paper import PaperBroker
from app.config import get_settings
from app.data.providers.base import MarketDataProvider
from app.data.providers.crypto import BinanceProvider


@lru_cache
def get_broker() -> PaperBroker:
    settings = get_settings()
    return PaperBroker(starting_cash=str(settings.paper_starting_cash))


@lru_cache
def get_data_provider() -> MarketDataProvider:
    return BinanceProvider()


@lru_cache
def get_tool_registry() -> ToolRegistry:
    return build_default_registry(get_broker(), get_data_provider())


def get_agent_service() -> AgentService:
    settings = get_settings()
    return build_agent_service(
        provider=settings.agent_provider,
        registry=get_tool_registry(),
        model=settings.agent_model,
        api_key=settings.anthropic_api_key,
    )
