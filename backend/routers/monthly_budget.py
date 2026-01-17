"""
Monthly Budget Router - Měsíční rozpočet
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import (
    MonthlyBudgetModel, RecurringExpenseModel, MonthlyExpenseModel,
    ManualAccountModel, ManualAccountItemModel, TransactionModel
)

router = APIRouter()


# === Pydantic Models ===

class MonthlyBudgetCreate(BaseModel):
    year_month: str  # "2025-01"
    salary: float = 0.0
    other_income: float = 0.0
    meal_vouchers: float = 0.0
    investment_amount: float = 0.0
    surplus_to_savings: float = 0.0


class MonthlyBudgetUpdate(BaseModel):
    salary: Optional[float] = None
    other_income: Optional[float] = None
    meal_vouchers: Optional[float] = None
    investment_amount: Optional[float] = None
    surplus_to_savings: Optional[float] = None
    is_closed: Optional[bool] = None


class MonthlyExpenseResponse(BaseModel):
    id: int
    name: str
    amount: float
    my_percentage: int = 100
    my_amount: float = 0  # Calculated: amount * my_percentage / 100
    is_paid: bool
    is_auto_paid: bool
    matched_transaction_id: Optional[str] = None
    recurring_expense_id: Optional[int] = None


class MonthlyBudgetResponse(BaseModel):
    id: int
    year_month: str
    salary: float
    other_income: float
    meal_vouchers: float
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
    my_percentage: int = 100
    is_auto_paid: bool = False
    match_pattern: Optional[str] = None
    category: Optional[str] = None


class RecurringExpenseUpdate(BaseModel):
    name: Optional[str] = None
    default_amount: Optional[float] = None
    my_percentage: Optional[int] = None
    is_auto_paid: Optional[bool] = None
    match_pattern: Optional[str] = None
    category: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None


class RecurringExpenseResponse(BaseModel):
    id: int
    name: str
    default_amount: float
    my_percentage: int = 100
    is_auto_paid: bool
    match_pattern: Optional[str]
    category: Optional[str]
    order_index: int
    is_active: bool


class MonthlyExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    my_percentage: Optional[int] = None
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
    available_balance: float  # balance - items_total


# === Monthly Budget Endpoints ===

@router.get("/monthly-budget/{year_month}", response_model=MonthlyBudgetResponse)
async def get_monthly_budget(year_month: str, db: AsyncSession = Depends(get_db)):
    """Získat rozpočet pro měsíc (vytvoří nový pokud neexistuje)"""
    result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
    )
    budget = result.scalar_one_or_none()
    
    if not budget:
        # Vytvoř nový rozpočet pro tento měsíc
        budget = MonthlyBudgetModel(year_month=year_month)
        db.add(budget)
        await db.commit()
        await db.refresh(budget)
        
        # Zkopíruj pravidelné výdaje jako instance pro tento měsíc
        recurring_result = await db.execute(
            select(RecurringExpenseModel).where(RecurringExpenseModel.is_active == True).order_by(RecurringExpenseModel.order_index)
        )
        recurring_expenses = recurring_result.scalars().all()
        
        for rec in recurring_expenses:
            monthly_exp = MonthlyExpenseModel(
                budget_id=budget.id,
                recurring_expense_id=rec.id,
                name=rec.name,
                amount=rec.default_amount,
                my_percentage=rec.my_percentage or 100,
                is_auto_paid=rec.is_auto_paid,
                is_paid=False
            )
            db.add(monthly_exp)
        
        await db.commit()
        await db.refresh(budget)
    
    # Načti výdaje
    expenses_result = await db.execute(
        select(MonthlyExpenseModel).where(MonthlyExpenseModel.budget_id == budget.id)
    )
    expenses = expenses_result.scalars().all()
    
    total_income = budget.salary + budget.other_income + budget.meal_vouchers
    # Calculate total using my_amount (amount * my_percentage / 100)
    total_expenses = sum(e.amount * (e.my_percentage or 100) / 100 for e in expenses)
    
    return MonthlyBudgetResponse(
        id=budget.id,
        year_month=budget.year_month,
        salary=budget.salary,
        other_income=budget.other_income,
        meal_vouchers=budget.meal_vouchers,
        investment_amount=budget.investment_amount,
        surplus_to_savings=budget.surplus_to_savings,
        is_closed=budget.is_closed,
        total_income=total_income,
        total_expenses=total_expenses,
        remaining=total_income - total_expenses - budget.investment_amount,
        expenses=[MonthlyExpenseResponse(
            id=e.id,
            name=e.name,
            amount=e.amount,
            my_percentage=e.my_percentage or 100,
            my_amount=e.amount * (e.my_percentage or 100) / 100,
            is_paid=e.is_paid,
            is_auto_paid=e.is_auto_paid,
            matched_transaction_id=e.matched_transaction_id,
            recurring_expense_id=e.recurring_expense_id
        ) for e in expenses]
    )


@router.put("/monthly-budget/{year_month}")
async def update_monthly_budget(year_month: str, data: MonthlyBudgetUpdate, db: AsyncSession = Depends(get_db)):
    """Aktualizovat měsíční rozpočet"""
    result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
    )
    budget = result.scalar_one_or_none()
    
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    if data.salary is not None:
        budget.salary = data.salary
    if data.other_income is not None:
        budget.other_income = data.other_income
    if data.meal_vouchers is not None:
        budget.meal_vouchers = data.meal_vouchers
    if data.investment_amount is not None:
        budget.investment_amount = data.investment_amount
    if data.surplus_to_savings is not None:
        budget.surplus_to_savings = data.surplus_to_savings
    if data.is_closed is not None:
        budget.is_closed = data.is_closed
    
    await db.commit()
    return {"status": "updated"}


@router.delete("/monthly-budget/{year_month}")
async def delete_monthly_budget(year_month: str, db: AsyncSession = Depends(get_db)):
    """Smazat měsíční rozpočet včetně všech výdajů"""
    result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
    )
    budget = result.scalar_one_or_none()
    
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    # Delete all monthly expenses for this budget
    await db.execute(
        MonthlyExpenseModel.__table__.delete().where(MonthlyExpenseModel.budget_id == budget.id)
    )
    
    # Delete the budget itself
    await db.delete(budget)
    await db.commit()
    
    return {"status": "deleted", "year_month": year_month}


@router.post("/monthly-budget/{year_month}/copy-previous")
async def copy_from_previous_month(year_month: str, db: AsyncSession = Depends(get_db)):
    """Zkopírovat hodnoty z předchozího měsíce"""
    # Parse year_month to get previous month
    year, month = map(int, year_month.split("-"))
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1
    prev_year_month = f"{prev_year:04d}-{prev_month:02d}"
    
    # Get previous budget
    prev_result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == prev_year_month)
    )
    prev_budget = prev_result.scalar_one_or_none()
    
    if not prev_budget:
        raise HTTPException(status_code=404, detail="Previous month budget not found")
    
    # Get or create current budget
    curr_result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
    )
    curr_budget = curr_result.scalar_one_or_none()
    
    if not curr_budget:
        curr_budget = MonthlyBudgetModel(year_month=year_month)
        db.add(curr_budget)
    
    # Copy values
    curr_budget.salary = prev_budget.salary
    curr_budget.other_income = prev_budget.other_income
    curr_budget.meal_vouchers = prev_budget.meal_vouchers
    
    await db.commit()
    return {"status": "copied", "from": prev_year_month}


@router.post("/monthly-budget/{year_month}/match-transactions")
async def match_transactions(year_month: str, db: AsyncSession = Depends(get_db)):
    """Automaticky spárovat výdaje s transakcemi"""
    # Get budget
    result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
    )
    budget = result.scalar_one_or_none()
    
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    # Get all expenses for this month
    expenses_result = await db.execute(
        select(MonthlyExpenseModel).where(MonthlyExpenseModel.budget_id == budget.id)
    )
    expenses = expenses_result.scalars().all()
    
    # Get all recurring expenses with patterns (for matching by name)
    recurring_result = await db.execute(
        select(RecurringExpenseModel).where(RecurringExpenseModel.match_pattern != None)
    )
    recurring_expenses = recurring_result.scalars().all()
    
    # Build pattern lookup by expense name
    pattern_by_name = {}
    for rec in recurring_expenses:
        pattern_by_name[rec.name.lower()] = rec.match_pattern.lower()
        if rec.id:
            pattern_by_name[f"id_{rec.id}"] = rec.match_pattern.lower()
    
    # Get transactions for this month
    start_date = f"{year_month}-01"
    if year_month.endswith("-12"):
        year = int(year_month[:4]) + 1
        end_date = f"{year:04d}-01-01"
    else:
        year, month = map(int, year_month.split("-"))
        end_date = f"{year:04d}-{month+1:02d}-01"
    
    tx_result = await db.execute(
        select(TransactionModel)
        .where(TransactionModel.date >= start_date)
        .where(TransactionModel.date < end_date)
        .where(TransactionModel.amount < 0)  # Only expenses
    )
    transactions = tx_result.scalars().all()
    
    # Build category lookup from recurring expenses
    category_by_name = {}
    for rec in recurring_expenses:
        if rec.category:
            category_by_name[rec.name.lower()] = rec.category
    
    # Track used transactions to avoid double-matching
    used_tx_ids = set()
    
    matched_count = 0
    matched_by_amount = 0
    matched_by_category = 0
    
    for expense in expenses:
        if expense.is_paid:
            continue
        
        matched = False
        
        # === Strategy 1: Pattern matching ===
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
        
        # === Strategy 2: Exact amount match (within 5% tolerance) ===
        expense_amount = abs(expense.amount)
        tolerance = expense_amount * 0.05  # 5% tolerance
        
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
        
        # === Strategy 3: Category + approximate amount (within 20%) ===
        expense_category = category_by_name.get(expense.name.lower())
        if expense_category:
            tolerance_wide = expense_amount * 0.20  # 20% tolerance
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
async def sync_income_from_transactions(year_month: str, db: AsyncSession = Depends(get_db)):
    """Automaticky načíst výplatu z transakcí označených jako Salary"""
    # Get or create budget
    result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
    )
    budget = result.scalar_one_or_none()
    
    if not budget:
        budget = MonthlyBudgetModel(year_month=year_month)
        db.add(budget)
        await db.commit()
        await db.refresh(budget)
    
    # Get date ranges
    year, month = map(int, year_month.split("-"))
    start_date = f"{year_month}-01"
    
    # End of current month
    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1
    
    # For salary, also check first 15 days of NEXT month (salary for Dec comes in Jan)
    salary_extended_end = f"{next_year:04d}-{next_month:02d}-16"
    
    # Find salary transactions - in current month OR first 15 days of next month
    salary_result = await db.execute(
        select(func.sum(TransactionModel.amount))
        .where(TransactionModel.date >= start_date)
        .where(TransactionModel.date < salary_extended_end)
        .where(TransactionModel.category == "Salary")
        .where(TransactionModel.amount > 0)  # Only positive (income)
    )
    salary_total = salary_result.scalar() or 0
    
    # Update budget - only salary, other_income stays manual
    old_salary = budget.salary
    budget.salary = salary_total
    
    await db.commit()
    
    return {
        "status": "synced",
        "salary": salary_total,
        "note": f"Výplata nalezena v období {start_date} až {salary_extended_end}",
        "change": {"from": old_salary, "to": salary_total}
    }


# === Recurring Expenses Endpoints ===

@router.get("/recurring-expenses", response_model=List[RecurringExpenseResponse])
async def get_recurring_expenses(db: AsyncSession = Depends(get_db)):
    """Seznam pravidelných výdajů"""
    result = await db.execute(
        select(RecurringExpenseModel).order_by(RecurringExpenseModel.order_index)
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
        is_active=e.is_active
    ) for e in expenses]


@router.post("/recurring-expenses", response_model=RecurringExpenseResponse)
async def create_recurring_expense(data: RecurringExpenseCreate, db: AsyncSession = Depends(get_db)):
    """Vytvořit nový pravidelný výdaj"""
    # Get max order_index
    result = await db.execute(select(func.max(RecurringExpenseModel.order_index)))
    max_index = result.scalar() or 0
    
    expense = RecurringExpenseModel(
        name=data.name,
        default_amount=data.default_amount,
        my_percentage=data.my_percentage,
        is_auto_paid=data.is_auto_paid,
        match_pattern=data.match_pattern,
        category=data.category,
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
        is_active=expense.is_active
    )


@router.put("/recurring-expenses/{expense_id}")
async def update_recurring_expense(expense_id: int, data: RecurringExpenseUpdate, db: AsyncSession = Depends(get_db)):
    """Upravit pravidelný výdaj"""
    result = await db.execute(
        select(RecurringExpenseModel).where(RecurringExpenseModel.id == expense_id)
    )
    expense = result.scalar_one_or_none()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
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
    
    await db.commit()
    return {"status": "updated"}


@router.delete("/recurring-expenses/{expense_id}")
async def delete_recurring_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    """Smazat pravidelný výdaj"""
    result = await db.execute(
        select(RecurringExpenseModel).where(RecurringExpenseModel.id == expense_id)
    )
    expense = result.scalar_one_or_none()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    await db.delete(expense)
    await db.commit()
    return {"status": "deleted"}


# === Monthly Expense Endpoints ===

@router.put("/monthly-expenses/{expense_id}")
async def update_monthly_expense(expense_id: int, data: MonthlyExpenseUpdate, db: AsyncSession = Depends(get_db)):
    """Upravit výdaj v měsíci"""
    result = await db.execute(
        select(MonthlyExpenseModel).where(MonthlyExpenseModel.id == expense_id)
    )
    expense = result.scalar_one_or_none()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if data.amount is not None:
        expense.amount = data.amount
    if data.my_percentage is not None:
        expense.my_percentage = data.my_percentage
    if data.is_paid is not None:
        expense.is_paid = data.is_paid
    if data.name is not None:
        expense.name = data.name
    
    await db.commit()
    return {"status": "updated"}


@router.post("/monthly-budget/{year_month}/expenses")
async def add_monthly_expense(year_month: str, data: RecurringExpenseCreate, db: AsyncSession = Depends(get_db)):
    """Přidat jednorázový výdaj do měsíce"""
    result = await db.execute(
        select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
    )
    budget = result.scalar_one_or_none()
    
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
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
async def delete_monthly_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    """Smazat výdaj z měsíce"""
    result = await db.execute(
        select(MonthlyExpenseModel).where(MonthlyExpenseModel.id == expense_id)
    )
    expense = result.scalar_one_or_none()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    await db.delete(expense)
    await db.commit()
    return {"status": "deleted"}


# === Manual Account Endpoints ===

@router.get("/manual-accounts", response_model=List[ManualAccountResponse])
async def get_manual_accounts(db: AsyncSession = Depends(get_db)):
    """Seznam manuálních účtů"""
    result = await db.execute(select(ManualAccountModel))
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


@router.post("/manual-accounts", response_model=ManualAccountResponse)
async def create_manual_account(data: ManualAccountCreate, db: AsyncSession = Depends(get_db)):
    """Vytvořit manuální účet"""
    account = ManualAccountModel(
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


@router.put("/manual-accounts/{account_id}")
async def update_manual_account(account_id: int, data: ManualAccountUpdate, db: AsyncSession = Depends(get_db)):
    """Aktualizovat manuální účet"""
    result = await db.execute(
        select(ManualAccountModel).where(ManualAccountModel.id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if data.name is not None:
        account.name = data.name
    if data.balance is not None:
        account.balance = data.balance
    
    await db.commit()
    return {"status": "updated"}


@router.delete("/manual-accounts/{account_id}")
async def delete_manual_account(account_id: int, db: AsyncSession = Depends(get_db)):
    """Smazat manuální účet"""
    result = await db.execute(
        select(ManualAccountModel).where(ManualAccountModel.id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await db.delete(account)
    await db.commit()
    return {"status": "deleted"}


@router.post("/manual-accounts/{account_id}/items")
async def add_manual_account_item(account_id: int, data: ManualAccountItemCreate, db: AsyncSession = Depends(get_db)):
    """Přidat položku na manuální účet"""
    result = await db.execute(
        select(ManualAccountModel).where(ManualAccountModel.id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
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


@router.put("/manual-accounts/{account_id}/items/{item_id}")
async def update_manual_account_item(account_id: int, item_id: int, data: ManualAccountItemCreate, db: AsyncSession = Depends(get_db)):
    """Upravit položku na manuálním účtu"""
    result = await db.execute(
        select(ManualAccountItemModel).where(
            ManualAccountItemModel.id == item_id,
            ManualAccountItemModel.account_id == account_id
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    item.name = data.name
    item.amount = data.amount
    item.note = data.note
    
    await db.commit()
    return {"status": "updated"}


@router.delete("/manual-accounts/{account_id}/items/{item_id}")
async def delete_manual_account_item(account_id: int, item_id: int, db: AsyncSession = Depends(get_db)):
    """Smazat položku z manuálního účtu"""
    result = await db.execute(
        select(ManualAccountItemModel).where(
            ManualAccountItemModel.id == item_id,
            ManualAccountItemModel.account_id == account_id
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    await db.delete(item)
    await db.commit()
    return {"status": "deleted"}


# === Annual Overview ===

@router.get("/annual-overview/{year}")
async def get_annual_overview(year: int, db: AsyncSession = Depends(get_db)):
    """Roční přehled"""
    months_data = []
    total_income = 0
    total_expenses = 0
    total_investments = 0
    total_savings = 0
    
    for month in range(1, 13):
        year_month = f"{year:04d}-{month:02d}"
        
        result = await db.execute(
            select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
        )
        budget = result.scalar_one_or_none()
        
        if budget:
            expenses_result = await db.execute(
                select(func.sum(MonthlyExpenseModel.amount))
                .where(MonthlyExpenseModel.budget_id == budget.id)
            )
            month_expenses = expenses_result.scalar() or 0
            
            month_income = budget.salary + budget.other_income + budget.meal_vouchers
            
            months_data.append({
                "month": month,
                "year_month": year_month,
                "income": month_income,
                "expenses": month_expenses,
                "investments": budget.investment_amount,
                "savings": budget.surplus_to_savings,
                "remaining": month_income - month_expenses - budget.investment_amount
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
    
    # Get expense breakdown by category
    expense_breakdown = {}
    for month in range(1, 13):
        year_month = f"{year:04d}-{month:02d}"
        result = await db.execute(
            select(MonthlyBudgetModel).where(MonthlyBudgetModel.year_month == year_month)
        )
        budget = result.scalar_one_or_none()
        
        if budget:
            expenses_result = await db.execute(
                select(MonthlyExpenseModel).where(MonthlyExpenseModel.budget_id == budget.id)
            )
            expenses = expenses_result.scalars().all()
            
            for exp in expenses:
                if exp.name not in expense_breakdown:
                    expense_breakdown[exp.name] = 0
                expense_breakdown[exp.name] += exp.amount
    
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
        "expense_breakdown": expense_breakdown,
        "averages": {
            "income": total_income / 12,
            "expenses": total_expenses / 12,
            "investments": total_investments / 12
        }
    }
