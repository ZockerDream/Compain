"""email address of an account

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-25 18:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('email', sa.String(length=254), nullable=True))
        batch.create_index('ix_users_email', ['email'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.drop_index('ix_users_email')
        batch.drop_column('email')
