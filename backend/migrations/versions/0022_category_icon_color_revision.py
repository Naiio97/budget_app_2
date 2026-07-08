"""Revize ikon a barev kategorií — každá kategorie vlastní ikonu i odstín

Revision ID: 0022
Revises: 0021
Create Date: 2026-07-08

Stav před revizí: Supermarkets měly ikonu burgeru, Dividend a ATM sdílely
bankovku, Installments a Other krabici; Food mělo barvu Restaurantu, Other
barvu Internal Transferu, Subscription skoro černou (#030303 — v tmavém
režimu neviditelná) a Insurance/Utilities i Installments/Settlement se
lišily jen odstínem. Mapování je podle názvu kategorie, pro všechny
uživatele; ikony jsou klíče z frontend/lib/category-icons.tsx.

Navíc doplní kategorii "Family Transfer" (protějšek Internal Transferu —
detekce převodů ji nastavuje transakcím, ale řádek v categories chyběl,
takže se rodinné převody kreslily bez ikony a barvy).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0022'
down_revision: Union[str, None] = '0021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORY_STYLE: dict[str, tuple[str, str]] = {
    "Restaurant": ("utensils", "#ef4444"),
    "Food": ("basket", "#84cc16"),
    "Supermarkets": ("cart", "#ec4899"),
    "Shopping": ("bag", "#14b8a6"),
    "Transport": ("car", "#f97316"),
    "Utilities": ("bulb", "#eab308"),
    "Housing": ("home", "#b45309"),
    "Entertainment": ("film", "#d946ef"),
    "Investment": ("trending", "#3b82f6"),
    "Dividend": ("percent", "#8b5cf6"),
    "Salary": ("wallet", "#10b981"),
    "Settlement": ("split", "#6366f1"),
    "Subscription": ("phone", "#0ea5e9"),
    "Installments": ("calendar", "#0e7490"),
    "Insurance": ("shield", "#9f1239"),
    "ATM": ("banknote", "#f28f64"),
    "Internal Transfer": ("transfer", "#6b7280"),
    "Family Transfer": ("family", "#475569"),
    "Other": ("box", "#9ca3af"),
}


def upgrade() -> None:
    conn = op.get_bind()
    stmt = sa.text("UPDATE categories SET icon = :icon, color = :color WHERE name = :name")
    for name, (icon, color) in CATEGORY_STYLE.items():
        conn.execute(stmt, {"name": name, "icon": icon, "color": color})

    conn.execute(sa.text(
        "INSERT INTO categories (name, icon, color, order_index, is_income, is_active, created_at, user_id) "
        "SELECT 'Family Transfer', 'family', '#475569', "
        "       COALESCE((SELECT max(c.order_index) + 1 FROM categories c WHERE c.user_id = u.id), 0), "
        "       false, true, now(), u.id "
        "FROM users u "
        "WHERE EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id) "
        "  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Family Transfer')"
    ))


def downgrade() -> None:
    # Kosmetická datová migrace — původní kombinace ikon/barev se nevrací.
    pass
