"""Kalendář cashflow (VYLEPSENI.md 4.5).

Read-only agregace nad existujícími daty — žádné vlastní tabulky:
  - nezaplacené položky rozpočtu aktuálního měsíce (monthly_expenses + due_day
    ze šablony) a nezaplacené splátky úvěrů splatné tento měsíc
  - předplatná s příštím stržením do konce měsíce (přes pattern-matching
    helpery ze subscriptions; deduplikovaná proti položkám rozpočtu)
  - očekávaná výplata (řádek is_salary v rozpočtu; den odhadnutý mediánem
    z minulých transakcí kategorie Salary)

Z toho denní projekce zůstatku od dneška do konce měsíce + skutečný průběh
zůstatku od 1. dne měsíce (stejný walk-back princip jako /dashboard/balance-history).
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, timedelta
from statistics import median
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from auth import get_current_user
from database import get_db
from models import (
    AccountModel,
    TransactionModel,
    MonthlyBudgetModel,
    MonthlyExpenseModel,
    MonthlyIncomeItemModel,
    RecurringExpenseModel,
    LoanModel,
    LoanPaymentModel,
    SubscriptionModel,
    UserModel,
)
from services.exchange_rates import get_exchange_rate
from routers.subscriptions import (
    PERIOD_MONTHS,
    _add_months,
    _load_charges,
    _my_amount,
    _parse_date,
    _primary_token,
)

router = APIRouter()


class CashflowEvent(BaseModel):
    date: str                    # YYYY-MM-DD
    name: str
    amount: float                # záporné = odchozí
    source: str                  # "budget" | "loan" | "subscription" | "salary"
    date_estimated: bool = False  # den neznáme jistě (bez splatnosti / odhad výplaty)
    overdue: bool = False        # splatnost už proběhla, ale nezaplaceno


class DailyPoint(BaseModel):
    date: str
    balance: float


class CashflowResponse(BaseModel):
    year_month: str
    today: str
    currency: str
    current_balance: float
    history: List[DailyPoint]     # 1. den měsíce → dnešek (skutečnost)
    projection: List[DailyPoint]  # dnešek → konec měsíce (projekce)
    events: List[CashflowEvent]
    expected_out: float
    expected_in: float
    projected_eom: float
    projected_min: Optional[DailyPoint]


def _month_end(d: date) -> date:
    nxt = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
    return nxt - timedelta(days=1)


def _effective_my_amount(e: MonthlyExpenseModel) -> float:
    if e.my_amount_override is not None:
        return e.my_amount_override
    return e.amount * (e.my_percentage or 100) / 100


async def _budget_events(
    db: AsyncSession, user_id: int, today: date, eom: date,
) -> tuple[List[CashflowEvent], List[str]]:
    """Nezaplacené položky rozpočtu + splátky úvěrů tento měsíc.

    Vrací (events, dedup_keys) — klíče (názvy + match patterny lowercase)
    pro pozdější deduplikaci předplatných.
    """
    year_month = today.strftime("%Y-%m")
    events: List[CashflowEvent] = []
    dedup_keys: List[str] = []

    budget = (await db.execute(
        select(MonthlyBudgetModel).where(
            MonthlyBudgetModel.user_id == user_id,
            MonthlyBudgetModel.year_month == year_month,
        )
    )).scalar_one_or_none()

    if budget:
        rows = (await db.execute(
            select(MonthlyExpenseModel, RecurringExpenseModel)
            .outerjoin(RecurringExpenseModel, MonthlyExpenseModel.recurring_expense_id == RecurringExpenseModel.id)
            .where(MonthlyExpenseModel.budget_id == budget.id)
        )).all()
        for expense, recurring in rows:
            dedup_keys.append(expense.name.lower())
            if recurring and recurring.match_pattern:
                dedup_keys.append(recurring.match_pattern.lower())
            if expense.is_paid:
                continue
            my_amount = _effective_my_amount(expense)
            if my_amount <= 0:
                continue
            due_day = recurring.due_day if recurring else None
            if due_day:
                # den splatnosti oříznutý na délku měsíce; po splatnosti → dnes
                event_date = min(date(today.year, today.month, min(due_day, eom.day)), eom)
                overdue = event_date < today
                if overdue:
                    event_date = today
                estimated = False
            else:
                event_date, overdue, estimated = eom, False, True
            events.append(CashflowEvent(
                date=event_date.strftime("%Y-%m-%d"),
                name=expense.name,
                amount=-round(my_amount, 2),
                source="budget",
                date_estimated=estimated,
                overdue=overdue,
            ))

    loan_rows = (await db.execute(
        select(LoanModel, LoanPaymentModel)
        .join(LoanPaymentModel, LoanPaymentModel.loan_id == LoanModel.id)
        .where(
            LoanModel.user_id == user_id,
            LoanModel.is_active.is_(True),
            LoanPaymentModel.is_paid.is_(False),
            LoanPaymentModel.due_date.like(f"{year_month}-%"),
        )
    )).all()
    for loan, payment in loan_rows:
        dedup_keys.append(loan.name.lower())
        if loan.match_pattern:
            dedup_keys.append(loan.match_pattern.lower())
        due = _parse_date(payment.due_date) or eom
        overdue = due < today
        events.append(CashflowEvent(
            date=(today if overdue else due).strftime("%Y-%m-%d"),
            name=loan.name,
            amount=-round(payment.amount, 2),
            source="loan",
            overdue=overdue,
        ))

    return events, dedup_keys


async def _subscription_events(
    db: AsyncSession, user_id: int, today: date, eom: date, dedup_keys: List[str],
) -> List[CashflowEvent]:
    """Předplatná s příštím stržením do konce měsíce, mimo ta už pokrytá rozpočtem."""
    subs = (await db.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.user_id == user_id,
            SubscriptionModel.is_active.is_(True),
        )
    )).scalars().all()

    events: List[CashflowEvent] = []
    for sub in subs:
        token = _primary_token(sub.merchant_pattern.lower())
        name_lc = sub.name.lower()
        if any(name_lc in key or key in name_lc or token in key for key in dedup_keys):
            continue
        charges = await _load_charges(db, user_id, sub.merchant_pattern)
        last_date = _parse_date(charges[0][0]) if charges else None
        if not last_date:
            continue
        next_due = _add_months(last_date, PERIOD_MONTHS.get(sub.period, 1))
        if not (today <= next_due <= eom):
            continue
        amount = _my_amount(sub)
        if sub.currency != "CZK":
            amount = round(amount * await get_exchange_rate(sub.currency, "CZK"), 2)
        events.append(CashflowEvent(
            date=next_due.strftime("%Y-%m-%d"),
            name=sub.name,
            amount=-round(amount, 2),
            source="subscription",
        ))
    return events


async def _salary_event(
    db: AsyncSession, user_id: int, today: date, eom: date,
) -> Optional[CashflowEvent]:
    """Očekávaná výplata: částka z řádku is_salary v rozpočtu (fallback medián
    minulých výplat), den = medián dne z minulých transakcí Salary. Když už
    výplata tento měsíc přišla (nebo bez historie), neexistuje co predikovat."""
    year_month = today.strftime("%Y-%m")
    past_salaries = (await db.execute(
        select(TransactionModel.date, TransactionModel.amount)
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.account_type == "bank",
            TransactionModel.category == "Salary",
            TransactionModel.amount > 0,
        )
        .order_by(TransactionModel.date.desc())
        .limit(8)
    )).all()
    if not past_salaries:
        return None
    if any(d.startswith(year_month) for d, _ in past_salaries):
        return None  # už přišla → je v zůstatku

    days = [int(d[8:10]) for d, _ in past_salaries if len(d) >= 10]
    pay_day = int(median(days)) if days else None
    if not pay_day:
        return None
    expected_date = min(date(today.year, today.month, min(pay_day, eom.day)), eom)
    if expected_date < today:
        expected_date = today  # po termínu, ale ještě nepřišla → počítej co nejdřív

    # Částka: řádek is_salary v aktuálním rozpočtu má přednost před historií
    row_amount = (await db.execute(
        select(MonthlyIncomeItemModel.amount)
        .join(MonthlyBudgetModel, MonthlyIncomeItemModel.budget_id == MonthlyBudgetModel.id)
        .where(
            MonthlyBudgetModel.user_id == user_id,
            MonthlyBudgetModel.year_month == year_month,
            MonthlyIncomeItemModel.is_salary.is_(True),
        )
        .limit(1)
    )).scalar_one_or_none()
    amount = row_amount if row_amount else median(a for _, a in past_salaries)

    return CashflowEvent(
        date=expected_date.strftime("%Y-%m-%d"),
        name="Výplata",
        amount=round(amount, 2),
        source="salary",
        date_estimated=True,
    )


async def _month_history(
    db: AsyncSession, user_id: int, today: date, current_balance: float,
) -> List[DailyPoint]:
    """Skutečný průběh zůstatku od 1. dne měsíce do dneška — walk-back od
    aktuálního zůstatku přes denní součty transakcí (jako balance-history)."""
    month_start = today.replace(day=1)
    txs = (await db.execute(
        select(TransactionModel.date, func.sum(TransactionModel.amount))
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.account_type == "bank",
            TransactionModel.date >= month_start.strftime("%Y-%m-%d"),
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == user_id,
                    AccountModel.is_visible.is_(True),
                )
            ),
        )
        .group_by(TransactionModel.date)
    )).all()
    daily_totals = {d[:10]: total for d, total in txs}

    points: List[DailyPoint] = []
    balance = current_balance
    day = today
    while day >= month_start:
        points.append(DailyPoint(date=day.strftime("%Y-%m-%d"), balance=round(balance, 2)))
        balance -= daily_totals.get(day.strftime("%Y-%m-%d"), 0)
        day -= timedelta(days=1)
    points.reverse()
    return points


@router.get("/current", response_model=CashflowResponse)
async def get_cashflow_current(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    eom = _month_end(today)

    current_balance = (await db.execute(
        select(func.sum(AccountModel.balance)).where(
            AccountModel.user_id == current_user.id,
            AccountModel.type == "bank",
            AccountModel.is_visible.is_(True),
        )
    )).scalar() or 0.0

    events, dedup_keys = await _budget_events(db, current_user.id, today, eom)
    events += await _subscription_events(db, current_user.id, today, eom, dedup_keys)
    salary = await _salary_event(db, current_user.id, today, eom)
    if salary:
        events.append(salary)
    events.sort(key=lambda e: (e.date, e.amount))

    # Denní projekce: dnešek → konec měsíce, události se propíší v den splatnosti
    per_day: dict[str, float] = {}
    for e in events:
        per_day[e.date] = per_day.get(e.date, 0) + e.amount

    projection: List[DailyPoint] = []
    balance = current_balance
    day = today
    while day <= eom:
        key = day.strftime("%Y-%m-%d")
        balance += per_day.get(key, 0)
        projection.append(DailyPoint(date=key, balance=round(balance, 2)))
        day += timedelta(days=1)

    projected_min = min(projection, key=lambda p: p.balance) if projection else None
    history = await _month_history(db, current_user.id, today, current_balance)

    return CashflowResponse(
        year_month=today.strftime("%Y-%m"),
        today=today.strftime("%Y-%m-%d"),
        currency="CZK",
        current_balance=round(current_balance, 2),
        history=history,
        projection=projection,
        events=events,
        expected_out=round(-sum(e.amount for e in events if e.amount < 0), 2),
        expected_in=round(sum(e.amount for e in events if e.amount > 0), 2),
        projected_eom=round(projection[-1].balance if projection else current_balance, 2),
        projected_min=projected_min,
    )
