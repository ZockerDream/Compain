"""Database engine and session handling."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    if url.startswith("sqlite"):
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def _foreign_keys(dbapi_conn, _record):  # SQLite ignores ON DELETE CASCADE without this
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


# Columns added between 0.1 and 0.3, before Alembic. Databases from that time get them first and are
# then marked as revision 0001 (the 0.3.0 schema); everything newer comes from migrations/versions.
LEGACY_COLUMNS = [
    ("chats", "summary_upto", "INTEGER NOT NULL DEFAULT 0"),
    ("chats", "read_upto", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "preferences", "TEXT NOT NULL DEFAULT '{}'"),
    ("users", "age_confirmed_at", "TIMESTAMP WITH TIME ZONE NULL"),
]


def init_db(engine: Engine) -> None:
    """Bring the database to the newest schema with Alembic (runs on every start)."""
    from pathlib import Path

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text

    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        tables = set(inspect(conn).get_table_names())
        if "alembic_version" not in tables and "users" in tables:
            # A database from 0.1–0.3 (created without Alembic): complete it to 0.3.0 and mark it.
            for table, column, ddl in LEGACY_COLUMNS:
                if column not in {c["name"] for c in inspect(conn).get_columns(table)}:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            command.stamp(cfg, "0001")
        command.upgrade(cfg, "head")
