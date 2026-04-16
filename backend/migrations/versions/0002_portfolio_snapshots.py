"""portfolio snapshots (stub – migration already applied)

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-09

"""
from typing import Sequence, Union

revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
