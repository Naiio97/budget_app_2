"""add portfolio_snapshots table

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'portfolio_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('snapshot_date', sa.String(), nullable=False),
        sa.Column('total_value_czk', sa.Float(), nullable=False),
        sa.Column('invested_czk', sa.Float(), nullable=True),
        sa.Column('result_czk', sa.Float(), nullable=True),
        sa.Column('cash_free_czk', sa.Float(), nullable=True),
        sa.Column('total_value_eur', sa.Float(), nullable=True),
        sa.Column('exchange_rate', sa.Float(), nullable=True),
        sa.Column('positions_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('snapshot_date'),
    )


def downgrade() -> None:
    op.drop_table('portfolio_snapshots')
