"""Database tables. Mirrors the data model in technical.md."""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, false, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    role: Mapped[str] = mapped_column(String(16), default="user")  # "admin" or "user"
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    preferences: Mapped[str] = mapped_column(Text, default="{}")  # JSON: theme, reply length, context
    # When the user confirmed being 18 or older (asked once, at the first login). None = not yet.
    age_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Two-factor login (TOTP). The secret is encrypted (secret.py); recovery codes are stored as hashes (JSON list).
    totp_secret: Mapped[str | None] = mapped_column(String(256), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    recovery_codes: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    # Persona: who the user plays in roleplays; the model knows it.
    persona_name: Mapped[str] = mapped_column(String(128), default="", server_default="")
    persona_description: Mapped[str] = mapped_column(Text, default="", server_default="")
    avatar_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    background_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    sessions: Mapped[list["Session"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    remember: Mapped[bool] = mapped_column(Boolean, default=False)
    # Waiting for the second factor: such a session can only finish the login (5 minutes).
    mfa_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    user_agent: Mapped[str] = mapped_column(String(256), default="", server_default="")
    ip: Mapped[str] = mapped_column(String(64), default="", server_default="")
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    tagline: Mapped[str] = mapped_column(String(256), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    personality: Mapped[str] = mapped_column(Text, default="")
    greeting: Mapped[str] = mapped_column(Text, default="")
    scenario: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(256), default="")  # comma-separated
    picture_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # private | pending (waiting for admin review) | public (in Community)
    visibility: Mapped[str] = mapped_column(String(16), default="private")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(256), default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str] = mapped_column(String(128), default="")  # empty = server default
    summary: Mapped[str] = mapped_column(Text, default="")  # story memory
    summary_upto: Mapped[int] = mapped_column(Integer, default=0)  # id of the last message in the summary
    read_upto: Mapped[int] = mapped_column(Integer, default=0)  # id of the last message the owner has seen
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    character: Mapped["Character"] = relationship()
    messages: Mapped[list["Message"]] = relationship(
        back_populates="chat", cascade="all, delete-orphan", order_by="Message.id"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)
    important: Mapped[bool] = mapped_column(Boolean, default=False)
    # Who spoke (characters can be switched in a running chat). None = the chat's character.
    character_id: Mapped[int | None] = mapped_column(ForeignKey("characters.id", ondelete="SET NULL"), nullable=True)
    # Alternative replies from "regenerate" (JSON list of texts); content is the chosen one.
    variants: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    variant_index: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    chat: Mapped[Chat] = relationship(back_populates="messages")


class ApiUsage(Base):
    """Messages sent to the hosted API. One row per user and day."""

    __tablename__ = "api_usage"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_api_usage_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    count: Mapped[int] = mapped_column(Integer, default=0)


class ServerSetting(Base):
    """Server-wide options set in Server Management (key/value)."""

    __tablename__ = "server_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str] = mapped_column(Text, default="")


class CharacterLike(Base):
    """A user likes a Community character (one like per user and character)."""

    __tablename__ = "character_likes"
    __table_args__ = (UniqueConstraint("user_id", "character_id", name="uq_like_user_character"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
