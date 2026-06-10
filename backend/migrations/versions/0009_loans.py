"""loans + loan payments (amortization schedule)

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'loans',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('principal', sa.Float(), nullable=False),
        sa.Column('interest_rate', sa.Float(), nullable=False, server_default='0'),
        sa.Column('term_months', sa.Integer(), nullable=False),
        sa.Column('monthly_payment', sa.Float(), nullable=False),
        sa.Column('start_date', sa.String(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False, server_default='CZK'),
        sa.Column('match_pattern', sa.String(), nullable=True),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_loans_user_id', 'loans', ['user_id'])

    op.create_table(
        'loan_payments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('loan_id', sa.Integer(), sa.ForeignKey('loans.id', ondelete='CASCADE'), nullable=False),
        sa.Column('installment_number', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('principal_part', sa.Float(), nullable=False),
        sa.Column('interest_part', sa.Float(), nullable=False),
        sa.Column('remaining_balance', sa.Float(), nullable=False),
        sa.Column('is_paid', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('matched_transaction_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_loan_payments_loan_id', 'loan_payments', ['loan_id'])


def downgrade() -> None:
    op.drop_index('ix_loan_payments_loan_id', table_name='loan_payments')
    op.drop_table('loan_payments')
    op.drop_index('ix_loans_user_id', table_name='loans')
    op.drop_table('loans')
