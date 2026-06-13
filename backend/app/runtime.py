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

# Runtime AI credentials set from the Settings page (in-memory only, never
# persisted or logged). Lets a non-technical user enable the coach without
# editing .env. Falls back to environment settings when unset.
_ai_override: dict[str, str | None] = {"provider": None, "api_key": None}


def set_ai_credentials(provider: str | None, api_key: str | None) -> None:
    _ai_override["provider"] = provider
    _ai_override["api_key"] = api_key


def _active_provider() -> str:
    return _ai_override["provider"] or get_settings().agent_provider


def ai_configured() -> bool:
    """Whether the coach has what it needs to run."""
    provider = _active_provider()
    if provider == "claude":
        return bool(_ai_override["api_key"] or get_settings().anthropic_api_key)
    # litellm reads its own env (OpenAI key, Ollama host, etc.)
    return True


@lru_cache
def get_broker() -> PaperBroker:
    settings = get_settings()
    return PaperBroker(starting_cash=str(settings.paper_starting_cash))


def reset_broker() -> PaperBroker:
    """Replace the demo account with a fresh one."""
    get_broker.cache_clear()
    get_tool_registry.cache_clear()
    return get_broker()


@lru_cache
def get_data_provider() -> MarketDataProvider:
    return BinanceProvider()


@lru_cache
def get_tool_registry() -> ToolRegistry:
    return build_default_registry(get_broker(), get_data_provider())


def get_agent_service() -> AgentService:
    settings = get_settings()
    return build_agent_service(
        provider=_active_provider(),
        registry=get_tool_registry(),
        model=settings.agent_model,
        api_key=_ai_override["api_key"] or settings.anthropic_api_key,
    )
