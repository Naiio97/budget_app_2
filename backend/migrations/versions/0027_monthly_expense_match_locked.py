"""monthly_expenses.match_locked — ruční odznačení platby přežije auto-párování

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-09

Když uživatel u výdaje ručně zruší „zaplaceno", nastaví se match_locked=True
a `/match-transactions` ho přestane automaticky párovat. Dřív se výdaj při
dalším otevření rozpočtu hned zase označil.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0027'
down_revision: Union[str, None] = '0026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'monthly_expenses',
        sa.Column('match_locked', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('monthly_expenses', 'match_locked')
