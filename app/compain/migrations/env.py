"""Alembic environment. Migrations run on start (db.init_db) with the app's own connection."""

from alembic import context

from compain import models  # noqa: F401  (registers the tables)
from compain.db import Base

connection = context.config.attributes.get("connection")
if connection is None:
    raise RuntimeError("Run migrations through compain.db.init_db (it passes the connection).")

context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True, compare_type=True)
with context.begin_transaction():
    context.run_migrations()
