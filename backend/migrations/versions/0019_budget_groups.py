"""budgets.name + budgets.categories — rozpočet přes skupinu kategorií

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-04

Rozpočet může pokrývat víc kategorií pod vlastním názvem (např. „Běžný život"
= restaurace + kafe + oblečení). `name` je zobrazovaný název, `categories` je
JSON seznam kategorií. Starší rozpočty (name/categories NULL) fungují dál přes
`category` jako jednokategoriové.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0019'
down_revision: Union[str, None] = '0018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('budgets', sa.Column('name', sa.String(), nullable=True))
    op.add_column('budgets', sa.Column('categories', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('budgets', 'categories')
    op.drop_column('budgets', 'name')
