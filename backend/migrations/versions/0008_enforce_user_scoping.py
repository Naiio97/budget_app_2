"""Enforce per-user scoping at the schema level

Locks in the multi-tenancy work started in 0007 now that every router filters
by current_user.id. Existing rows all have user_id=1 (backfilled by 0007), so
the composite-PK and per-user unique swaps below are no-ops for single-user
data but become correct once additional users register.

Changes:
1. Drop server_default=1 on every user_id column — future inserts must
   specify user_id explicitly.
2. contacts: PK (iban) → (user_id, iban).
3. settings: PK (key) → (user_id, key).
4. categories: unique (name) → unique (user_id, name).
5. monthly_budgets: unique (year_month) → unique (user_id, year_month).
6. portfolio_snapshots: unique (snapshot_date) → unique (user_id, snapshot_date).

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OWNED_TABLES: list[str] = [
    "accounts",
    "transactions",
    "sync_status",
    "settings",
    "budgets",
    "savings_goals",
    "category_rules",
    "categories",
    "monthly_budgets",
    "recurring_expenses",
    "manual_accounts",
    "contacts",
    "portfolio_snapshots",
    "manual_investment_accounts",
]


def upgrade() -> None:
    for table in OWNED_TABLES:
        op.alter_column(table, "user_id", server_default=None)

    # contacts: iban → (user_id, iban)
    op.drop_constraint("contacts_pkey", "contacts", type_="primary")
    op.create_primary_key("contacts_pkey", "contacts", ["user_id", "iban"])

    # settings: key → (user_id, key)
    op.drop_constraint("settings_pkey", "settings", type_="primary")
    op.create_primary_key("settings_pkey", "settings", ["user_id", "key"])

    # categories.name unique → (user_id, name)
    op.drop_constraint("categories_name_key", "categories", type_="unique")
    op.create_unique_constraint("uq_categories_user_name", "categories", ["user_id", "name"])

    # monthly_budgets.year_month unique → (user_id, year_month)
    op.drop_constraint("monthly_budgets_year_month_key", "monthly_budgets", type_="unique")
    op.create_unique_constraint(
        "uq_monthly_budgets_user_year_month", "monthly_budgets", ["user_id", "year_month"]
    )

    # portfolio_snapshots.snapshot_date unique → (user_id, snapshot_date)
    op.drop_constraint(
        "portfolio_snapshots_snapshot_date_key", "portfolio_snapshots", type_="unique"
    )
    op.create_unique_constraint(
        "uq_portfolio_snapshots_user_date", "portfolio_snapshots", ["user_id", "snapshot_date"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_portfolio_snapshots_user_date", "portfolio_snapshots", type_="unique"
    )
    op.create_unique_constraint(
        "portfolio_snapshots_snapshot_date_key", "portfolio_snapshots", ["snapshot_date"]
    )

    op.drop_constraint("uq_monthly_budgets_user_year_month", "monthly_budgets", type_="unique")
    op.create_unique_constraint(
        "monthly_budgets_year_month_key", "monthly_budgets", ["year_month"]
    )

    op.drop_constraint("uq_categories_user_name", "categories", type_="unique")
    op.create_unique_constraint("categories_name_key", "categories", ["name"])

    op.drop_constraint("settings_pkey", "settings", type_="primary")
    op.create_primary_key("settings_pkey", "settings", ["key"])

    op.drop_constraint("contacts_pkey", "contacts", type_="primary")
    op.create_primary_key("contacts_pkey", "contacts", ["iban"])

    for table in OWNED_TABLES:
        op.alter_column(table, "user_id", server_default="1")
