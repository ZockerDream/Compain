"""Database engine and session handling."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


# Columns added after the first release. create_all() does not add columns to existing tables,
# so these are added here. Move to Alembic before the first real data on the server.
ADDED_COLUMNS = [
    ("chats", "summary_upto", "INTEGER NOT NULL DEFAULT 0"),
    ("chats", "read_upto", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "preferences", "TEXT NOT NULL DEFAULT '{}'"),
    ("users", "age_confirmed_at", "TIMESTAMP WITH TIME ZONE NULL"),
]


def init_db(engine: Engine) -> None:
    from sqlalchemy import inspect, text

    from . import models  # noqa: F401  (registers the tables)

    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in ADDED_COLUMNS:
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
