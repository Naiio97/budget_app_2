"""add my_amount_override to monthly_expenses

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('monthly_expenses', sa.Column('my_amount_override', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('monthly_expenses', 'my_amount_override')
