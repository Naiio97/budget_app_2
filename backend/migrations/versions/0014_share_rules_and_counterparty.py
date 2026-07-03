"""share_rules table + transactions.share_counterparty + subscriptions.contribution_pattern

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('share_counterparty', sa.String(), nullable=True))
    op.add_column('subscriptions', sa.Column('contribution_pattern', sa.String(), nullable=True))
    op.create_table(
        'share_rules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('pattern', sa.String(), nullable=False),
        sa.Column('my_percentage', sa.Float(), nullable=True),
        sa.Column('my_amount_override', sa.Float(), nullable=True),
        sa.Column('counterparty', sa.String(), nullable=True),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('match_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_share_rules_user_id', 'share_rules', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_share_rules_user_id', table_name='share_rules')
    op.drop_table('share_rules')
    op.drop_column('subscriptions', 'contribution_pattern')
    op.drop_column('transactions', 'share_counterparty')
