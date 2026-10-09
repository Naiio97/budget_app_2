"""loan_payments.match_locked — ručně odznačená splátka se znovu nespáruje

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0028'
down_revision: Union[str, None] = '0027'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'loan_payments',
        sa.Column('match_locked', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('loan_payments', 'match_locked')
