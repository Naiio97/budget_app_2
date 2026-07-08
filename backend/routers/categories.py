"""Category management router"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from pydantic import BaseModel
from typing import List, Optional

from auth import get_current_user
from database import get_db
from models import CategoryModel, UserModel

router = APIRouter(prefix="", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str
    icon: str = "📦"
    color: str = "#6366f1"
    is_income: bool = False


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_income: Optional[bool] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    icon: str
    color: str
    order_index: int
    is_income: bool
    is_active: bool


# Ikony jsou klíče z frontend/lib/category-icons.tsx (čárové ikony), barvy
# drží jednotnou paletu — každá kategorie má vlastní odstín (viz migrace 0022).
DEFAULT_CATEGORIES = [
    {"name": "Food", "icon": "basket", "color": "#84cc16", "is_income": False},
    {"name": "Transport", "icon": "car", "color": "#f97316", "is_income": False},
    {"name": "Utilities", "icon": "bulb", "color": "#eab308", "is_income": False},
    {"name": "Entertainment", "icon": "film", "color": "#d946ef", "is_income": False},
    {"name": "Shopping", "icon": "bag", "color": "#14b8a6", "is_income": False},
    {"name": "Investment", "icon": "trending", "color": "#3b82f6", "is_income": False},
    {"name": "Dividend", "icon": "percent", "color": "#8b5cf6", "is_income": True},
    {"name": "Salary", "icon": "wallet", "color": "#10b981", "is_income": True},
    {"name": "Internal Transfer", "icon": "transfer", "color": "#6b7280", "is_income": False},
    {"name": "Other", "icon": "box", "color": "#9ca3af", "is_income": False},
]


async def _get_user_category(
    db: AsyncSession, user_id: int, category_id: int
) -> CategoryModel:
    result = await db.execute(
        select(CategoryModel).where(
            CategoryModel.id == category_id,
            CategoryModel.user_id == user_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Kategorie nenalezena")
    return category


@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all categories for the user, seeding defaults on first call"""
    result = await db.execute(
        select(CategoryModel)
        .where(CategoryModel.user_id == current_user.id)
        .order_by(CategoryModel.order_index, CategoryModel.name)
    )
    categories = result.scalars().all()

    if not categories:
        # ON CONFLICT DO NOTHING — two parallel GETs from the dashboard would
        # both race here on a fresh user; without the conflict guard the
        # second commit blows up on uq_categories_user_name.
        stmt = pg_insert(CategoryModel).values([
            {
                "user_id": current_user.id,
                "name": cat["name"],
                "icon": cat["icon"],
                "color": cat["color"],
                "is_income": cat["is_income"],
                "order_index": idx,
            }
            for idx, cat in enumerate(DEFAULT_CATEGORIES)
        ])
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "name"])
        await db.execute(stmt)
        await db.commit()

        result = await db.execute(
            select(CategoryModel)
            .where(CategoryModel.user_id == current_user.id)
            .order_by(CategoryModel.order_index, CategoryModel.name)
        )
        categories = result.scalars().all()

    return categories


@router.post("/", response_model=CategoryResponse)
async def create_category(
    data: CategoryCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new category"""
    existing = await db.execute(
        select(CategoryModel).where(
            CategoryModel.user_id == current_user.id,
            CategoryModel.name == data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Kategorie s tímto názvem již existuje")

    result = await db.execute(
        select(CategoryModel).where(CategoryModel.user_id == current_user.id)
    )
    all_cats = result.scalars().all()
    max_order = max((c.order_index for c in all_cats), default=-1) + 1

    category = CategoryModel(
        user_id=current_user.id,
        name=data.name,
        icon=data.icon,
        color=data.color,
        is_income=data.is_income,
        order_index=max_order
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a category"""
    category = await _get_user_category(db, current_user.id, category_id)

    if data.name is not None:
        if data.name != category.name:
            existing = await db.execute(
                select(CategoryModel).where(
                    CategoryModel.user_id == current_user.id,
                    CategoryModel.name == data.name,
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Kategorie s tímto názvem již existuje")
        category.name = data.name

    if data.icon is not None:
        category.icon = data.icon
    if data.color is not None:
        category.color = data.color
    if data.is_income is not None:
        category.is_income = data.is_income
    if data.order_index is not None:
        category.order_index = data.order_index
    if data.is_active is not None:
        category.is_active = data.is_active

    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a category (or deactivate if in use)"""
    category = await _get_user_category(db, current_user.id, category_id)
    category.is_active = False
    await db.commit()

    return {"status": "deleted", "id": category_id}


@router.post("/reorder")
async def reorder_categories(
    order: List[int],
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reorder categories by providing list of category IDs in desired order"""
    for idx, cat_id in enumerate(order):
        result = await db.execute(
            select(CategoryModel).where(
                CategoryModel.id == cat_id,
                CategoryModel.user_id == current_user.id,
            )
        )
        category = result.scalar_one_or_none()
        if category:
            category.order_index = idx

    await db.commit()
    return {"status": "reordered"}
