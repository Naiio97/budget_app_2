"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'accounts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False, server_default='Account'),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('balance', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('currency', sa.String(), nullable=True, server_default='CZK'),
        sa.Column('institution', sa.String(), nullable=True),
        sa.Column('details_json', sa.Text(), nullable=True),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
        sa.Column('is_visible', sa.Boolean(), nullable=True, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'transactions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('account_id', sa.String(), nullable=False),
        sa.Column('date', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(), nullable=True, server_default='CZK'),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('account_type', sa.String(), nullable=False),
        sa.Column('transaction_type', sa.String(), nullable=True, server_default='normal'),
        sa.Column('is_excluded', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('raw_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'sync_status',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default='running'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('accounts_synced', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('transactions_synced', sa.Integer(), nullable=True, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'settings',
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('key'),
    )

    op.create_table(
        'budgets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(), nullable=True, server_default='CZK'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'savings_goals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('target_amount', sa.Float(), nullable=False),
        sa.Column('current_amount', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('currency', sa.String(), nullable=True, server_default='CZK'),
        sa.Column('deadline', sa.String(), nullable=True),
        sa.Column('is_completed', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'category_rules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('pattern', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('is_user_defined', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('match_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('icon', sa.String(), nullable=True, server_default='📦'),
        sa.Column('color', sa.String(), nullable=True, server_default='#6366f1'),
        sa.Column('order_index', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('is_income', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('name'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'monthly_budgets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('year_month', sa.String(), nullable=False),
        sa.Column('salary', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('other_income', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('meal_vouchers', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('investment_amount', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('surplus_to_savings', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('is_closed', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('year_month'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'recurring_expenses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('default_amount', sa.Float(), nullable=False),
        sa.Column('my_percentage', sa.Integer(), nullable=True, server_default='100'),
        sa.Column('is_auto_paid', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('match_pattern', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'monthly_expenses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('budget_id', sa.Integer(), nullable=False),
        sa.Column('recurring_expense_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('my_percentage', sa.Integer(), nullable=True, server_default='100'),
        sa.Column('is_paid', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('is_auto_paid', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('matched_transaction_id', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['budget_id'], ['monthly_budgets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recurring_expense_id'], ['recurring_expenses.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'manual_accounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('account_number', sa.String(), nullable=True),
        sa.Column('balance', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('currency', sa.String(), nullable=True, server_default='CZK'),
        sa.Column('is_visible', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'manual_account_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('is_mine', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['manual_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('manual_account_items')
    op.drop_table('manual_accounts')
    op.drop_table('monthly_expenses')
    op.drop_table('recurring_expenses')
    op.drop_table('monthly_budgets')
    op.drop_table('categories')
    op.drop_table('category_rules')
    op.drop_table('savings_goals')
    op.drop_table('budgets')
    op.drop_table('settings')
    op.drop_table('sync_status')
    op.drop_table('transactions')
    op.drop_table('accounts')
