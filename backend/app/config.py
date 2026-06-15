"""Application configuration, loaded from environment / .env.

Secrets (API keys, DB URLs) live in the environment, never in the repo. See
``.env.example`` at the repo root for the full list.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Trade-Assist"
    environment: str = "development"
    debug: bool = True
    version: str = "0.1.0"

    # Datastores
    database_url: str = "postgresql+asyncpg://trade:trade@localhost:5432/tradeassist"
    redis_url: str = "redis://localhost:6379/0"

    # LLM / agent
    agent_provider: str = "claude"  # "claude" | "litellm"
    agent_model: str | None = None  # None → provider default
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None

    # Paper trading
    paper_starting_cash: float = 100_000.0

    # Durability — zero-config SQLite file (mount ./data as a volume to deploy).
    sqlite_path: str = "./data/trade_assist.db"

    # Web
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
