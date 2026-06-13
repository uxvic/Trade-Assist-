"""Multi-tenant ORM models.

A representative slice of the Phase-1 schema. Money/quantity columns use
``Numeric(38, 18)`` (wide enough for crypto precision); every user-owned table
carries ``user_id`` for tenant isolation. This is intentionally not exhaustive
— more tables (quizzes, sentiment snapshots, billing) land in later phases.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

MONEY = Numeric(38, 18)


def _uuid() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


# --------------------------------------------------------------------------- #
# Identity & tenancy
# --------------------------------------------------------------------------- #
class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="active")
    plan_tier: Mapped[str] = mapped_column(String(20), default="free")
    disclaimers_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    settings: Mapped[UserSettings] = relationship(back_populates="user", uselist=False)
    accounts: Mapped[list[Account]] = relationship(back_populates="user")


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    default_model: Mapped[str | None] = mapped_column(String(60))
    risk_profile: Mapped[str] = mapped_column(String(20), default="beginner")
    ui_prefs: Mapped[dict] = mapped_column(JSON, default=dict)

    user: Mapped[User] = relationship(back_populates="settings")


# --------------------------------------------------------------------------- #
# Trading
# --------------------------------------------------------------------------- #
class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    broker_type: Mapped[str] = mapped_column(String(20), default="paper")
    base_currency: Mapped[str] = mapped_column(String(8), default="USD")
    cash_balance: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("100000"))

    user: Mapped[User] = relationship(back_populates="accounts")
    positions: Mapped[list[PositionRow]] = relationship(back_populates="account")
    orders: Mapped[list[OrderRow]] = relationship(back_populates="account")


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    symbol: Mapped[str] = mapped_column(String(40), index=True)
    asset_class: Mapped[str] = mapped_column(String(20))
    exchange: Mapped[str | None] = mapped_column(String(40))
    tick_size: Mapped[Decimal | None] = mapped_column(Numeric(38, 18))
    data_provider: Mapped[str | None] = mapped_column(String(40))


class OrderRow(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(40), index=True)
    side: Mapped[str] = mapped_column(String(8))
    type: Mapped[str] = mapped_column(String(16))
    qty: Mapped[Decimal] = mapped_column(MONEY)
    limit_price: Mapped[Decimal | None] = mapped_column(MONEY)
    stop_price: Mapped[Decimal | None] = mapped_column(MONEY)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    filled_qty: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    avg_fill_price: Mapped[Decimal | None] = mapped_column(MONEY)
    reject_reason: Mapped[str | None] = mapped_column(Text)
    risk_assessment: Mapped[dict | None] = mapped_column(JSON)

    account: Mapped[Account] = relationship(back_populates="orders")
    fills: Mapped[list[FillRow]] = relationship(back_populates="order")


class FillRow(Base):
    __tablename__ = "fills"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    qty: Mapped[Decimal] = mapped_column(MONEY)
    price: Mapped[Decimal] = mapped_column(MONEY)
    fee: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    slippage: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    filled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    order: Mapped[OrderRow] = relationship(back_populates="fills")


class PositionRow(Base, TimestampMixin):
    __tablename__ = "positions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(40), index=True)
    qty: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    avg_cost: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    realized_pnl: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))

    account: Mapped[Account] = relationship(back_populates="positions")


# --------------------------------------------------------------------------- #
# Learning
# --------------------------------------------------------------------------- #
class Module(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200))
    order: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[str] = mapped_column(String(20), default="beginner")


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    order: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text, default="")
    est_minutes: Mapped[int] = mapped_column(Integer, default=5)


class UserProgress(Base, TimestampMixin):
    __tablename__ = "user_progress"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="not_started")
    quiz_score: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# --------------------------------------------------------------------------- #
# Agent & engagement
# --------------------------------------------------------------------------- #
class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str | None] = mapped_column(String(200))


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text, default="")
    tool_calls: Mapped[dict | None] = mapped_column(JSON)
    model_used: Mapped[str | None] = mapped_column(String(60))
    tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Watchlist(Base):
    __tablename__ = "watchlists"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="Default")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    watchlist_id: Mapped[str] = mapped_column(ForeignKey("watchlists.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(40))


class Alert(Base, TimestampMixin):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(40), index=True)
    condition: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="active")
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class KnowledgeChunk(Base):
    """RAG corpus. ``embedding`` is stored as JSON here for portability; switch
    to a pgvector ``Vector`` column once the pgvector extension is enabled."""

    __tablename__ = "knowledge_chunks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    source: Mapped[str | None] = mapped_column(String(200))
    concept: Mapped[str | None] = mapped_column(String(120), index=True)
    difficulty: Mapped[str] = mapped_column(String(20), default="beginner")
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list | None] = mapped_column(JSON)
