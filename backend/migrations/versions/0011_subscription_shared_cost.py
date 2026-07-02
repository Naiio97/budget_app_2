"""subscriptions — shared cost (my_percentage / my_amount_override)

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscriptions', sa.Column('my_percentage', sa.Integer(), nullable=True, server_default='100'))
    op.add_column('subscriptions', sa.Column('my_amount_override', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('subscriptions', 'my_amount_override')
    op.drop_column('subscriptions', 'my_percentage')
