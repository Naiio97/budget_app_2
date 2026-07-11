"""salary estimates (odhad výplaty z timesheetu)

Revision ID: 0025
Revises: 0024
Create Date: 2026-07-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0025'
down_revision: Union[str, None] = '0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'salary_estimates',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('year_month', sa.String(), nullable=False),
        sa.Column('source_filename', sa.String(), nullable=True),
        sa.Column('fond_days', sa.Integer(), nullable=False),
        sa.Column('salary_used', sa.Float(), nullable=False),
        sa.Column('prumer_used', sa.Float(), nullable=False),
        sa.Column('bonus', sa.Float(), nullable=False, server_default='0'),
        sa.Column('gross_pay', sa.Float(), nullable=False),
        sa.Column('net_pay', sa.Float(), nullable=False),
        sa.Column('net_to_account', sa.Float(), nullable=False),
        sa.Column('breakdown_json', sa.Text(), nullable=False),
        sa.Column('is_accepted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_salary_estimates_user_id', 'salary_estimates', ['user_id'])
    op.create_unique_constraint(
        'uq_salary_estimates_user_year_month', 'salary_estimates', ['user_id', 'year_month']
    )


def downgrade() -> None:
    op.drop_constraint('uq_salary_estimates_user_year_month', 'salary_estimates', type_='unique')
    op.drop_index('ix_salary_estimates_user_id', table_name='salary_estimates')
    op.drop_table('salary_estimates')
