"""monthly income items — dynamic income rows

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-18

Replaces the fixed `salary` / `other_income` / `meal_vouchers` columns on
`monthly_budgets` with a dynamic `monthly_income_items` child table so users
can rename, add, and delete income rows per month.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'monthly_income_items',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('budget_id', sa.Integer(), sa.ForeignKey('monthly_budgets.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_salary', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_monthly_income_items_budget_id', 'monthly_income_items', ['budget_id'])

    # Backfill: migrate existing salary/other_income/meal_vouchers columns into rows.
    # Výplata is always created (is_salary=True) so sync-income has a target row.
    # Optional rows are created only when nonzero — respects user's "I don't use Stravenky" case.
    op.execute("""
        INSERT INTO monthly_income_items (budget_id, name, amount, order_index, is_salary, created_at)
        SELECT id, 'Výplata', COALESCE(salary, 0), 0, true, NOW()
        FROM monthly_budgets
    """)
    op.execute("""
        INSERT INTO monthly_income_items (budget_id, name, amount, order_index, is_salary, created_at)
        SELECT id, 'Další příjem', other_income, 1, false, NOW()
        FROM monthly_budgets
        WHERE other_income IS NOT NULL AND other_income <> 0
    """)
    op.execute("""
        INSERT INTO monthly_income_items (budget_id, name, amount, order_index, is_salary, created_at)
        SELECT id, 'Stravenky', meal_vouchers, 2, false, NOW()
        FROM monthly_budgets
        WHERE meal_vouchers IS NOT NULL AND meal_vouchers <> 0
    """)

    op.drop_column('monthly_budgets', 'salary')
    op.drop_column('monthly_budgets', 'other_income')
    op.drop_column('monthly_budgets', 'meal_vouchers')


def downgrade() -> None:
    op.add_column('monthly_budgets', sa.Column('salary', sa.Float(), nullable=True, server_default='0'))
    op.add_column('monthly_budgets', sa.Column('other_income', sa.Float(), nullable=True, server_default='0'))
    op.add_column('monthly_budgets', sa.Column('meal_vouchers', sa.Float(), nullable=True, server_default='0'))

    # Best-effort restore: salary row → salary column, anything else merges into other_income.
    op.execute("""
        UPDATE monthly_budgets b
        SET salary = COALESCE((
            SELECT SUM(amount) FROM monthly_income_items
            WHERE budget_id = b.id AND is_salary = true
        ), 0)
    """)
    op.execute("""
        UPDATE monthly_budgets b
        SET other_income = COALESCE((
            SELECT SUM(amount) FROM monthly_income_items
            WHERE budget_id = b.id AND is_salary = false
        ), 0)
    """)

    op.drop_index('ix_monthly_income_items_budget_id', table_name='monthly_income_items')
    op.drop_table('monthly_income_items')
