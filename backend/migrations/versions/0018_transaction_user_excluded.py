"""transactions.user_excluded — ruční vyřazení platby z příjmů/výdajů

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-04

Ruční přepínač: uživatel může jakoukoli platbu vyřadit z výpočtu příjmů a
výdajů (např. splátkové konstrukce Air/Twisto: plná platba + okamžitá vratka).
Drží se odděleně od is_excluded, které přepočítává sync/detekce transferů —
manuální volba tak přežije synchronizaci.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0018'
down_revision: Union[str, None] = '0017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'transactions',
        sa.Column('user_excluded', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('transactions', 'user_excluded')
