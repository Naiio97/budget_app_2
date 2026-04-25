"""manual investment accounts — manual tracking without API

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'manual_investment_accounts',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False, server_default='CZK'),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'manual_investment_positions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('manual_investment_accounts.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=True),
        sa.Column('avg_buy_price', sa.Float(), nullable=True),
        sa.Column('current_value', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False, server_default='CZK'),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_manual_investment_positions_account_id', 'manual_investment_positions', ['account_id'])

    op.create_table(
        'manual_investment_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('manual_investment_accounts.id'), nullable=False),
        sa.Column('snapshot_date', sa.String(), nullable=False),
        sa.Column('total_value', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_manual_investment_snapshots_account_id', 'manual_investment_snapshots', ['account_id'])


def downgrade() -> None:
    op.drop_index('ix_manual_investment_snapshots_account_id', table_name='manual_investment_snapshots')
    op.drop_table('manual_investment_snapshots')
    op.drop_index('ix_manual_investment_positions_account_id', table_name='manual_investment_positions')
    op.drop_table('manual_investment_positions')
    op.drop_table('manual_investment_accounts')
