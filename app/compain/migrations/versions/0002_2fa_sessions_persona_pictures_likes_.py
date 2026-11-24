"""2fa, sessions, persona, pictures, likes, message variants

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-24 02:15:42.107319
"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('character_likes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('character_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'character_id', name='uq_like_user_character')
    )
    with op.batch_alter_table('character_likes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_character_likes_character_id'), ['character_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_character_likes_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('character_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('variants', sa.Text(), server_default='[]', nullable=False))
        batch_op.add_column(sa.Column('variant_index', sa.Integer(), server_default=sa.text('0'), nullable=False))
        batch_op.create_foreign_key('fk_messages_character_id', 'characters', ['character_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('mfa_pending', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('user_agent', sa.String(length=256), server_default='', nullable=False))
        batch_op.add_column(sa.Column('ip', sa.String(length=64), server_default='', nullable=False))
        batch_op.add_column(sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('totp_secret', sa.String(length=256), nullable=True))
        batch_op.add_column(sa.Column('totp_enabled', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('recovery_codes', sa.Text(), server_default='[]', nullable=False))
        batch_op.add_column(sa.Column('persona_name', sa.String(length=128), server_default='', nullable=False))
        batch_op.add_column(sa.Column('persona_description', sa.Text(), server_default='', nullable=False))
        batch_op.add_column(sa.Column('avatar_path', sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column('background_path', sa.String(length=512), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('background_path')
        batch_op.drop_column('avatar_path')
        batch_op.drop_column('persona_description')
        batch_op.drop_column('persona_name')
        batch_op.drop_column('recovery_codes')
        batch_op.drop_column('totp_enabled')
        batch_op.drop_column('totp_secret')

    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.drop_column('last_seen')
        batch_op.drop_column('ip')
        batch_op.drop_column('user_agent')
        batch_op.drop_column('mfa_pending')

    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_constraint('fk_messages_character_id', type_='foreignkey')
        batch_op.drop_column('variant_index')
        batch_op.drop_column('variants')
        batch_op.drop_column('character_id')

    with op.batch_alter_table('character_likes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_character_likes_user_id'))
        batch_op.drop_index(batch_op.f('ix_character_likes_character_id'))

    op.drop_table('character_likes')
