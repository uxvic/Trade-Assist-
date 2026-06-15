"""Process-wide singletons for the v1 single-user demo.

v1 runs with one in-memory paper account, which is enough to exercise the full
learn-by-doing loop. When multi-tenancy lands, these are replaced by per-account
brokers hydrated from the database. Keeping the wiring behind these accessors
means routes and the agent never depend on that being the case.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
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


# Email notifications (runtime, in-memory — same local-only policy as the AI key).
_email: dict[str, object] = {
    "provider": "resend",
    "api_key": None,
    "sender": None,
    "recipient": None,
    "digest": True,
}


def set_email_credentials(
    api_key: str | None, recipient: str | None, sender: str | None = None, digest: bool = True
) -> None:
    _email.update(api_key=api_key, recipient=recipient, sender=sender, digest=digest)


def email_configured() -> bool:
    return bool(_email["api_key"] and _email["recipient"])


def get_email_config() -> dict | None:
    return dict(_email) if email_configured() else None


# A sentinel "house" account for the shared bot's own AI reads (second opinion,
# colour commentary) — they only stream text, never trade a user's account.
HOUSE_USER_ID = 0


def _active_provider() -> str:
    return _ai_override["provider"] or get_settings().agent_provider


def ai_configured() -> bool:
    """Whether the coach has what it needs to run."""
    provider = _active_provider()
    if provider == "claude":
        return bool(_ai_override["api_key"] or get_settings().anthropic_api_key)
    # litellm reads its own env (OpenAI key, Ollama host, etc.)
    return True


# --------------------------------------------------------------------------- #
# Per-user accounts. Each logged-in user gets their own PaperBroker (and a tool
# registry bound to it), kept in a bounded LRU so memory stays sane as testers
# sign up. State is durable, so evicting an idle user's in-memory broker is
# lossless — it re-hydrates lazily from the SQLite snapshot on next request.
# --------------------------------------------------------------------------- #
_MAX_USERS_CACHED = 256
_user_brokers: OrderedDict[int, PaperBroker] = OrderedDict()
_user_registries: OrderedDict[int, ToolRegistry] = OrderedDict()
_user_lock = threading.Lock()


def _scope(user_id: int) -> str:
    return f"{user_id}:user_broker"


def _evict(cache: OrderedDict) -> None:
    while len(cache) > _MAX_USERS_CACHED:
        cache.popitem(last=False)


def get_broker(user_id: int) -> PaperBroker:
    from app.persistence.store import get_store

    with _user_lock:
        if user_id in _user_brokers:
            _user_brokers.move_to_end(user_id)
            return _user_brokers[user_id]
    # Build + lazily restore outside the lock (snapshot load can touch disk).
    settings = get_settings()
    broker = PaperBroker(
        account_id=f"user-{user_id}", starting_cash=str(settings.paper_starting_cash)
    )
    snap = get_store().load_snapshot(_scope(user_id))
    if snap:
        broker.load_snapshot(snap)
    with _user_lock:
        _user_brokers[user_id] = broker
        _user_brokers.move_to_end(user_id)
        _evict(_user_brokers)
        return _user_brokers[user_id]


def get_tool_registry(user_id: int) -> ToolRegistry:
    with _user_lock:
        if user_id in _user_registries:
            _user_registries.move_to_end(user_id)
            return _user_registries[user_id]
    reg = build_default_registry(get_broker(user_id))  # tools bound to THIS user's broker
    with _user_lock:
        _user_registries[user_id] = reg
        _user_registries.move_to_end(user_id)
        _evict(_user_registries)
        return _user_registries[user_id]


def save_user_broker(user_id: int) -> None:
    """Persist a user's account (best-effort)."""
    from app.persistence.store import get_store

    get_store().save_snapshot(_scope(user_id), get_broker(user_id).to_snapshot())


def reset_broker(user_id: int) -> PaperBroker:
    """Replace this user's account with a fresh one."""
    from app.persistence.store import get_store

    get_store().clear_scope(_scope(user_id))
    with _user_lock:
        _user_brokers.pop(user_id, None)
        _user_registries.pop(user_id, None)  # registry holds a ref to the old broker
    return get_broker(user_id)


def get_data_provider(asset_class: str = "crypto") -> MarketDataProvider:
    return get_provider(asset_class)


def get_agent_service(
    user_id: int, intensity: str | None = None, system: str | None = None
) -> AgentService:
    settings = get_settings()
    return build_agent_service(
        provider=_active_provider(),
        registry=get_tool_registry(user_id),
        model=settings.agent_model,
        api_key=_ai_override["api_key"] or settings.anthropic_api_key,
        system=system or coach_system_prompt(intensity or "reads"),
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
