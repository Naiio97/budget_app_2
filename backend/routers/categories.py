"""Category management router"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from database import get_db
from models import CategoryModel

router = APIRouter(prefix="/api", tags=["categories"])


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


# Default categories to seed
DEFAULT_CATEGORIES = [
    {"name": "Food", "icon": "🍔", "color": "#ef4444", "is_income": False},
    {"name": "Transport", "icon": "🚗", "color": "#f97316", "is_income": False},
    {"name": "Utilities", "icon": "💡", "color": "#eab308", "is_income": False},
    {"name": "Entertainment", "icon": "🎬", "color": "#22c55e", "is_income": False},
    {"name": "Shopping", "icon": "🛒", "color": "#14b8a6", "is_income": False},
    {"name": "Investment", "icon": "📈", "color": "#3b82f6", "is_income": False},
    {"name": "Dividend", "icon": "💵", "color": "#8b5cf6", "is_income": True},
    {"name": "Salary", "icon": "💰", "color": "#10b981", "is_income": True},
    {"name": "Internal Transfer", "icon": "🔄", "color": "#6b7280", "is_income": False},
    {"name": "Other", "icon": "📦", "color": "#6b7280", "is_income": False},
]


@router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(db: AsyncSession = Depends(get_db)):
    """Get all categories, seeding defaults if none exist"""
    result = await db.execute(
        select(CategoryModel).order_by(CategoryModel.order_index, CategoryModel.name)
    )
    categories = result.scalars().all()
    
    # Seed default categories if none exist
    if not categories:
        for idx, cat in enumerate(DEFAULT_CATEGORIES):
            new_cat = CategoryModel(
                name=cat["name"],
                icon=cat["icon"],
                color=cat["color"],
                is_income=cat["is_income"],
                order_index=idx
            )
            db.add(new_cat)
        await db.commit()
        
        # Fetch again
        result = await db.execute(
            select(CategoryModel).order_by(CategoryModel.order_index, CategoryModel.name)
        )
        categories = result.scalars().all()
    
    return categories


@router.post("/categories", response_model=CategoryResponse)
async def create_category(data: CategoryCreate, db: AsyncSession = Depends(get_db)):
    """Create a new category"""
    # Check if name already exists
    existing = await db.execute(
        select(CategoryModel).where(CategoryModel.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Kategorie s tímto názvem již existuje")
    
    # Get max order_index
    result = await db.execute(select(CategoryModel))
    all_cats = result.scalars().all()
    max_order = max((c.order_index for c in all_cats), default=-1) + 1
    
    category = CategoryModel(
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


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: int, data: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    """Update a category"""
    result = await db.execute(
        select(CategoryModel).where(CategoryModel.id == category_id)
    )
    category = result.scalar_one_or_none()
    
    if not category:
        raise HTTPException(status_code=404, detail="Kategorie nenalezena")
    
    if data.name is not None:
        # Check if new name conflicts with existing
        if data.name != category.name:
            existing = await db.execute(
                select(CategoryModel).where(CategoryModel.name == data.name)
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


@router.delete("/categories/{category_id}")
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a category (or deactivate if in use)"""
    result = await db.execute(
        select(CategoryModel).where(CategoryModel.id == category_id)
    )
    category = result.scalar_one_or_none()
    
    if not category:
        raise HTTPException(status_code=404, detail="Kategorie nenalezena")
    
    # Instead of hard delete, just deactivate
    category.is_active = False
    await db.commit()
    
    return {"status": "deleted", "id": category_id}


@router.post("/categories/reorder")
async def reorder_categories(order: List[int], db: AsyncSession = Depends(get_db)):
    """Reorder categories by providing list of category IDs in desired order"""
    for idx, cat_id in enumerate(order):
        result = await db.execute(
            select(CategoryModel).where(CategoryModel.id == cat_id)
        )
        category = result.scalar_one_or_none()
        if category:
            category.order_index = idx
    
    await db.commit()
    return {"status": "reordered"}
