"""salary estimates: skutečnost z výplatnice (kalibrace + přesnost)

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0025'
down_revision: Union[str, None] = '0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('salary_estimates', sa.Column('actual_net_to_account', sa.Float(), nullable=True))
    op.add_column('salary_estimates', sa.Column('actual_json', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('salary_estimates', 'actual_json')
    op.drop_column('salary_estimates', 'actual_net_to_account')
