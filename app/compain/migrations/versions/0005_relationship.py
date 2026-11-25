"""relationship state per chat

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-25 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('chats') as batch:
        batch.add_column(sa.Column('relation_enabled', sa.Boolean(), server_default=sa.true(), nullable=False))
        batch.add_column(sa.Column('relation_trust', sa.Integer(), server_default=sa.text('50'), nullable=False))
        batch.add_column(sa.Column('relation_affection', sa.Integer(), server_default=sa.text('50'), nullable=False))
        batch.add_column(sa.Column('relation_mood', sa.String(length=64), server_default='', nullable=False))
        batch.add_column(sa.Column('relation_note', sa.String(length=400), server_default='', nullable=False))
        batch.add_column(sa.Column('relation_upto', sa.Integer(), server_default=sa.text('0'), nullable=False))
        batch.add_column(sa.Column('relation_set', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('chats') as batch:
        for name in ('relation_set', 'relation_upto', 'relation_note', 'relation_mood',
                     'relation_affection', 'relation_trust', 'relation_enabled'):
            batch.drop_column(name)
