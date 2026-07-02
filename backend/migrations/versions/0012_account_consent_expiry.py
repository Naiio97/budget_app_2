"""accounts — consent_expires_at (GoCardless EUA expiry for reconnect warnings)

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column('consent_expires_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('accounts', 'consent_expires_at')
