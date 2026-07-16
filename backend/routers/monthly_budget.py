"""
Monthly Budget Router - Měsíční rozpočet
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from pydantic import BaseModel
from typing import List, Optional

from auth import get_current_user
from database import get_db
from models import (
    MonthlyBudgetModel, MonthlyIncomeItemModel, RecurringExpenseModel, MonthlyExpenseModel,
    ManualAccountModel, ManualAccountItemModel, TransactionModel, UserModel,
    LoanModel, LoanPaymentModel, AccountModel, SubscriptionModel
)
from routers.subscriptions import PERIOD_MONTHS, _add_months, _my_amount, _parse_date, _primary_token
from services.categorization import fold

router = APIRouter(tags=["Budget & Expenses"])


# === Pydantic Models ===

class MonthlyBudgetCreate(BaseModel):
    year_month: str
    investment_amount: float = 0.0
    surplus_to_savings: float = 0.0


class MonthlyBudgetUpdate(BaseModel):
    investment_amount: Optional[float] = None
    surplus_to_savings: Optional[float] = None
    is_closed: Optional[bool] = None


class IncomeItemResponse(BaseModel):
    id: int
    name: str
    amount: float
    order_index: int
    is_salary: bool


class IncomeItemCreate(BaseModel):
    name: str
    amount: float = 0.0
    is_salary: bool = False


class IncomeItemUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None


class MonthlyExpenseResponse(BaseModel):
    id: int
    name: str
    amount: float
    my_percentage: int = 100
    my_amount: float = 0
    my_amount_override: Optional[float] = None
    is_paid: bool
    is_auto_paid: bool
    matched_transaction_id: Optional[str] = None
    recurring_expense_id: Optional[int] = None
    # Loan-derived virtual row (live-linked to a loan installment, read-only in
    # the budget UI). When is_loan is True, paid-toggling routes to the loan
    # payment endpoint instead of /monthly-expenses.
    is_loan: bool = False
    loan_id: Optional[int] = None
    loan_payment_id: Optional[int] = None
    # Subscription-derived virtual row (live-linked to a subscription; paid
    # state computed from the matched transaction, read-only in the budget UI).
    is_subscription: bool = False
    subscription_id: Optional[int] = None
    # Den v měsíci splatnosti (1-31) — u běžných řádků z recurring_expenses,
    # u úvěrových řádků odvozený z loan_payments.due_date. NULL = neznámý.
    due_day: Optional[int] = None


class MonthlyBudgetResponse(BaseModel):
    id: int
    year_month: str
    income_items: List[IncomeItemResponse]
    investment_amount: float
    surplus_to_savings: float
    is_closed: bool
    total_income: float
    total_expenses: float
    remaining: float
    expenses: List[MonthlyExpenseResponse]


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


class MonthlyExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    my_percentage: Optional[int] = None
    my_amount_override: Optional[float] = None
    is_paid: Optional[bool] = None
    name: Optional[str] = None


class ManualAccountCreate(BaseModel):
    name: str
    balance: float = 0.0
    currency: str = "CZK"


class ManualAccountUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[float] = None


class ManualAccountItemCreate(BaseModel):
    name: str
    amount: float
    note: Optional[str] = None


class ManualAccountItemResponse(BaseModel):
    id: int
    name: str
    amount: float
    note: Optional[str]


class ManualAccountResponse(BaseModel):
    id: int
    name: str
    balance: float
    currency: str
    items: List[ManualAccountItemResponse]
    items_total: float
    available_balance: float


# === Helpers (all enforce per-user ownership) ===

async def _get_user_budget(db: AsyncSession, user_id: int, year_month: str) -> Optional[MonthlyBudgetModel]:
    result = await db.execute(
        select(MonthlyBudgetModel).where(
            MonthlyBudgetModel.user_id == user_id,
            MonthlyBudgetModel.year_month == year_month,
        )
    )
    return result.scalar_one_or_none()


async def _require_budget(db: AsyncSession, user_id: int, year_month: str) -> MonthlyBudgetModel:
    budget = await _get_user_budget(db, user_id, year_month)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return budget


async def _create_default_salary_row(budget: MonthlyBudgetModel, db: AsyncSession) -> None:
    db.add(MonthlyIncomeItemModel(
        budget_id=budget.id,
        name="Výplata",
        amount=0.0,
        order_index=0,
        is_salary=True,
    ))
    await db.commit()


async def _load_income_items(budget_id: int, db: AsyncSession) -> List[MonthlyIncomeItemModel]:
    result = await db.execute(
        select(MonthlyIncomeItemModel)
        .where(MonthlyIncomeItemModel.budget_id == budget_id)
        .order_by(MonthlyIncomeItemModel.order_index, MonthlyIncomeItemModel.id)
    )
    return list(result.scalars().all())


async def _loan_expense_rows(db: AsyncSession, user_id: int, year_month: str) -> List[MonthlyExpenseResponse]:
    """Virtual expense rows for active loans whose installment is due in this
    month. Live-linked: amount + paid state come straight from the loan
    schedule, so there's nothing to keep in sync. Read-only in the budget UI."""
    result = await db.execute(
        select(LoanModel, LoanPaymentModel)
        .join(LoanPaymentModel, LoanPaymentModel.loan_id == LoanModel.id)
        .where(
            LoanModel.user_id == user_id,
            LoanModel.is_active.is_(True),
            LoanPaymentModel.due_date.like(f"{year_month}-%"),
        )
        .order_by(LoanModel.name)
    )
    rows: List[MonthlyExpenseResponse] = []
    for loan, payment in result.all():
        # due_date je YYYY-MM-DD string → den splátky
        try:
            payment_due_day = int(payment.due_date[8:10])
        except (TypeError, ValueError, IndexError):
            payment_due_day = None
        rows.append(MonthlyExpenseResponse(
            id=-payment.id,  # negative → never collides with real monthly_expenses ids
            name=loan.name,
            amount=payment.amount,
            my_percentage=100,
            my_amount=payment.amount,
            my_amount_override=None,
            is_paid=payment.is_paid,
            is_auto_paid=False,
            matched_transaction_id=payment.matched_transaction_id,
            recurring_expense_id=None,
            is_loan=True,
            loan_id=loan.id,
            loan_payment_id=payment.id,
            due_day=payment_due_day,
        ))
    return rows


# Virtuální id řádků: úvěry používají -payment.id, předplatná dostávají vlastní
# pásmo, aby se obě záporné řady nikdy nepotkaly.
SUBSCRIPTION_ROW_ID_OFFSET = 1_000_000


def _month_bounds(year_month: str) -> tuple[str, str]:
    """(start, end) — end je exkluzivní první den dalšího měsíce."""
    year, month = map(int, year_month.split("-"))
    if month == 12:
        return f"{year_month}-01", f"{year + 1:04d}-01-01"
    return f"{year_month}-01", f"{year:04d}-{month + 1:02d}-01"


async def _subscription_expense_rows(
    db: AsyncSession, user_id: int, year_month: str, taken_names: set[str],
) -> List[MonthlyExpenseResponse]:
    """Virtual expense rows for active subscriptions due in this month.

    Live-linked like loans: paid state = a charge matching merchant_pattern
    exists in the month, nothing is persisted. Monthly subs are due every
    month; quarterly/yearly only in months where the renewal falls (derived
    from the last charge before the month, fallback first_seen_date anchor).

    Dedupe: sub is skipped when an existing expense row's name occurs inside
    the sub's name or merchant pattern (diacritics-insensitive substring) —
    a manually tracked "Netflix" row wins over the "NETFLIX.COM Amsterdam NL"
    subscription, so nothing shows up twice during the transition.
    """
    result = await db.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.user_id == user_id,
            SubscriptionModel.is_active.is_(True),
        ).order_by(SubscriptionModel.name)
    )
    subs = list(result.scalars().all())
    if not subs:
        return []

    start_date, end_date = _month_bounds(year_month)
    month_start = _parse_date(start_date)
    rows: List[MonthlyExpenseResponse] = []

    folded_taken = {fold(n).strip() for n in taken_names}
    folded_taken.discard("")

    for sub in subs:
        sub_text = fold(f"{sub.name} {sub.merchant_pattern}")
        if any(len(t) >= 3 and t in sub_text for t in folded_taken):
            continue

        period_months = PERIOD_MONTHS.get(sub.period, 1)

        # Poslední platby patternu do konce měsíce — stejné matchování jako
        # na stránce Předplatná (_primary_token, popis i raw_json).
        like = f"%{_primary_token(sub.merchant_pattern)}%"
        charge_result = await db.execute(
            select(TransactionModel.id, TransactionModel.date)
            .where(
                TransactionModel.user_id == user_id,
                TransactionModel.account_type == "bank",
                TransactionModel.amount < 0,
                TransactionModel.is_excluded.is_(False),
                TransactionModel.date < end_date,
                or_(
                    TransactionModel.description.ilike(like),
                    TransactionModel.raw_json.ilike(like),
                ),
            )
            .order_by(TransactionModel.date.desc())
            .limit(6)
        )
        charges = charge_result.all()
        in_month = next((c for c in charges if c.date >= start_date), None)
        last_before = next((c for c in charges if c.date < start_date), None)

        due_day: Optional[int] = None
        if in_month is not None:
            # Platba v měsíci proběhla → řádek je splatný a zaplacený.
            due_day = (_parse_date(in_month.date) or month_start).day
        elif sub.period == "monthly":
            # Měsíční předplatné je splatné každý měsíc.
            anchor = last_before.date if last_before else sub.first_seen_date
            anchor_date = _parse_date(anchor) if anchor else None
            due_day = anchor_date.day if anchor_date else None
        elif last_before is not None:
            # Kvartální/roční: splatné jen v měsíci, kam padne obnovení
            # (poslední platba + perioda); po termínu zůstává viset jako
            # nezaplacené i v dalších měsících.
            last_d = _parse_date(last_before.date)
            if last_d is None:
                continue
            expected = _add_months(last_d, period_months)
            if expected.strftime("%Y-%m-%d") >= end_date:
                continue
            due_day = expected.day if expected.strftime("%Y-%m") == year_month else None
        else:
            # Žádná platba v historii — fáze se odvodí z first_seen_date.
            first_seen = _parse_date(sub.first_seen_date) if sub.first_seen_date else None
            if first_seen is None or month_start is None:
                continue
            months_diff = (month_start.year - first_seen.year) * 12 + (month_start.month - first_seen.month)
            if months_diff < 0 or months_diff % period_months != 0:
                continue
            due_day = first_seen.day

        my_pct = sub.my_percentage if sub.my_percentage is not None else 100
        rows.append(MonthlyExpenseResponse(
            id=-(SUBSCRIPTION_ROW_ID_OFFSET + sub.id),
            name=sub.name,
            amount=sub.amount,
            my_percentage=my_pct,
            my_amount=_my_amount(sub),
            my_amount_override=sub.my_amount_override,
            is_paid=in_month is not None,
            is_auto_paid=True,  # předplatné se strhává z karty samo
            matched_transaction_id=in_month.id if in_month is not None else None,
            recurring_expense_id=None,
            is_subscription=True,
            subscription_id=sub.id,
            due_day=due_day,
        ))
    return rows


@router.get("/monthly-budget/{year_month}", response_model=MonthlyBudgetResponse)
async def get_monthly_budget(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Získat rozpočet pro měsíc (vytvoří nový pokud neexistuje)"""
    budget = await _get_user_budget(db, current_user.id, year_month)

    is_fresh = False
    if not budget:
        budget = MonthlyBudgetModel(user_id=current_user.id, year_month=year_month)
        db.add(budget)
        await db.commit()
        await db.refresh(budget)
        is_fresh = True

    if is_fresh:
        await _create_default_salary_row(budget, db)

    income_items = await _load_income_items(budget.id, db)

    expenses_result = await db.execute(
        select(MonthlyExpenseModel).where(MonthlyExpenseModel.budget_id == budget.id).order_by(MonthlyExpenseModel.id)
    )
    expenses = expenses_result.scalars().all()

    total_income = sum(item.amount for item in income_items)
    def effective_my_amount(e) -> float:
        if e.my_amount_override is not None:
            return e.my_amount_override
        return e.amount * (e.my_percentage or 100) / 100

    # Splatnost žije na šabloně (recurring_expenses.due_day) — jednorázový
    # lookup místo N+1 dotazů per řádek.
    recurring_ids = [e.recurring_expense_id for e in expenses if e.recurring_expense_id]
    due_days: dict = {}
    if recurring_ids:
        rec_result = await db.execute(
            select(RecurringExpenseModel.id, RecurringExpenseModel.due_day)
            .where(RecurringExpenseModel.id.in_(recurring_ids))
        )
        due_days = {rid: dd for rid, dd in rec_result.all()}

    expense_rows = [MonthlyExpenseResponse(
        id=e.id,
        name=e.name,
        amount=e.amount,
        my_percentage=e.my_percentage or 100,
        my_amount=effective_my_amount(e),
        my_amount_override=e.my_amount_override,
        is_paid=e.is_paid,
        is_auto_paid=e.is_auto_paid,
        matched_transaction_id=e.matched_transaction_id,
        recurring_expense_id=e.recurring_expense_id,
        due_day=due_days.get(e.recurring_expense_id)
    ) for e in expenses]

    # Append live-linked loan installments due this month (read-only rows).
    expense_rows.extend(await _loan_expense_rows(db, current_user.id, year_month))

    # Append live-linked subscriptions due this month (read-only rows);
    # rows already present by name (manual recurring expense) win.
    taken_names = {r.name.lower().strip() for r in expense_rows}
    expense_rows.extend(await _subscription_expense_rows(db, current_user.id, year_month, taken_names))

    total_expenses = sum(r.my_amount for r in expense_rows)

    return MonthlyBudgetResponse(
        id=budget.id,
        year_month=budget.year_month,
        income_items=[IncomeItemResponse(
            id=i.id,
            name=i.name,
            amount=i.amount,
            order_index=i.order_index,
            is_salary=i.is_salary,
        ) for i in income_items],
        investment_amount=budget.investment_amount,
        surplus_to_savings=budget.surplus_to_savings,
        is_closed=budget.is_closed,
        total_income=total_income,
        total_expenses=total_expenses,
        remaining=total_income - total_expenses - budget.investment_amount - budget.surplus_to_savings,
        expenses=expense_rows
    )


@router.put("/monthly-budget/{year_month}")
async def update_monthly_budget(
    year_month: str,
    data: MonthlyBudgetUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aktualizovat měsíční rozpočet."""
    budget = await _require_budget(db, current_user.id, year_month)

    if data.investment_amount is not None:
        budget.investment_amount = data.investment_amount
    if data.surplus_to_savings is not None:
        budget.surplus_to_savings = data.surplus_to_savings
    if data.is_closed is not None:
        budget.is_closed = data.is_closed

    await db.commit()
    return {"status": "updated"}


# === Income Items Endpoints ===

@router.post("/monthly-budget/{year_month}/income-items", response_model=IncomeItemResponse)
async def add_income_item(
    year_month: str,
    data: IncomeItemCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Přidat nový řádek příjmu."""
    budget = await _require_budget(db, current_user.id, year_month)

    if data.is_salary:
        existing = await db.execute(
            select(MonthlyIncomeItemModel)
            .where(MonthlyIncomeItemModel.budget_id == budget.id)
            .where(MonthlyIncomeItemModel.is_salary.is_(True))
        )
        for item in existing.scalars().all():
            item.is_salary = False

    max_index_result = await db.execute(
        select(func.max(MonthlyIncomeItemModel.order_index))
        .where(MonthlyIncomeItemModel.budget_id == budget.id)
    )
    max_index = max_index_result.scalar() or -1

    item = MonthlyIncomeItemModel(
        budget_id=budget.id,
        name=data.name.strip() or "Nový příjem",
        amount=data.amount,
        order_index=max_index + 1,
        is_salary=data.is_salary,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return IncomeItemResponse(
        id=item.id,
        name=item.name,
        amount=item.amount,
        order_index=item.order_index,
        is_salary=item.is_salary,
    )


async def _get_user_income_item(db: AsyncSession, user_id: int, item_id: int) -> MonthlyIncomeItemModel:
    """Look up an income item only if it belongs to a budget owned by the user."""
    result = await db.execute(
        select(MonthlyIncomeItemModel)
        .join(MonthlyBudgetModel, MonthlyIncomeItemModel.budget_id == MonthlyBudgetModel.id)
        .where(
            MonthlyIncomeItemModel.id == item_id,
            MonthlyBudgetModel.user_id == user_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Income item not found")
    return item


@router.put("/monthly-income-items/{item_id}")
async def update_income_item(
    item_id: int,
    data: IncomeItemUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Přejmenovat / upravit částku řádku příjmu."""
    item = await _get_user_income_item(db, current_user.id, item_id)
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name must not be empty")
        item.name = name
    if data.amount is not None:
        item.amount = data.amount
    await db.commit()
    return {"status": "updated"}


@router.delete("/monthly-income-items/{item_id}")
async def delete_income_item(
    item_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat řádek příjmu."""
    item = await _get_user_income_item(db, current_user.id, item_id)
    await db.delete(item)
    await db.commit()
    return {"status": "deleted"}


@router.delete("/monthly-budget/{year_month}")
async def delete_monthly_budget(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat měsíční rozpočet včetně všech výdajů"""
    budget = await _require_budget(db, current_user.id, year_month)

    await db.execute(
        MonthlyExpenseModel.__table__.delete().where(MonthlyExpenseModel.budget_id == budget.id)
    )

    await db.delete(budget)
    await db.commit()

    return {"status": "deleted", "year_month": year_month}


@router.post("/monthly-budget/{year_month}/copy-previous")
async def copy_from_previous_month(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Zkopírovat výdaje z předchozího měsíce"""
    year, month = map(int, year_month.split("-"))
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1
    prev_year_month = f"{prev_year:04d}-{prev_month:02d}"

    prev_budget = await _get_user_budget(db, current_user.id, prev_year_month)
    if not prev_budget:
        raise HTTPException(status_code=404, detail="Předchozí měsíc neexistuje")

    curr_budget = await _get_user_budget(db, current_user.id, year_month)
    if not curr_budget:
        curr_budget = MonthlyBudgetModel(user_id=current_user.id, year_month=year_month)
        db.add(curr_budget)
        await db.commit()
        await db.refresh(curr_budget)

    await db.execute(
        MonthlyExpenseModel.__table__.delete().where(MonthlyExpenseModel.budget_id == curr_budget.id)
    )

    prev_expenses_result = await db.execute(
        select(MonthlyExpenseModel).where(MonthlyExpenseModel.budget_id == prev_budget.id).order_by(MonthlyExpenseModel.id)
    )
    prev_expenses = prev_expenses_result.scalars().all()

    copied_count = 0
    for exp in prev_expenses:
        new_expense = MonthlyExpenseModel(
            budget_id=curr_budget.id,
            recurring_expense_id=exp.recurring_expense_id,
            name=exp.name,
            amount=exp.amount,
            my_percentage=exp.my_percentage or 100,
            my_amount_override=exp.my_amount_override,
            is_auto_paid=exp.is_auto_paid,
            is_paid=False
        )
        db.add(new_expense)
        copied_count += 1

    await db.execute(
        MonthlyIncomeItemModel.__table__.delete().where(MonthlyIncomeItemModel.budget_id == curr_budget.id)
    )
    prev_income_result = await db.execute(
        select(MonthlyIncomeItemModel)
        .where(MonthlyIncomeItemModel.budget_id == prev_budget.id)
        .order_by(MonthlyIncomeItemModel.order_index)
    )
    income_copied = 0
    for inc in prev_income_result.scalars().all():
        db.add(MonthlyIncomeItemModel(
            budget_id=curr_budget.id,
            name=inc.name,
            amount=0.0,
            order_index=inc.order_index,
            is_salary=inc.is_salary,
        ))
        income_copied += 1

    await db.commit()
    return {"status": "copied", "from": prev_year_month, "expenses_copied": copied_count, "income_items_copied": income_copied}


@router.post("/monthly-budget/{year_month}/match-transactions")
async def match_transactions(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Automaticky spárovat výdaje s transakcemi"""
    budget = await _require_budget(db, current_user.id, year_month)

    expenses_result = await db.execute(
        select(MonthlyExpenseModel).where(MonthlyExpenseModel.budget_id == budget.id).order_by(MonthlyExpenseModel.id)
    )
    expenses = expenses_result.scalars().all()

    recurring_result = await db.execute(
        select(RecurringExpenseModel).where(
            RecurringExpenseModel.user_id == current_user.id,
            RecurringExpenseModel.match_pattern != None,
        )
    )
    recurring_expenses = recurring_result.scalars().all()

    pattern_by_name = {}
    for rec in recurring_expenses:
        pattern_by_name[rec.name.lower()] = rec.match_pattern.lower()
        if rec.id:
            pattern_by_name[f"id_{rec.id}"] = rec.match_pattern.lower()

    start_date = f"{year_month}-01"
    if year_month.endswith("-12"):
        year = int(year_month[:4]) + 1
        end_date = f"{year:04d}-01-01"
    else:
        year, month = map(int, year_month.split("-"))
        end_date = f"{year:04d}-{month+1:02d}-01"

    tx_result = await db.execute(
        select(TransactionModel)
        .where(TransactionModel.user_id == current_user.id)
        .where(TransactionModel.date >= start_date)
        .where(TransactionModel.date < end_date)
        .where(TransactionModel.amount < 0)
        # Hidden accounts are excluded from budget matching.
        .where(TransactionModel.account_id.in_(
            select(AccountModel.id).where(
                AccountModel.user_id == current_user.id,
                AccountModel.is_visible == True,
            )
        ))
    )
    transactions = tx_result.scalars().all()

    category_by_name = {}
    for rec in recurring_expenses:
        if rec.category:
            category_by_name[rec.name.lower()] = rec.category

    used_tx_ids = set()

    matched_count = 0
    matched_by_amount = 0
    matched_by_category = 0

    for expense in expenses:
        if expense.is_paid:
            continue

        matched = False

        pattern = None
        if expense.recurring_expense_id:
            pattern = pattern_by_name.get(f"id_{expense.recurring_expense_id}")
        if not pattern:
            pattern = pattern_by_name.get(expense.name.lower())

        if pattern:
            for tx in transactions:
                if tx.id in used_tx_ids:
                    continue
                if pattern in tx.description.lower():
                    expense.is_paid = True
                    expense.matched_transaction_id = tx.id
                    used_tx_ids.add(tx.id)
                    matched_count += 1
                    matched = True
                    break

        if matched:
            continue

        expense_amount = abs(expense.amount)
        tolerance = expense_amount * 0.05

        for tx in transactions:
            if tx.id in used_tx_ids:
                continue
            tx_amount = abs(tx.amount)
            if abs(tx_amount - expense_amount) <= tolerance:
                expense.is_paid = True
                expense.matched_transaction_id = tx.id
                used_tx_ids.add(tx.id)
                matched_by_amount += 1
                matched = True
                break

        if matched:
            continue

        expense_category = category_by_name.get(expense.name.lower())
        if expense_category:
            tolerance_wide = expense_amount * 0.20
            for tx in transactions:
                if tx.id in used_tx_ids:
                    continue
                if tx.category == expense_category:
                    tx_amount = abs(tx.amount)
                    if abs(tx_amount - expense_amount) <= tolerance_wide:
                        expense.is_paid = True
                        expense.matched_transaction_id = tx.id
                        used_tx_ids.add(tx.id)
                        matched_by_category += 1
                        break

    await db.commit()
    return {
        "status": "matched",
        "matched_count": matched_count + matched_by_amount + matched_by_category,
        "details": {
            "by_pattern": matched_count,
            "by_amount": matched_by_amount,
            "by_category": matched_by_category
        }
    }


@router.post("/monthly-budget/{year_month}/sync-income")
async def sync_income_from_transactions(
    year_month: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Automaticky načíst výplatu z transakcí označených jako Salary"""
    budget = await _get_user_budget(db, current_user.id, year_month)
    if not budget:
        budget = MonthlyBudgetModel(user_id=current_user.id, year_month=year_month)
        db.add(budget)
        await db.commit()
        await db.refresh(budget)

    start_date = f"{year_month}-01"
    salary_window_end = f"{year_month}-11"

    salary_result = await db.execute(
        select(func.sum(TransactionModel.amount))
        .where(TransactionModel.user_id == current_user.id)
        .where(TransactionModel.date >= start_date)
        .where(TransactionModel.date < salary_window_end)
        .where(TransactionModel.category == "Salary")
        .where(TransactionModel.amount > 0)
        # Hidden accounts don't contribute auto-detected salary income.
        .where(TransactionModel.account_id.in_(
            select(AccountModel.id).where(
                AccountModel.user_id == current_user.id,
                AccountModel.is_visible == True,
            )
        ))
    )
    salary_total = salary_result.scalar() or 0

    existing_result = await db.execute(
        select(MonthlyIncomeItemModel)
        .where(MonthlyIncomeItemModel.budget_id == budget.id)
        .where(MonthlyIncomeItemModel.is_salary.is_(True))
    )
    salary_item = existing_result.scalar_one_or_none()
    old_salary = salary_item.amount if salary_item else 0.0
    if salary_item is None:
        salary_item = MonthlyIncomeItemModel(
            budget_id=budget.id,
            name="Výplata",
            amount=salary_total,
            order_index=0,
            is_salary=True,
        )
        db.add(salary_item)
    else:
        salary_item.amount = salary_total

    await db.commit()

    return {
        "status": "synced",
        "salary": salary_total,
        "note": f"Výplata nalezena v období {start_date} až {salary_window_end}",
        "change": {"from": old_salary, "to": salary_total}
    }


# === Recurring Expenses Endpoints ===

@router.get("/recurring-expenses", response_model=List[RecurringExpenseResponse])
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
    expenses = result.scalars().all()

    return [RecurringExpenseResponse(
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
    ) for e in expenses]


@router.post("/recurring-expenses", response_model=RecurringExpenseResponse)
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

    return RecurringExpenseResponse(
        id=expense.id,
        name=expense.name,
        default_amount=expense.default_amount,
        my_percentage=expense.my_percentage or 100,
        is_auto_paid=expense.is_auto_paid,
        match_pattern=expense.match_pattern,
        category=expense.category,
        order_index=expense.order_index,
        is_active=expense.is_active,
        due_day=expense.due_day
    )


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


@router.put("/recurring-expenses/{expense_id}")
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


@router.delete("/recurring-expenses/{expense_id}")
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


# === Monthly Expense Endpoints ===

async def _get_user_monthly_expense(
    db: AsyncSession, user_id: int, expense_id: int
) -> MonthlyExpenseModel:
    result = await db.execute(
        select(MonthlyExpenseModel)
        .join(MonthlyBudgetModel, MonthlyExpenseModel.budget_id == MonthlyBudgetModel.id)
        .where(
            MonthlyExpenseModel.id == expense_id,
            MonthlyBudgetModel.user_id == user_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.put("/monthly-expenses/{expense_id}")
async def update_monthly_expense(
    expense_id: int,
    data: MonthlyExpenseUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upravit výdaj v měsíci"""
    expense = await _get_user_monthly_expense(db, current_user.id, expense_id)

    if data.amount is not None:
        expense.amount = data.amount
    if data.my_percentage is not None:
        expense.my_percentage = data.my_percentage
        expense.my_amount_override = None
    if data.my_amount_override is not None:
        expense.my_amount_override = data.my_amount_override if data.my_amount_override >= 0 else None
    if data.is_paid is not None:
        expense.is_paid = data.is_paid
    if data.name is not None:
        expense.name = data.name

    await db.commit()
    return {"status": "updated"}


@router.post("/monthly-budget/{year_month}/expenses")
async def add_monthly_expense(
    year_month: str,
    data: RecurringExpenseCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Přidat jednorázový výdaj do měsíce"""
    budget = await _require_budget(db, current_user.id, year_month)

    expense = MonthlyExpenseModel(
        budget_id=budget.id,
        name=data.name,
        amount=data.default_amount,
        is_auto_paid=data.is_auto_paid,
        is_paid=False
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)

    return {"status": "created", "id": expense.id}


@router.delete("/monthly-expenses/{expense_id}")
async def delete_monthly_expense(
    expense_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat výdaj z měsíce"""
    expense = await _get_user_monthly_expense(db, current_user.id, expense_id)
    await db.delete(expense)
    await db.commit()
    return {"status": "deleted"}


# === Manual Account Endpoints ===

@router.get("/", response_model=List[ManualAccountResponse])
async def get_manual_accounts(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seznam manuálních účtů"""
    result = await db.execute(
        select(ManualAccountModel).where(ManualAccountModel.user_id == current_user.id)
    )
    accounts = result.scalars().all()

    responses = []
    for acc in accounts:
        items_result = await db.execute(
            select(ManualAccountItemModel).where(ManualAccountItemModel.account_id == acc.id)
        )
        items = items_result.scalars().all()
        items_total = sum(i.amount for i in items)

        responses.append(ManualAccountResponse(
            id=acc.id,
            name=acc.name,
            balance=acc.balance,
            currency=acc.currency,
            items=[ManualAccountItemResponse(
                id=i.id,
                name=i.name,
                amount=i.amount,
                note=i.note
            ) for i in items],
            items_total=items_total,
            available_balance=acc.balance - items_total
        ))

    return responses


@router.post("/", response_model=ManualAccountResponse)
async def create_manual_account(
    data: ManualAccountCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vytvořit manuální účet"""
    account = ManualAccountModel(
        user_id=current_user.id,
        name=data.name,
        balance=data.balance,
        currency=data.currency
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)

    return ManualAccountResponse(
        id=account.id,
        name=account.name,
        balance=account.balance,
        currency=account.currency,
        items=[],
        items_total=0,
        available_balance=account.balance
    )


async def _get_user_manual_account(
    db: AsyncSession, user_id: int, account_id: int
) -> ManualAccountModel:
    result = await db.execute(
        select(ManualAccountModel).where(
            ManualAccountModel.id == account_id,
            ManualAccountModel.user_id == user_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.put("/{account_id}")
async def update_manual_account_budget(
    account_id: int,
    data: ManualAccountUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aktualizovat manuální účet"""
    account = await _get_user_manual_account(db, current_user.id, account_id)

    if data.name is not None:
        account.name = data.name
    if data.balance is not None:
        account.balance = data.balance

    await db.commit()
    return {"status": "updated"}


@router.delete("/{account_id}")
async def delete_manual_account(
    account_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat manuální účet"""
    account = await _get_user_manual_account(db, current_user.id, account_id)
    await db.delete(account)
    await db.commit()
    return {"status": "deleted"}


@router.post("/{account_id}/items")
async def add_manual_account_item(
    account_id: int,
    data: ManualAccountItemCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Přidat položku na manuální účet"""
    await _get_user_manual_account(db, current_user.id, account_id)

    item = ManualAccountItemModel(
        account_id=account_id,
        name=data.name,
        amount=data.amount,
        note=data.note
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return {"status": "created", "id": item.id}


async def _get_user_manual_item(
    db: AsyncSession, user_id: int, account_id: int, item_id: int
) -> ManualAccountItemModel:
    result = await db.execute(
        select(ManualAccountItemModel)
        .join(ManualAccountModel, ManualAccountItemModel.account_id == ManualAccountModel.id)
        .where(
            ManualAccountItemModel.id == item_id,
            ManualAccountItemModel.account_id == account_id,
            ManualAccountModel.user_id == user_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.put("/{account_id}/items/{item_id}")
async def update_manual_account_item(
    account_id: int,
    item_id: int,
    data: ManualAccountItemCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upravit položku na manuálním účtu"""
    item = await _get_user_manual_item(db, current_user.id, account_id, item_id)

    item.name = data.name
    item.amount = data.amount
    item.note = data.note

    await db.commit()
    return {"status": "updated"}


@router.delete("/{account_id}/items/{item_id}")
async def delete_manual_account_item(
    account_id: int,
    item_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat položku z manuálního účtu"""
    item = await _get_user_manual_item(db, current_user.id, account_id, item_id)
    await db.delete(item)
    await db.commit()
    return {"status": "deleted"}


# === Annual Overview ===

async def _compute_year_totals(year: int, user_id: int, db: AsyncSession):
    total_income = 0
    total_expenses = 0
    total_investments = 0
    total_savings = 0

    for month in range(1, 13):
        year_month = f"{year:04d}-{month:02d}"
        budget = await _get_user_budget(db, user_id, year_month)
        if not budget:
            continue

        expenses_result = await db.execute(
            select(func.sum(MonthlyExpenseModel.amount))
            .where(MonthlyExpenseModel.budget_id == budget.id)
        )
        month_expenses = expenses_result.scalar() or 0
        income_result = await db.execute(
            select(func.sum(MonthlyIncomeItemModel.amount))
            .where(MonthlyIncomeItemModel.budget_id == budget.id)
        )
        month_income = income_result.scalar() or 0

        total_income += month_income
        total_expenses += month_expenses
        total_investments += budget.investment_amount
        total_savings += budget.surplus_to_savings

    return {
        "income": total_income,
        "expenses": total_expenses,
        "investments": total_investments,
        "savings": total_savings,
        "net": total_income - total_expenses,
    }


@router.get("/annual-overview/{year}")
async def get_annual_overview(
    year: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Roční přehled"""
    months_data = []
    total_income = 0
    total_expenses = 0
    total_investments = 0
    total_savings = 0

    for month in range(1, 13):
        year_month = f"{year:04d}-{month:02d}"

        budget = await _get_user_budget(db, current_user.id, year_month)

        if budget:
            expenses_result = await db.execute(
                select(func.sum(MonthlyExpenseModel.amount))
                .where(MonthlyExpenseModel.budget_id == budget.id)
            )
            month_expenses = expenses_result.scalar() or 0

            income_result = await db.execute(
                select(func.sum(MonthlyIncomeItemModel.amount))
                .where(MonthlyIncomeItemModel.budget_id == budget.id)
            )
            month_income = income_result.scalar() or 0

            months_data.append({
                "month": month,
                "year_month": year_month,
                "income": month_income,
                "expenses": month_expenses,
                "investments": budget.investment_amount,
                "savings": budget.surplus_to_savings,
                "remaining": month_income - month_expenses - budget.investment_amount - budget.surplus_to_savings
            })

            total_income += month_income
            total_expenses += month_expenses
            total_investments += budget.investment_amount
            total_savings += budget.surplus_to_savings
        else:
            months_data.append({
                "month": month,
                "year_month": year_month,
                "income": 0,
                "expenses": 0,
                "investments": 0,
                "savings": 0,
                "remaining": 0
            })

    expense_breakdown = {}
    for month in range(1, 13):
        year_month = f"{year:04d}-{month:02d}"
        budget = await _get_user_budget(db, current_user.id, year_month)

        if budget:
            expenses_result = await db.execute(
                select(MonthlyExpenseModel).where(MonthlyExpenseModel.budget_id == budget.id).order_by(MonthlyExpenseModel.id)
            )
            expenses = expenses_result.scalars().all()

            for exp in expenses:
                if exp.name not in expense_breakdown:
                    expense_breakdown[exp.name] = 0
                expense_breakdown[exp.name] += exp.amount

    previous_year_totals = await _compute_year_totals(year - 1, current_user.id, db)

    return {
        "year": year,
        "months": months_data,
        "totals": {
            "income": total_income,
            "expenses": total_expenses,
            "investments": total_investments,
            "savings": total_savings,
            "net": total_income - total_expenses
        },
        "previous_year": previous_year_totals,
        "expense_breakdown": expense_breakdown,
        "averages": {
            "income": total_income / 12,
            "expenses": total_expenses / 12,
            "investments": total_investments / 12
        }
    }
