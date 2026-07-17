"""
Recurring Expenses Router - Pravidelné měsíční výdaje (šablony pro rozpočet)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional

from auth import get_current_user
from database import get_db
from models import RecurringExpenseModel, UserModel

router = APIRouter(prefix="/recurring-expenses", tags=["Recurring Expenses"])


class RecurringExpenseCreate(BaseModel):
    name: str
    default_amount: float
    my_percentage: float = 100
    is_auto_paid: bool = False
    match_pattern: Optional[str] = None
    category: Optional[str] = None
    due_day: Optional[int] = None  # 1-31; mimo rozsah se ignoruje


class RecurringExpenseUpdate(BaseModel):
    name: Optional[str] = None
    default_amount: Optional[float] = None
    my_percentage: Optional[float] = None
    is_auto_paid: Optional[bool] = None
    match_pattern: Optional[str] = None
    category: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None
    due_day: Optional[int] = None  # 1-31; 0 smaže (None = beze změny)


class RecurringExpenseResponse(BaseModel):
    id: int
    name: str
    default_amount: float
    my_percentage: float = 100
    is_auto_paid: bool
    match_pattern: Optional[str]
    category: Optional[str]
    order_index: int
    is_active: bool
    due_day: Optional[int] = None


def _valid_due_day(day: Optional[int]) -> Optional[int]:
    return day if day is not None and 1 <= day <= 31 else None


def _to_response(e: RecurringExpenseModel) -> RecurringExpenseResponse:
    return RecurringExpenseResponse(
        id=e.id,
        name=e.name,
        default_amount=e.default_amount,
        my_percentage=e.my_percentage or 100,
        is_auto_paid=e.is_auto_paid,
        match_pattern=e.match_pattern,
        category=e.category,
        order_index=e.order_index,
        is_active=e.is_active,
        due_day=e.due_day
    )


@router.get("", response_model=List[RecurringExpenseResponse])
async def get_recurring_expenses(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seznam pravidelných výdajů"""
    result = await db.execute(
        select(RecurringExpenseModel)
        .where(RecurringExpenseModel.user_id == current_user.id)
        .order_by(RecurringExpenseModel.order_index)
    )
    return [_to_response(e) for e in result.scalars().all()]


@router.post("", response_model=RecurringExpenseResponse)
async def create_recurring_expense(
    data: RecurringExpenseCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vytvořit nový pravidelný výdaj"""
    result = await db.execute(
        select(func.max(RecurringExpenseModel.order_index))
        .where(RecurringExpenseModel.user_id == current_user.id)
    )
    max_index = result.scalar() or 0

    expense = RecurringExpenseModel(
        user_id=current_user.id,
        name=data.name,
        default_amount=data.default_amount,
        my_percentage=data.my_percentage,
        is_auto_paid=data.is_auto_paid,
        match_pattern=data.match_pattern,
        category=data.category,
        due_day=_valid_due_day(data.due_day),
        order_index=max_index + 1
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)

    return _to_response(expense)


async def _get_user_recurring_expense(
    db: AsyncSession, user_id: int, expense_id: int
) -> RecurringExpenseModel:
    result = await db.execute(
        select(RecurringExpenseModel).where(
            RecurringExpenseModel.id == expense_id,
            RecurringExpenseModel.user_id == user_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.put("/{expense_id}")
async def update_recurring_expense(
    expense_id: int,
    data: RecurringExpenseUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upravit pravidelný výdaj"""
    expense = await _get_user_recurring_expense(db, current_user.id, expense_id)

    if data.name is not None:
        expense.name = data.name
    if data.default_amount is not None:
        expense.default_amount = data.default_amount
    if data.my_percentage is not None:
        expense.my_percentage = data.my_percentage
    if data.is_auto_paid is not None:
        expense.is_auto_paid = data.is_auto_paid
    if data.match_pattern is not None:
        expense.match_pattern = data.match_pattern
    if data.category is not None:
        expense.category = data.category
    if data.order_index is not None:
        expense.order_index = data.order_index
    if data.is_active is not None:
        expense.is_active = data.is_active
    if data.due_day is not None:
        # 0 (nebo jiná hodnota mimo 1-31) splatnost smaže
        expense.due_day = _valid_due_day(data.due_day)

    await db.commit()
    return {"status": "updated"}


@router.delete("/{expense_id}")
async def delete_recurring_expense(
    expense_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat pravidelný výdaj"""
    expense = await _get_user_recurring_expense(db, current_user.id, expense_id)
    await db.delete(expense)
    await db.commit()
    return {"status": "deleted"}
