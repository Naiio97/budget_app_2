"""recurring_expenses.due_day — skutečný den splatnosti pravidelné platby

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-07

Rozpočet dosud zobrazoval u plateb vymyšlená data splatnosti (natvrdo zadané
pole indexované pořadím v seznamu). `due_day` (1-31, NULL = neznámý) je den
v měsíci, kdy je platba splatná — UI podle něj řadí nadcházející platby a
zobrazuje reálné datum. Splátky úvěrů ho odvozují z loan_payments.due_date.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0020'
down_revision: Union[str, None] = '0019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recurring_expenses', sa.Column('due_day', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('recurring_expenses', 'due_day')
