"""transactions.category_locked — ochrana ruční kategorizace a transferů

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-08

Když uživatel ručně přeřadí kategorii, nebo detekce transferů rozpozná
Internal/Family Transfer podle IBAN, nastaví se category_locked=True.
`/sync/recategorize` a retroaktivní aplikace nového pravidla takové
transakce přeskakují — dřív klidně přepsaly i ruční jednorázové opravy a
rozbily transakcím typu transfer kategorii, aniž by se to samo opravilo.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0021'
down_revision: Union[str, None] = '0020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'transactions',
        sa.Column('category_locked', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Backfill: transakce už označené jako transfer (IBAN detekcí nebo ručně)
    # dostanou zámek rovnou — detekce označené řádky přeskakuje, takže by se
    # k nim zpětně nedostal a /recategorize by je po smazání pravidla rozbil.
    op.execute(
        "UPDATE transactions SET category_locked = true "
        "WHERE transaction_type IN ('internal_transfer', 'my_account_transfer', 'family_transfer')"
    )


def downgrade() -> None:
    op.drop_column('transactions', 'category_locked')
