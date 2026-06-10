"""Loans router — úvěry a splátkové kalendáře (amortizace).

Úvěr se zadá parametry (jistina, sazba, počet splátek, datum první splátky).
Měsíční splátku buď zadá uživatel, nebo ji dopočítáme anuitním vzorcem. Při
vytvoření/úpravě se vygeneruje splátkový kalendář (LoanPaymentModel) — rozpad
každé splátky na úrok vs. jistinu a zbývající dluh v čase.
"""
from datetime import datetime, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import LoanModel, LoanPaymentModel, UserModel

router = APIRouter()


# === Amortization math ===

def annuity_payment(principal: float, annual_rate_pct: float, term_months: int) -> float:
    """Anuitní (konstantní) měsíční splátka.

    annual_rate_pct je roční sazba v % (např. 5.9). Při nulové sazbě jde o prosté
    rozdělení jistiny na počet splátek.
    """
    if term_months <= 0:
        return 0.0
    monthly_rate = (annual_rate_pct / 100.0) / 12.0
    if monthly_rate == 0:
        return round(principal / term_months, 2)
    factor = (1 + monthly_rate) ** term_months
    return round(principal * monthly_rate * factor / (factor - 1), 2)


def _add_months(d: date, months: int) -> date:
    """Add N months to a date, clamping the day to the target month's length."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    # Clamp day (e.g. Jan 31 + 1 month → Feb 28)
    if month == 12:
        next_month_first = date(year + 1, 1, 1)
    else:
        next_month_first = date(year, month + 1, 1)
    last_day = (next_month_first - date(year, month, 1)).days
    return date(year, month, min(d.day, last_day))


def build_schedule(
    principal: float,
    annual_rate_pct: float,
    term_months: int,
    monthly_payment: float,
    start_date: str,
) -> list[dict]:
    """Vygeneruj splátkový kalendář. Poslední splátka dorovná případné zaokrouhlení."""
    schedule: list[dict] = []
    monthly_rate = (annual_rate_pct / 100.0) / 12.0
    balance = principal
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD")

    for i in range(1, term_months + 1):
        interest = round(balance * monthly_rate, 2)
        principal_part = round(monthly_payment - interest, 2)
        # Last installment: pay off whatever is left (handles rounding drift).
        if i == term_months or principal_part >= balance:
            principal_part = round(balance, 2)
            payment_amount = round(principal_part + interest, 2)
        else:
            payment_amount = monthly_payment
        balance = round(balance - principal_part, 2)
        if balance < 0:
            balance = 0.0
        schedule.append({
            "installment_number": i,
            "due_date": _add_months(start, i - 1).strftime("%Y-%m-%d"),
            "amount": payment_amount,
            "principal_part": principal_part,
            "interest_part": interest,
            "remaining_balance": balance,
        })
        if balance <= 0:
            break
    return schedule


# === Pydantic schemas ===

class LoanCreate(BaseModel):
    name: str
    principal: float
    interest_rate: float = 0.0
    term_months: int
    monthly_payment: Optional[float] = None  # dopočítá se z anuity, pokud None
    start_date: str
    currency: str = "CZK"
    match_pattern: Optional[str] = None
    note: Optional[str] = None


class LoanUpdate(BaseModel):
    name: Optional[str] = None
    principal: Optional[float] = None
    interest_rate: Optional[float] = None
    term_months: Optional[int] = None
    monthly_payment: Optional[float] = None
    start_date: Optional[str] = None
    currency: Optional[str] = None
    match_pattern: Optional[str] = None
    note: Optional[str] = None
    is_active: Optional[bool] = None


class LoanPaymentResponse(BaseModel):
    id: int
    installment_number: int
    due_date: str
    amount: float
    principal_part: float
    interest_part: float
    remaining_balance: float
    is_paid: bool
    matched_transaction_id: Optional[str] = None


class LoanResponse(BaseModel):
    id: int
    name: str
    principal: float
    interest_rate: float
    term_months: int
    monthly_payment: float
    start_date: str
    currency: str
    match_pattern: Optional[str]
    note: Optional[str]
    is_active: bool
    # Derived progress fields
    paid_count: int
    paid_principal: float
    remaining_balance: float
    total_interest: float
    next_due_date: Optional[str]
    end_date: Optional[str]
    progress_percentage: float


# === Helpers ===

async def _get_user_loan(db: AsyncSession, user_id: int, loan_id: int) -> LoanModel:
    result = await db.execute(
        select(LoanModel).where(LoanModel.id == loan_id, LoanModel.user_id == user_id)
    )
    loan = result.scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    return loan


async def _load_payments(db: AsyncSession, loan_id: int) -> list[LoanPaymentModel]:
    result = await db.execute(
        select(LoanPaymentModel)
        .where(LoanPaymentModel.loan_id == loan_id)
        .order_by(LoanPaymentModel.installment_number)
    )
    return list(result.scalars().all())


async def _regenerate_schedule(db: AsyncSession, loan: LoanModel) -> None:
    """Drop and rebuild the payment schedule for a loan from its current params."""
    await db.execute(delete(LoanPaymentModel).where(LoanPaymentModel.loan_id == loan.id))
    schedule = build_schedule(
        loan.principal, loan.interest_rate, loan.term_months,
        loan.monthly_payment, loan.start_date,
    )
    for row in schedule:
        db.add(LoanPaymentModel(loan_id=loan.id, **row))


def _build_loan_response(loan: LoanModel, payments: list[LoanPaymentModel]) -> LoanResponse:
    paid = [p for p in payments if p.is_paid]
    paid_principal = round(sum(p.principal_part for p in paid), 2)
    total_interest = round(sum(p.interest_part for p in payments), 2)
    # Remaining balance = balance after the last paid installment (or full principal).
    if paid:
        last_paid = max(paid, key=lambda p: p.installment_number)
        remaining = last_paid.remaining_balance
    else:
        remaining = loan.principal
    unpaid = [p for p in payments if not p.is_paid]
    next_due = min(unpaid, key=lambda p: p.installment_number).due_date if unpaid else None
    end_date = payments[-1].due_date if payments else None
    progress = round(len(paid) / len(payments) * 100, 1) if payments else 0.0

    return LoanResponse(
        id=loan.id,
        name=loan.name,
        principal=loan.principal,
        interest_rate=loan.interest_rate,
        term_months=loan.term_months,
        monthly_payment=loan.monthly_payment,
        start_date=loan.start_date,
        currency=loan.currency,
        match_pattern=loan.match_pattern,
        note=loan.note,
        is_active=loan.is_active,
        paid_count=len(paid),
        paid_principal=paid_principal,
        remaining_balance=round(remaining, 2),
        total_interest=total_interest,
        next_due_date=next_due,
        end_date=end_date,
        progress_percentage=progress,
    )


# === Endpoints ===

@router.get("/", response_model=List[LoanResponse])
async def get_loans(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seznam úvěrů s přehledem splácení."""
    result = await db.execute(
        select(LoanModel).where(LoanModel.user_id == current_user.id).order_by(LoanModel.created_at.desc())
    )
    loans = list(result.scalars().all())
    out = []
    for loan in loans:
        payments = await _load_payments(db, loan.id)
        out.append(_build_loan_response(loan, payments))
    return out


@router.post("/", response_model=LoanResponse)
async def create_loan(
    data: LoanCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vytvořit úvěr + vygenerovat splátkový kalendář."""
    if data.principal <= 0 or data.term_months <= 0:
        raise HTTPException(status_code=400, detail="principal and term_months must be positive")

    monthly_payment = data.monthly_payment
    if monthly_payment is None or monthly_payment <= 0:
        monthly_payment = annuity_payment(data.principal, data.interest_rate, data.term_months)

    loan = LoanModel(
        user_id=current_user.id,
        name=data.name,
        principal=data.principal,
        interest_rate=data.interest_rate,
        term_months=data.term_months,
        monthly_payment=monthly_payment,
        start_date=data.start_date,
        currency=data.currency,
        match_pattern=data.match_pattern,
        note=data.note,
    )
    db.add(loan)
    await db.commit()
    await db.refresh(loan)

    await _regenerate_schedule(db, loan)
    await db.commit()

    payments = await _load_payments(db, loan.id)
    return _build_loan_response(loan, payments)


@router.get("/summary")
async def get_loans_summary(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Souhrn všech aktivních úvěrů — pro dashboard / rozpočet."""
    result = await db.execute(
        select(LoanModel).where(LoanModel.user_id == current_user.id, LoanModel.is_active == True)
    )
    loans = list(result.scalars().all())

    total_monthly = 0.0
    total_remaining = 0.0
    total_principal = 0.0
    for loan in loans:
        payments = await _load_payments(db, loan.id)
        resp = _build_loan_response(loan, payments)
        total_remaining += resp.remaining_balance
        total_principal += loan.principal
        # Only count toward the monthly burden if not fully paid off.
        if resp.remaining_balance > 0:
            total_monthly += loan.monthly_payment

    return {
        "active_loans": len(loans),
        "total_monthly_payment": round(total_monthly, 2),
        "total_remaining_balance": round(total_remaining, 2),
        "total_principal": round(total_principal, 2),
        "currency": "CZK",
    }


@router.get("/{loan_id}/schedule", response_model=List[LoanPaymentResponse])
async def get_loan_schedule(
    loan_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Splátkový kalendář (amortizace) úvěru."""
    await _get_user_loan(db, current_user.id, loan_id)
    payments = await _load_payments(db, loan_id)
    return [
        LoanPaymentResponse(
            id=p.id,
            installment_number=p.installment_number,
            due_date=p.due_date,
            amount=p.amount,
            principal_part=p.principal_part,
            interest_part=p.interest_part,
            remaining_balance=p.remaining_balance,
            is_paid=p.is_paid,
            matched_transaction_id=p.matched_transaction_id,
        )
        for p in payments
    ]


@router.put("/{loan_id}", response_model=LoanResponse)
async def update_loan(
    loan_id: int,
    data: LoanUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upravit úvěr. Změna parametrů přegeneruje kalendář (zachová zaplacené splátky)."""
    loan = await _get_user_loan(db, current_user.id, loan_id)

    # Track which installments were already paid so we can preserve that state.
    old_payments = await _load_payments(db, loan.id)
    paid_numbers = {p.installment_number for p in old_payments if p.is_paid}
    matched_by_number = {p.installment_number: p.matched_transaction_id for p in old_payments if p.is_paid}

    schedule_fields = {"principal", "interest_rate", "term_months", "monthly_payment", "start_date"}
    needs_regen = False
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None and field != "note" and field != "match_pattern":
            continue
        setattr(loan, field, value)
        if field in schedule_fields:
            needs_regen = True

    # If params changed but monthly_payment wasn't explicitly set, recompute annuity.
    if needs_regen and "monthly_payment" not in data.model_dump(exclude_unset=True):
        loan.monthly_payment = annuity_payment(loan.principal, loan.interest_rate, loan.term_months)

    if needs_regen:
        await _regenerate_schedule(db, loan)
        await db.flush()
        # Re-apply paid flags to the same installment numbers where they still exist.
        new_payments = await _load_payments(db, loan.id)
        for p in new_payments:
            if p.installment_number in paid_numbers:
                p.is_paid = True
                p.matched_transaction_id = matched_by_number.get(p.installment_number)

    await db.commit()
    await db.refresh(loan)
    payments = await _load_payments(db, loan.id)
    return _build_loan_response(loan, payments)


@router.delete("/{loan_id}")
async def delete_loan(
    loan_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat úvěr včetně splátkového kalendáře."""
    loan = await _get_user_loan(db, current_user.id, loan_id)
    await db.delete(loan)
    await db.commit()
    return {"status": "deleted", "id": loan_id}


class PaymentToggle(BaseModel):
    is_paid: bool
    matched_transaction_id: Optional[str] = None


@router.patch("/{loan_id}/payments/{payment_id}", response_model=LoanPaymentResponse)
async def toggle_loan_payment(
    loan_id: int,
    payment_id: int,
    data: PaymentToggle,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Označit splátku jako (ne)zaplacenou."""
    await _get_user_loan(db, current_user.id, loan_id)
    result = await db.execute(
        select(LoanPaymentModel).where(
            LoanPaymentModel.id == payment_id,
            LoanPaymentModel.loan_id == loan_id,
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    payment.is_paid = data.is_paid
    if not data.is_paid:
        payment.matched_transaction_id = None
    elif data.matched_transaction_id is not None:
        payment.matched_transaction_id = data.matched_transaction_id

    await db.commit()
    await db.refresh(payment)
    return LoanPaymentResponse(
        id=payment.id,
        installment_number=payment.installment_number,
        due_date=payment.due_date,
        amount=payment.amount,
        principal_part=payment.principal_part,
        interest_part=payment.interest_part,
        remaining_balance=payment.remaining_balance,
        is_paid=payment.is_paid,
        matched_transaction_id=payment.matched_transaction_id,
    )
