"""Process-wide singletons for the v1 single-user demo.

v1 runs with one in-memory paper account, which is enough to exercise the full
learn-by-doing loop. When multi-tenancy lands, these are replaced by per-account
brokers hydrated from the database. Keeping the wiring behind these accessors
means routes and the agent never depend on that being the case.
"""

from __future__ import annotations

from functools import lru_cache

from app.agent.prompts import coach_system_prompt
from app.agent.service import AgentService, build_agent_service
from app.agent.tools.registry import ToolRegistry, build_default_registry
from app.brokers.paper import PaperBroker
from app.config import get_settings
from app.data.providers.base import MarketDataProvider
from app.data.providers.registry import get_provider

# Runtime AI credentials set from the Settings page (in-memory only, never
# persisted or logged). Lets a non-technical user enable the coach without
# editing .env. Falls back to environment settings when unset.
_ai_override: dict[str, str | None] = {"provider": None, "api_key": None}


def set_ai_credentials(provider: str | None, api_key: str | None) -> None:
    _ai_override["provider"] = provider
    _ai_override["api_key"] = api_key


# How directive the coach is: "reads" | "suggestions" | "copilot".
_coach_intensity = {"value": "reads"}


def set_coach_intensity(value: str | None) -> None:
    if value in ("reads", "suggestions", "copilot"):
        _coach_intensity["value"] = value


def get_coach_intensity() -> str:
    return _coach_intensity["value"]


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
    from app.persistence.store import get_store

    get_store().clear_scope("user_broker")  # don't resurrect the old account on restart
    get_broker.cache_clear()
    get_tool_registry.cache_clear()
    return get_broker()


def get_data_provider(asset_class: str = "crypto") -> MarketDataProvider:
    return get_provider(asset_class)


@lru_cache
def get_tool_registry() -> ToolRegistry:
    return build_default_registry(get_broker())


def get_agent_service(system: str | None = None) -> AgentService:
    settings = get_settings()
    return build_agent_service(
        provider=_active_provider(),
        registry=get_tool_registry(),
        model=settings.agent_model,
        api_key=_ai_override["api_key"] or settings.anthropic_api_key,
        system=system or coach_system_prompt(get_coach_intensity()),
    )


# --------------------------------------------------------------------------- #
# The strategy bot runs on its OWN separate demo account so the user can
# compare their results against the bot's.
# --------------------------------------------------------------------------- #
@lru_cache
def get_bot_broker() -> PaperBroker:
    settings = get_settings()
    return PaperBroker(account_id="bot-account", starting_cash=str(settings.paper_starting_cash))


@lru_cache
def get_strategy_bot():
    from app.persistence.store import get_store
    from app.strategies.bot import StrategyBot

    return StrategyBot(get_bot_broker(), store=get_store())


def reset_bot() -> None:
    from app.persistence.store import get_store

    store = get_store()
    store.clear_scope("bot_broker")
    store.clear_scope("bot_state")
    store.clear_trades()  # fresh account ⇒ fresh track record
    get_strategy_bot.cache_clear()
    get_bot_broker.cache_clear()
