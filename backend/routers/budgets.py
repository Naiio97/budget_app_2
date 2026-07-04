from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from auth import get_current_user
from database import get_db
from models import BudgetModel, SavingsGoalModel, TransactionModel, UserModel, AccountModel

router = APIRouter()


# === Pydantic Models ===

class BudgetCreate(BaseModel):
    category: str
    amount: float
    currency: str = "CZK"


class BudgetUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    is_active: Optional[bool] = None


class DailySpendingPoint(BaseModel):
    day: int          # den v měsíci (1..31)
    spent: float      # kumulativně utraceno do konce tohoto dne


class BudgetResponse(BaseModel):
    id: int
    category: str
    amount: float
    currency: str
    is_active: bool
    spent: float = 0.0
    percentage: float = 0.0
    # Tempo utrácení (jen v GET /budgets/ — create/update vrací defaulty,
    # frontend si po mutaci stejně refetchuje celý seznam)
    projected: float = 0.0        # lineární odhad útraty na konci měsíce
    days_elapsed: int = 0
    days_in_month: int = 0
    daily_cumulative: List[DailySpendingPoint] = []


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    currency: str = "CZK"
    deadline: Optional[str] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    add_amount: Optional[float] = None
    deadline: Optional[str] = None
    is_completed: Optional[bool] = None


class GoalResponse(BaseModel):
    id: int
    name: str
    target_amount: float
    current_amount: float
    currency: str
    deadline: Optional[str]
    is_completed: bool
    percentage: float = 0.0


def get_current_month_range():
    """Get start and end date of current month in YYYY-MM-DD format"""
    now = datetime.utcnow()
    start = now.replace(day=1).strftime("%Y-%m-%d")
    if now.month == 12:
        end = now.replace(year=now.year + 1, month=1, day=1)
    else:
        end = now.replace(month=now.month + 1, day=1)
    end = end.strftime("%Y-%m-%d")
    return start, end


async def get_category_spending(db: AsyncSession, user_id: int, category: str) -> float:
    """Get total spending for a category in current month (user-scoped)"""
    start, end = get_current_month_range()

    result = await db.execute(
        select(func.sum(TransactionModel.amount))
        .where(TransactionModel.user_id == user_id)
        .where(TransactionModel.category == category)
        .where(TransactionModel.date >= start)
        .where(TransactionModel.date < end)
        .where(TransactionModel.amount < 0)
        # Skip transactions from hidden accounts — they're out of the picture.
        .where(TransactionModel.account_id.in_(
            select(AccountModel.id).where(
                AccountModel.user_id == user_id,
                AccountModel.is_visible == True,
            )
        ))
    )
    total = result.scalar() or 0
    return abs(total)


async def get_daily_spending_by_category(
    db: AsyncSession, user_id: int, categories: list[str]
) -> dict[str, dict[int, float]]:
    """Per-day spending for the given categories in the current month,
    one grouped query for all of them: {category: {day: spent_that_day}}."""
    if not categories:
        return {}
    start, end = get_current_month_range()

    result = await db.execute(
        select(
            TransactionModel.category,
            TransactionModel.date,
            func.sum(TransactionModel.amount),
        )
        .where(TransactionModel.user_id == user_id)
        .where(TransactionModel.category.in_(categories))
        .where(TransactionModel.date >= start)
        .where(TransactionModel.date < end)
        .where(TransactionModel.amount < 0)
        .where(TransactionModel.account_id.in_(
            select(AccountModel.id).where(
                AccountModel.user_id == user_id,
                AccountModel.is_visible == True,
            )
        ))
        .group_by(TransactionModel.category, TransactionModel.date)
    )

    daily: dict[str, dict[int, float]] = {}
    for category, date_str, total in result.all():
        try:
            day = int(date_str[8:10])  # 'YYYY-MM-DD' → DD
        except (TypeError, ValueError):
            continue
        daily.setdefault(category, {})[day] = abs(total or 0)
    return daily


def days_in_current_month() -> int:
    import calendar
    now = datetime.utcnow()
    return calendar.monthrange(now.year, now.month)[1]


def build_trend(
    daily: dict[int, float], amount: float, days_elapsed: int, days_in_month: int
) -> tuple[float, float, list[DailySpendingPoint]]:
    """From per-day spending build (spent, projected, cumulative series).

    `spent` covers the whole month (incl. forward-booked transactions — same
    semantics as get_category_spending); the burn-down series and the pace
    projection only look at days up to today.
    """
    cumulative = []
    running = 0.0
    for day in range(1, days_elapsed + 1):
        running += daily.get(day, 0.0)
        cumulative.append(DailySpendingPoint(day=day, spent=round(running, 2)))
    spent_to_date = running
    spent = round(sum(daily.values()), 2)
    projected = (
        spent_to_date / days_elapsed * days_in_month
    ) if days_elapsed > 0 else spent_to_date
    return spent, round(projected, 2), cumulative


# === Budget Endpoints ===

@router.get("/", response_model=List[BudgetResponse])
async def get_budgets(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all budgets with current spending + pace trend (burn-down data)"""
    result = await db.execute(
        select(BudgetModel).where(
            BudgetModel.user_id == current_user.id,
            BudgetModel.is_active == True,
        )
    )
    budgets = result.scalars().all()

    daily_by_category = await get_daily_spending_by_category(
        db, current_user.id, [b.category for b in budgets]
    )
    now = datetime.utcnow()
    days_elapsed = now.day
    days_in_month = days_in_current_month()

    response = []
    for budget in budgets:
        spent, projected, cumulative = build_trend(
            daily_by_category.get(budget.category, {}),
            budget.amount, days_elapsed, days_in_month,
        )
        percentage = (spent / budget.amount * 100) if budget.amount > 0 else 0

        response.append(BudgetResponse(
            id=budget.id,
            category=budget.category,
            amount=budget.amount,
            currency=budget.currency,
            is_active=budget.is_active,
            spent=spent,
            percentage=round(percentage, 1),
            projected=projected,
            days_elapsed=days_elapsed,
            days_in_month=days_in_month,
            daily_cumulative=cumulative,
        ))

    return response


@router.post("/", response_model=BudgetResponse)
async def create_budget(
    budget: BudgetCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new budget"""
    existing = await db.execute(
        select(BudgetModel).where(
            BudgetModel.user_id == current_user.id,
            BudgetModel.category == budget.category,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Budget for category '{budget.category}' already exists")

    new_budget = BudgetModel(
        user_id=current_user.id,
        category=budget.category,
        amount=budget.amount,
        currency=budget.currency
    )
    db.add(new_budget)
    await db.commit()
    await db.refresh(new_budget)

    spent = await get_category_spending(db, current_user.id, new_budget.category)
    percentage = (spent / new_budget.amount * 100) if new_budget.amount > 0 else 0

    return BudgetResponse(
        id=new_budget.id,
        category=new_budget.category,
        amount=new_budget.amount,
        currency=new_budget.currency,
        is_active=new_budget.is_active,
        spent=spent,
        percentage=round(percentage, 1)
    )


async def _get_user_budget(db: AsyncSession, budget_id: int, user_id: int) -> BudgetModel:
    result = await db.execute(
        select(BudgetModel).where(
            BudgetModel.id == budget_id,
            BudgetModel.user_id == user_id,
        )
    )
    db_budget = result.scalar_one_or_none()
    if not db_budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return db_budget


@router.put("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    budget_id: int,
    budget: BudgetUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a budget"""
    db_budget = await _get_user_budget(db, budget_id, current_user.id)

    if budget.category is not None:
        db_budget.category = budget.category
    if budget.amount is not None:
        db_budget.amount = budget.amount
    if budget.is_active is not None:
        db_budget.is_active = budget.is_active

    await db.commit()
    await db.refresh(db_budget)

    spent = await get_category_spending(db, current_user.id, db_budget.category)
    percentage = (spent / db_budget.amount * 100) if db_budget.amount > 0 else 0

    return BudgetResponse(
        id=db_budget.id,
        category=db_budget.category,
        amount=db_budget.amount,
        currency=db_budget.currency,
        is_active=db_budget.is_active,
        spent=spent,
        percentage=round(percentage, 1)
    )


@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a budget"""
    db_budget = await _get_user_budget(db, budget_id, current_user.id)
    await db.delete(db_budget)
    await db.commit()
    return {"status": "deleted", "id": budget_id}


@router.get("/overview")
async def get_budget_overview(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get budget overview for current month (for dashboard widget)"""
    result = await db.execute(
        select(BudgetModel).where(
            BudgetModel.user_id == current_user.id,
            BudgetModel.is_active == True,
        )
    )
    budgets = result.scalars().all()

    total_budget = 0
    total_spent = 0
    categories = []

    for budget in budgets:
        spent = await get_category_spending(db, current_user.id, budget.category)
        percentage = (spent / budget.amount * 100) if budget.amount > 0 else 0

        total_budget += budget.amount
        total_spent += spent

        categories.append({
            "category": budget.category,
            "amount": budget.amount,
            "spent": spent,
            "percentage": round(percentage, 1)
        })

    categories.sort(key=lambda x: x["percentage"], reverse=True)

    now = datetime.utcnow()

    return {
        "month": now.strftime("%Y-%m"),
        "month_name": now.strftime("%B %Y"),
        "total_budget": total_budget,
        "total_spent": total_spent,
        "total_percentage": round((total_spent / total_budget * 100) if total_budget > 0 else 0, 1),
        "categories": categories[:5],
        "categories_count": len(categories)
    }


# === Savings Goals Endpoints ===

@router.get("/goals", response_model=List[GoalResponse])
async def get_goals(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all savings goals"""
    result = await db.execute(
        select(SavingsGoalModel)
        .where(SavingsGoalModel.user_id == current_user.id)
        .order_by(SavingsGoalModel.is_completed, SavingsGoalModel.created_at.desc())
    )
    goals = result.scalars().all()

    return [
        GoalResponse(
            id=goal.id,
            name=goal.name,
            target_amount=goal.target_amount,
            current_amount=goal.current_amount,
            currency=goal.currency,
            deadline=goal.deadline,
            is_completed=goal.is_completed,
            percentage=round((goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0, 1)
        )
        for goal in goals
    ]


@router.post("/goals", response_model=GoalResponse)
async def create_goal(
    goal: GoalCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new savings goal"""
    new_goal = SavingsGoalModel(
        user_id=current_user.id,
        name=goal.name,
        target_amount=goal.target_amount,
        currency=goal.currency,
        deadline=goal.deadline
    )
    db.add(new_goal)
    await db.commit()
    await db.refresh(new_goal)

    return GoalResponse(
        id=new_goal.id,
        name=new_goal.name,
        target_amount=new_goal.target_amount,
        current_amount=new_goal.current_amount,
        currency=new_goal.currency,
        deadline=new_goal.deadline,
        is_completed=new_goal.is_completed,
        percentage=0.0
    )


async def _get_user_goal(db: AsyncSession, goal_id: int, user_id: int) -> SavingsGoalModel:
    result = await db.execute(
        select(SavingsGoalModel).where(
            SavingsGoalModel.id == goal_id,
            SavingsGoalModel.user_id == user_id,
        )
    )
    db_goal = result.scalar_one_or_none()
    if not db_goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return db_goal


@router.put("/goals/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: int,
    goal: GoalUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a savings goal"""
    db_goal = await _get_user_goal(db, goal_id, current_user.id)

    if goal.name is not None:
        db_goal.name = goal.name
    if goal.target_amount is not None:
        db_goal.target_amount = goal.target_amount
    if goal.current_amount is not None:
        db_goal.current_amount = goal.current_amount
    if goal.add_amount is not None:
        db_goal.current_amount += goal.add_amount
    if goal.deadline is not None:
        db_goal.deadline = goal.deadline
    if goal.is_completed is not None:
        db_goal.is_completed = goal.is_completed

    if db_goal.current_amount >= db_goal.target_amount:
        db_goal.is_completed = True

    await db.commit()
    await db.refresh(db_goal)

    return GoalResponse(
        id=db_goal.id,
        name=db_goal.name,
        target_amount=db_goal.target_amount,
        current_amount=db_goal.current_amount,
        currency=db_goal.currency,
        deadline=db_goal.deadline,
        is_completed=db_goal.is_completed,
        percentage=round((db_goal.current_amount / db_goal.target_amount * 100) if db_goal.target_amount > 0 else 0, 1)
    )


@router.delete("/goals/{goal_id}")
async def delete_goal(
    goal_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a savings goal"""
    db_goal = await _get_user_goal(db, goal_id, current_user.id)
    await db.delete(db_goal)
    await db.commit()
    return {"status": "deleted", "id": goal_id}
