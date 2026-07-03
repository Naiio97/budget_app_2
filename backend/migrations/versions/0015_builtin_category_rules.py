"""category_rules — is_builtin + seed výchozích pravidel z kódu do DB (VYLEPSENI 4.8)

Klíčová slova kategorizace žila natvrdo v routers/sync.py; teď jsou to řádky
v category_rules (is_builtin=True), aby šla spravovat z UI. Seed přeskočí
patterny, které už uživatel má.

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

from services.default_rules import default_category_rules

revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('category_rules', sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default=sa.false()))

    conn = op.get_bind()
    users = conn.execute(sa.text("SELECT id FROM users")).fetchall()
    for (user_id,) in users:
        existing = {
            p for (p,) in conn.execute(
                sa.text("SELECT pattern FROM category_rules WHERE user_id = :uid"),
                {"uid": user_id},
            ).fetchall()
        }
        for pattern, category in default_category_rules():
            if pattern in existing:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO category_rules (user_id, pattern, category, is_user_defined, is_builtin, match_count, created_at) "
                    "VALUES (:uid, :pattern, :category, false, true, 0, now())"
                ),
                {"uid": user_id, "pattern": pattern, "category": category},
            )


def downgrade() -> None:
    op.execute("DELETE FROM category_rules WHERE is_builtin = true")
    op.drop_column('category_rules', 'is_builtin')
