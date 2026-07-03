"""tags + transaction_tags — volné štítky napříč kategoriemi (VYLEPSENI 4.7)

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0016'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tags',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'name', name='uq_tags_user_name'),
    )
    op.create_index('ix_tags_user_id', 'tags', ['user_id'])

    op.create_table(
        'transaction_tags',
        sa.Column('transaction_id', sa.String(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('transaction_id', 'tag_id'),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_transaction_tags_tag_id', 'transaction_tags', ['tag_id'])


def downgrade() -> None:
    op.drop_table('transaction_tags')
    op.drop_table('tags')
