"""users table + user_id FK on all owned tables (wide door for multi-tenancy)

Adds the users table, inserts a bootstrap user (id=1), and adds a user_id FK
column to every owned table. The column has server_default=1 so existing
INSERTs (which don't specify user_id) keep working; that default will be
dropped in the follow-up PR that wires auth into routers.

PK swaps (contacts.iban → (user_id, iban), settings.key → (user_id, key)) and
per-user unique constraint swaps (categories.name, monthly_budgets.year_month,
portfolio_snapshots.snapshot_date) are intentionally deferred to the
auth-enforcement PR so this migration is purely additive and existing
db.get(Model, single_pk) calls keep working.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-25
"""
import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0007'
down_revision: Union[str, None] = '0006'
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
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False, server_default="email"),
        sa.Column("provider_id", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_provider_id", "users", ["provider_id"])
    op.create_unique_constraint(
        "uq_users_provider_provider_id", "users", ["provider", "provider_id"]
    )

    # Bootstrap user (id=1) so existing rows backfill via DEFAULT 1.
    bootstrap_email = os.environ.get("BOOTSTRAP_USER_EMAIL", "bootstrap@local")
    bootstrap_name = os.environ.get("BOOTSTRAP_USER_NAME", "Bootstrap")
    op.execute(
        sa.text(
            "INSERT INTO users (id, email, name, provider, is_active) "
            "VALUES (1, :email, :name, 'email', true)"
        ).bindparams(email=bootstrap_email, name=bootstrap_name)
    )
    # Advance the SERIAL sequence so future autoincrement inserts skip id=1.
    op.execute("SELECT setval(pg_get_serial_sequence('users', 'id'), 1, true)")

    for table in OWNED_TABLES:
        op.add_column(
            table,
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE", name=f"fk_{table}_user_id"),
                nullable=False,
                server_default="1",
            ),
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade() -> None:
    for table in OWNED_TABLES:
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_constraint(f"fk_{table}_user_id", table, type_="foreignkey")
        op.drop_column(table, "user_id")

    op.drop_constraint("uq_users_provider_provider_id", "users", type_="unique")
    op.drop_index("ix_users_provider_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
