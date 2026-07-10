"""sync_status.details_json — per-účtové výsledky běhu synchronizace

Revision ID: 0024
Revises: 0023
Create Date: 2026-07-10

Sync ukládal jen souhrnná čísla a slepený error_message posledního běhu.
details_json drží per-účtový rozpad (status, počet transakcí, chyba,
trvání), který servíruje GET /sync/history — hlavní okno do produkce,
kde jinak nejsou vidět selhání jednotlivých bankovních účtů.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0024'
down_revision: Union[str, None] = '0023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sync_status', sa.Column('details_json', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sync_status', 'details_json')
