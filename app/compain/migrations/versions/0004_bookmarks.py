"""message bookmarks

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-24 15:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('messages') as batch:
        batch.add_column(sa.Column('bookmarked', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('messages') as batch:
        batch.drop_column('bookmarked')
