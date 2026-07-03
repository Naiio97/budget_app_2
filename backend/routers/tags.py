"""Tagy — volné štítky napříč kategoriemi (VYLEPSENI 4.7).

Kategorie říká CO to bylo (jídlo, doprava), tag K ČEMU to patřilo
("dovolená 2026", "rekonstrukce"). Summary odpovídá na "kolik mě stál
projekt X" — výdaje počítá mojí částí (my_share_amount), stejně jako
ostatní agregace.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import TagModel, TransactionTagModel, TransactionModel, UserModel

router = APIRouter()


class TagRequest(BaseModel):
    name: str
    color: Optional[str] = None


class TagResponse(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    usage_count: int = 0


async def _get_user_tag(db: AsyncSession, tag_id: int, user_id: int) -> TagModel:
    result = await db.execute(
        select(TagModel).where(TagModel.id == tag_id, TagModel.user_id == user_id)
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.get("/")
async def get_tags(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All user's tags with usage counts."""
    result = await db.execute(
        select(TagModel, func.count(TransactionTagModel.transaction_id))
        .outerjoin(TransactionTagModel, TransactionTagModel.tag_id == TagModel.id)
        .where(TagModel.user_id == current_user.id)
        .group_by(TagModel.id)
        .order_by(TagModel.name)
    )
    return {
        "tags": [
            TagResponse(id=t.id, name=t.name, color=t.color, usage_count=count)
            for t, count in result.all()
        ]
    }


@router.post("/")
async def create_tag(
    request: TagRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name is required")

    existing = await db.execute(
        select(TagModel).where(
            TagModel.user_id == current_user.id,
            func.lower(TagModel.name) == name.lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tag with this name already exists")

    tag = TagModel(user_id=current_user.id, name=name, color=request.color or "#6366f1")
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagResponse(id=tag.id, name=tag.name, color=tag.color, usage_count=0)


@router.put("/{tag_id}")
async def update_tag(
    tag_id: int,
    request: TagRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tag = await _get_user_tag(db, tag_id, current_user.id)
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name is required")

    duplicate = await db.execute(
        select(TagModel).where(
            TagModel.user_id == current_user.id,
            func.lower(TagModel.name) == name.lower(),
            TagModel.id != tag_id,
        )
    )
    if duplicate.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tag with this name already exists")

    tag.name = name
    if request.color:
        tag.color = request.color
    await db.commit()
    return {"status": "updated", "id": tag.id}


@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tag = await _get_user_tag(db, tag_id, current_user.id)
    await db.execute(delete(TransactionTagModel).where(TransactionTagModel.tag_id == tag_id))
    await db.delete(tag)
    await db.commit()
    return {"status": "deleted", "id": tag_id}


@router.get("/{tag_id}/summary")
async def get_tag_summary(
    tag_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kolik stál "projekt" — součet přes všechny kategorie.

    Výdaje počítají moji část (my_share_amount, když je), vyřazené
    transakce a vypořádání se přeskakují — konzistentně s dashboardem.
    """
    tag = await _get_user_tag(db, tag_id, current_user.id)

    result = await db.execute(
        select(TransactionModel)
        .join(TransactionTagModel, TransactionTagModel.transaction_id == TransactionModel.id)
        .where(
            TransactionTagModel.tag_id == tag_id,
            TransactionModel.user_id == current_user.id,
        )
        .order_by(TransactionModel.date)
    )
    transactions = result.scalars().all()

    total_expenses = 0.0
    total_income = 0.0
    by_category: dict[str, float] = {}
    date_from = date_to = None

    for tx in transactions:
        if tx.is_excluded or (tx.transaction_type or "normal") != "normal":
            continue
        if tx.settlement_flag:
            continue
        if date_from is None:
            date_from = tx.date
        date_to = tx.date
        if tx.amount < 0:
            spent = tx.my_share_amount if tx.my_share_amount is not None else -tx.amount
            total_expenses += spent
            cat = tx.category or "Other"
            by_category[cat] = by_category.get(cat, 0.0) + spent
        else:
            total_income += tx.amount

    return {
        "tag": TagResponse(id=tag.id, name=tag.name, color=tag.color, usage_count=len(transactions)),
        "transaction_count": len(transactions),
        "total_expenses": round(total_expenses, 2),
        "total_income": round(total_income, 2),
        "net": round(total_income - total_expenses, 2),
        "by_category": [
            {"category": cat, "amount": round(amount, 2)}
            for cat, amount in sorted(by_category.items(), key=lambda kv: -kv[1])
        ],
        "date_from": date_from,
        "date_to": date_to,
        "currency": "CZK",
    }
