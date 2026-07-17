from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
import json

from auth import get_current_user
from database import get_db
from models import BudgetModel, SavingsGoalModel, TransactionModel, UserModel, AccountModel
from services.timefmt import utcnow

router = APIRouter()


def budget_category_list(budget: BudgetModel) -> list[str]:
    """Kategorie, které rozpočet pokrývá — u skupiny víc, jinak jedna."""
    if budget.categories:
        try:
            cats = json.loads(budget.categories)
            if isinstance(cats, list) and cats:
                return [str(c) for c in cats]
        except Exception:
            pass
    return [budget.category] if budget.category else []


def budget_display_name(budget: BudgetModel) -> str:
    return budget.name or budget.category or "Rozpočet"


# === Pydantic Models ===

class BudgetCreate(BaseModel):
    amount: float
    currency: str = "CZK"
    name: Optional[str] = None            # název skupiny ("Běžný život"); NULL = použije se kategorie
    categories: List[str] = []            # jedna nebo víc kategorií
    category: Optional[str] = None        # legacy: jedna kategorie (když se neposílá categories)


class BudgetUpdate(BaseModel):
    name: Optional[str] = None
    categories: Optional[List[str]] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    is_active: Optional[bool] = None


class DailySpendingPoint(BaseModel):
    day: int          # den v měsíci (1..31)
    spent: float      # kumulativně utraceno do konce tohoto dne


class BudgetResponse(BaseModel):
    id: int
    category: str                      # primární kategorie (zpětná kompatibilita)
    name: str                          # zobrazovaný název
    categories: List[str] = []         # všechny pokryté kategorie
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
    now = utcnow()
    start = now.replace(day=1).strftime("%Y-%m-%d")
    if now.month == 12:
        end = now.replace(year=now.year + 1, month=1, day=1)
    else:
        end = now.replace(month=now.month + 1, day=1)
    end = end.strftime("%Y-%m-%d")
    return start, end


async def get_category_spending(db: AsyncSession, user_id: int, categories) -> float:
    """Total spending for a category (or list of categories) this month.
    Přijímá string i list — u skupinového rozpočtu sečte všechny kategorie."""
    cats = [categories] if isinstance(categories, str) else list(categories)
    if not cats:
        return 0.0
    start, end = get_current_month_range()

    result = await db.execute(
        select(func.sum(TransactionModel.amount))
        .where(TransactionModel.user_id == user_id)
        .where(TransactionModel.category.in_(cats))
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
    now = utcnow()
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

    all_categories = set()
    for b in budgets:
        all_categories.update(budget_category_list(b))
    daily_by_category = await get_daily_spending_by_category(
        db, current_user.id, list(all_categories)
    )
    now = utcnow()
    days_elapsed = now.day
    days_in_month = days_in_current_month()

    response = []
    for budget in budgets:
        cats = budget_category_list(budget)
        # Sečti denní útratu přes všechny kategorie skupiny do jedné řady
        combined_daily: dict[int, float] = {}
        for c in cats:
            for day, amt in daily_by_category.get(c, {}).items():
                combined_daily[day] = combined_daily.get(day, 0.0) + amt

        spent, projected, cumulative = build_trend(
            combined_daily, budget.amount, days_elapsed, days_in_month,
        )
        percentage = (spent / budget.amount * 100) if budget.amount > 0 else 0

        response.append(BudgetResponse(
            id=budget.id,
            category=budget.category,
            name=budget_display_name(budget),
            categories=cats,
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
    """Create a new budget — jednu kategorii, nebo pojmenovanou skupinu kategorií."""
    # Normalizuj kategorie (nová `categories`, fallback legacy `category`)
    cats = [c.strip() for c in (budget.categories or ([budget.category] if budget.category else [])) if c and c.strip()]
    # zachovej pořadí, zahoď duplicity
    cats = list(dict.fromkeys(cats))
    if not cats:
        raise HTTPException(status_code=400, detail="At least one category is required")
    if budget.amount is None or budget.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    name = (budget.name or "").strip() or None
    is_group = len(cats) > 1 or name is not None
    display_name = name or cats[0]

    # Duplicitní název (u skupiny) / kategorie (u jednokategoriového)
    existing_budgets = (await db.execute(
        select(BudgetModel).where(BudgetModel.user_id == current_user.id)
    )).scalars().all()
    for b in existing_budgets:
        if budget_display_name(b).lower() == display_name.lower():
            raise HTTPException(status_code=400, detail=f"Budget '{display_name}' already exists")

    new_budget = BudgetModel(
        user_id=current_user.id,
        category=cats[0],
        name=name,
        categories=json.dumps(cats) if is_group else None,
        amount=budget.amount,
        currency=budget.currency,
    )
    db.add(new_budget)
    await db.commit()
    await db.refresh(new_budget)

    spent = await get_category_spending(db, current_user.id, cats)
    percentage = (spent / new_budget.amount * 100) if new_budget.amount > 0 else 0

    return BudgetResponse(
        id=new_budget.id,
        category=new_budget.category,
        name=display_name,
        categories=cats,
        amount=new_budget.amount,
        currency=new_budget.currency,
        is_active=new_budget.is_active,
        spent=spent,
        percentage=round(percentage, 1),
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

    if budget.categories is not None or budget.category is not None:
        cats = [c.strip() for c in (budget.categories or ([budget.category] if budget.category else [])) if c and c.strip()]
        cats = list(dict.fromkeys(cats))
        if not cats:
            raise HTTPException(status_code=400, detail="At least one category is required")
        db_budget.category = cats[0]
        db_budget.categories = json.dumps(cats) if (len(cats) > 1 or db_budget.name) else None
    if budget.name is not None:
        name = budget.name.strip() or None
        db_budget.name = name
        # název dělá z rozpočtu skupinu → ulož i categories
        if name and not db_budget.categories:
            db_budget.categories = json.dumps(budget_category_list(db_budget))
    if budget.amount is not None:
        db_budget.amount = budget.amount
    if budget.is_active is not None:
        db_budget.is_active = budget.is_active

    await db.commit()
    await db.refresh(db_budget)

    cats = budget_category_list(db_budget)
    spent = await get_category_spending(db, current_user.id, cats)
    percentage = (spent / db_budget.amount * 100) if db_budget.amount > 0 else 0

    return BudgetResponse(
        id=db_budget.id,
        category=db_budget.category,
        name=budget_display_name(db_budget),
        categories=cats,
        amount=db_budget.amount,
        currency=db_budget.currency,
        is_active=db_budget.is_active,
        spent=spent,
        percentage=round(percentage, 1),
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
