"""ON DELETE CASCADE na potomky monthly_budgets

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-08

monthly_expenses.budget_id a monthly_income_items.budget_id měly FK bez
DB-level kaskády (mazání řešil jen ORM relationship cascade). Přímý DELETE
uživatele/rozpočtu (admin zásah, GDPR výmaz, úklid) tak padal na FK violation,
protože users → monthly_budgets kaskáduje, ale potomci rozpočtu ne.
"""
from typing import Sequence, Union
from alembic import op

revision: str = '0021'
down_revision: Union[str, None] = '0020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ('monthly_expenses', 'monthly_income_items')


def upgrade() -> None:
    for table in TABLES:
        op.drop_constraint(f'{table}_budget_id_fkey', table, type_='foreignkey')
        op.create_foreign_key(
            f'{table}_budget_id_fkey', table, 'monthly_budgets',
            ['budget_id'], ['id'], ondelete='CASCADE',
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(f'{table}_budget_id_fkey', table, type_='foreignkey')
        op.create_foreign_key(
            f'{table}_budget_id_fkey', table, 'monthly_budgets',
            ['budget_id'], ['id'],
        )
