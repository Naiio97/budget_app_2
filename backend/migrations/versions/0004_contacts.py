"""add contacts table (IBAN address book)

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'contacts',
        sa.Column('iban', sa.String(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('source', sa.String(), nullable=False, server_default='manual'),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('contacts')
