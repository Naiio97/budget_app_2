from fastapi import APIRouter, Query, Depends
from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from auth import get_current_user
from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel, ManualAccountModel, ContactModel, ManualInvestmentAccountModel, ManualInvestmentPositionModel, CategoryModel, UserModel
from services.trading212 import trading212_service
from services.exchange_rates import get_exchange_rate
from routers.contacts import normalize_iban
import json

router = APIRouter()


def _my_expense_amount(tx) -> float:
    """Expense amount that counts as MINE (VYLEPSENI.md 3.1). A shared expense
    with `my_share_amount` set counts only my part — the rest is owed by wife.
    Clamped to the full amount so a stale split can never inflate expenses."""
    full = abs(tx.amount)
    if tx.my_share_amount is not None:
        return min(tx.my_share_amount, full)
    return full


def _build_recent_tx(parsed, contacts_by_iban):
    result = []
    for tx, account_name, creditor_name, debtor_name, creditor_iban, debtor_iban in parsed:
        name_source = None
        if (tx.amount or 0) < 0:
            if creditor_name:
                name_source = "bank"
            elif creditor_iban and creditor_iban in contacts_by_iban:
                c = contacts_by_iban[creditor_iban]
                creditor_name = c.name
                name_source = f"contact_{c.source}"
        else:
            if debtor_name:
                name_source = "bank"
            elif debtor_iban and debtor_iban in contacts_by_iban:
                c = contacts_by_iban[debtor_iban]
                debtor_name = c.name
                name_source = f"contact_{c.source}"
        result.append({
            "id": tx.id,
            "date": tx.date,
            "description": tx.description,
            "amount": tx.amount,
            "currency": tx.currency,
            "category": tx.category,
            "account_id": tx.account_id,
            "account_type": tx.account_type or "bank",
            "account_name": account_name,
            "transaction_type": tx.transaction_type or "normal",
            "is_excluded": tx.is_excluded or False,
            "my_share_amount": tx.my_share_amount,
            "settlement_flag": tx.settlement_flag or False,
            "settlement_note": tx.settlement_note,
            "share_counterparty": tx.share_counterparty,
            "creditor_name": creditor_name,
            "debtor_name": debtor_name,
            "creditor_iban": creditor_iban,
            "debtor_iban": debtor_iban,
            "counterparty_name_source": name_source,
        })
    return result


@router.get("/")
async def get_dashboard(
    include_hidden: bool = False,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get main dashboard data from database (instant response).

    `include_hidden=true` returns hidden accounts too (each with `is_visible`) so
    the settings account manager can list and un-hide them. The summary/totals are
    only meaningful for the default (visible-only) call — the settings manager
    reads just the `accounts` list.
    """

    acc_q = select(AccountModel).where(AccountModel.user_id == current_user.id)
    man_q = select(ManualAccountModel).options(selectinload(ManualAccountModel.items)).where(ManualAccountModel.user_id == current_user.id)
    inv_q = select(ManualInvestmentAccountModel).options(selectinload(ManualInvestmentAccountModel.positions)).where(ManualInvestmentAccountModel.user_id == current_user.id)
    if not include_hidden:
        acc_q = acc_q.where(AccountModel.is_visible == True)
        man_q = man_q.where(ManualAccountModel.is_visible == True)
        inv_q = inv_q.where(ManualInvestmentAccountModel.is_visible == True)

    accounts = (await db.execute(acc_q)).scalars().all()
    manual_accounts = (await db.execute(man_q)).scalars().all()
    manual_investment_accounts = (await db.execute(inv_q)).scalars().all()

    # Calculate investment balance — re-convert if sync stored wrong rate (fallback 1.0)
    investment_balance = 0
    for acc in accounts:
        if acc.type != "investment":
            continue
        balance = acc.balance
        details = json.loads(acc.details_json) if acc.details_json else {}
        original_currency = details.get("original_currency", acc.currency)
        stored_rate = details.get("exchange_rate", 1.0)
        original_balance = details.get("original_balance")
        if (
            original_currency != "CZK"
            and original_balance is not None
            and abs(stored_rate - 1.0) < 0.001
        ):
            live_rate = await get_exchange_rate(original_currency, "CZK")
            balance = original_balance * live_rate
        investment_balance += balance

    # Calculate totals (for manual accounts, only count my_balance)
    bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    total_balance = bank_balance + investment_balance
    
    # Calculate manual account balances (only my money)
    manual_balance = 0
    for macc in manual_accounts:
        # my_balance = total - cizí obálky
        borrowed = sum(item.amount for item in macc.items if not getattr(item, 'is_mine', True))
        manual_balance += macc.balance - borrowed
    
    total_balance += manual_balance

    # Add manual investment account values to total
    manual_investment_balance = sum(
        sum(p.current_value for p in acc.positions)
        for acc in manual_investment_accounts
    )
    total_balance += manual_investment_balance
    investment_balance += manual_investment_balance
    
    # Get recent transactions from DB with account name — hidden accounts'
    # transactions stay out of the dashboard overview.
    tx_q = (
        select(TransactionModel, AccountModel.name)
        .join(AccountModel, TransactionModel.account_id == AccountModel.id)
        .where(TransactionModel.user_id == current_user.id)
    )
    if not include_hidden:
        tx_q = tx_q.where(AccountModel.is_visible == True)
    tx_result = await db.execute(
        tx_q.order_by(TransactionModel.date.desc()).limit(5)
    )
    recent_tx_rows = tx_result.all()

    # Parse raw_json for counterparty fields and bulk-lookup missing names in contacts
    recent_tx_parsed = []
    needed_ibans: set[str] = set()
    for tx, account_name in recent_tx_rows:
        raw: dict = {}
        if tx.raw_json:
            try:
                raw = json.loads(tx.raw_json) or {}
            except Exception:
                pass
        creditor_name = raw.get("creditorName")
        debtor_name = raw.get("debtorName")
        creditor_iban = normalize_iban((raw.get("creditorAccount") or {}).get("iban") or (raw.get("creditorAccount") or {}).get("bban"))
        debtor_iban = normalize_iban((raw.get("debtorAccount") or {}).get("iban") or (raw.get("debtorAccount") or {}).get("bban"))
        if not creditor_name and creditor_iban:
            needed_ibans.add(creditor_iban)
        if not debtor_name and debtor_iban:
            needed_ibans.add(debtor_iban)
        recent_tx_parsed.append((tx, account_name, creditor_name, debtor_name, creditor_iban, debtor_iban))

    contacts_by_iban: dict[str, ContactModel] = {}
    if needed_ibans:
        contact_rows = await db.execute(
            select(ContactModel).where(
                ContactModel.user_id == current_user.id,
                ContactModel.iban.in_(list(needed_ibans)),
            )
        )
        contacts_by_iban = {c.iban: c for c in contact_rows.scalars().all()}
    
    # Get transactions for the CURRENT CALENDAR MONTH (not last 30 days — UI labels these
    # as "tento měsíc" so they must match what the user sees on a calendar).
    today = datetime.now()
    month_start = today.replace(day=1).strftime("%Y-%m-%d")
    all_tx_q = select(TransactionModel).where(
        TransactionModel.user_id == current_user.id,
        TransactionModel.date >= month_start,
    )
    if not include_hidden:
        all_tx_q = all_tx_q.where(
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.is_visible == True,
                )
            )
        )
    all_tx_result = await db.execute(all_tx_q.limit(1000))
    all_tx = all_tx_result.scalars().all()
    
    # Calculate income vs expenses (excluding internal/family transfers;
    # settlement transfers from wife are not income, shared expenses count only my part)
    income = sum(tx.amount for tx in all_tx if tx.amount > 0 and tx.account_type == "bank" and not tx.is_excluded and not tx.settlement_flag)
    expenses = sum(_my_expense_amount(tx) for tx in all_tx if tx.amount < 0 and tx.account_type == "bank" and not tx.is_excluded)
    
    # Calculate categories (only true expense categories — exclude income categories
    # like Salary/Dividend even if a misclassified negative tx slips through)
    income_cat_result = await db.execute(
        select(CategoryModel.name).where(
            CategoryModel.user_id == current_user.id,
            CategoryModel.is_income == True,
        )
    )
    income_category_names = {row[0] for row in income_cat_result.all()}

    categories = {}
    for tx in all_tx:
        if tx.amount < 0 and not tx.is_excluded:
            cat = tx.category or "Other"
            if cat in income_category_names:
                continue
            if cat not in categories:
                categories[cat] = 0
            categories[cat] += _my_expense_amount(tx)
    
    # Build accounts list including manual accounts
    # For investment accounts, re-convert balance if sync stored wrong rate (fallback 1.0)
    accounts_list = []
    for acc in accounts:
        balance = acc.balance
        currency = acc.currency
        if acc.type == "investment":
            details = json.loads(acc.details_json) if acc.details_json else {}
            original_currency = details.get("original_currency", acc.currency)
            stored_rate = details.get("exchange_rate", 1.0)
            original_balance = details.get("original_balance")
            if (
                original_currency != "CZK"
                and original_balance is not None
                and abs(stored_rate - 1.0) < 0.001
            ):
                live_rate = await get_exchange_rate(original_currency, "CZK")
                balance = round(original_balance * live_rate, 2)
                currency = "CZK"
        accounts_list.append({
            "id": acc.id,
            "name": acc.name,
            "type": acc.type,
            "balance": balance,
            "currency": currency,
            "institution": acc.institution,
            "is_visible": acc.is_visible,
            # consent_expires_at se ztratil při merge fix/fe_bugs — bez něj
            # UI nemá jak varovat před vypršelým souhlasem banky
            "consent_expires_at": acc.consent_expires_at.isoformat() if acc.consent_expires_at else None,
            "last_synced": acc.last_synced.isoformat() if acc.last_synced else None,
            "last_sync_error": acc.last_sync_error,
        })

    # Add manual accounts to the list
    for macc in manual_accounts:
        borrowed = sum(item.amount for item in macc.items if not getattr(item, 'is_mine', True))
        accounts_list.append({
            "id": f"manual-{macc.id}",
            "name": macc.name,
            "type": "manual",
            "balance": macc.balance - borrowed,
            "currency": macc.currency,
            "institution": "Manuální",
            "is_visible": macc.is_visible,
        })

    # Add manual investment accounts to the list
    for macc in manual_investment_accounts:
        total = sum(p.current_value for p in macc.positions)
        accounts_list.append({
            "id": f"manual-inv-{macc.id}",
            "name": macc.name,
            "type": "manual_investment",
            "balance": total,
            "currency": macc.currency,
            "institution": "Manuální investice",
            "is_visible": macc.is_visible,
        })

    return {
        "summary": {
            "total_balance": total_balance,
            "bank_balance": bank_balance,
            "investment_balance": investment_balance,
            "manual_balance": manual_balance,
            "currency": "CZK",
            "accounts_count": len(accounts) + len(manual_accounts) + len(manual_investment_accounts)
        },
        "monthly": {
            "income": income,
            "expenses": expenses,
            "savings": income - expenses
        },
        "categories": categories,
        "recent_transactions": _build_recent_tx(recent_tx_parsed, contacts_by_iban),
        "accounts": accounts_list
    }


@router.get("/portfolio")
async def get_portfolio_summary(
    current_user: UserModel = Depends(get_current_user),
):
    """Get investment portfolio summary (live from Trading 212)"""
    try:
        portfolio = await trading212_service.get_portfolio()
        pies = await trading212_service.get_pies()
        
        positions = []
        total_value = 0
        total_profit = 0
        
        for pos in portfolio:
            value = pos.get("currentPrice", 0) * pos.get("quantity", 0)
            profit = pos.get("ppl", 0)
            total_value += value
            total_profit += profit
            
            positions.append({
                "ticker": pos.get("ticker"),
                "quantity": pos.get("quantity"),
                "average_price": pos.get("averagePrice"),
                "current_price": pos.get("currentPrice"),
                "value": value,
                "profit": profit,
                "profit_percent": (profit / (value - profit) * 100) if value != profit else 0
            })
        
        return {
            "total_value": total_value,
            "total_profit": total_profit,
            "positions": positions,
            "pies": pies
        }
    except Exception as e:
        return {"error": str(e), "positions": [], "pies": []}


@router.get("/balance-history")
async def get_balance_history(
    days: int = Query(30, ge=7, le=365),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get balance history for chart from database"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.date >= start_date.strftime("%Y-%m-%d"),
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.is_visible == True,
                )
            ),
        ).limit(1000)
    )
    transactions = result.scalars().all()

    acc_result = await db.execute(
        select(func.sum(AccountModel.balance)).where(
            AccountModel.user_id == current_user.id,
            AccountModel.type == "bank",
            AccountModel.is_visible == True,
        )
    )
    current_balance = acc_result.scalar() or 0
    
    history = []
    daily_totals = {}
    
    for tx in transactions:
        if tx.account_type != "bank":
            continue
        date = tx.date[:10]
        if date not in daily_totals:
            daily_totals[date] = 0
        daily_totals[date] += tx.amount
    
    # Generate daily points
    balance = current_balance
    for i in range(days, -1, -1):
        date = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        if date in daily_totals:
            balance -= daily_totals[date]
        history.append({"date": date, "balance": balance})
    
    history.reverse()
    return {"history": history}


@router.get("/net-worth-history")
async def get_net_worth_history(
    days: int = Query(30, ge=7, le=365),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get net worth history (bank + investments) for chart"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    acc_result = await db.execute(
        select(AccountModel).where(
            AccountModel.user_id == current_user.id,
            AccountModel.is_visible == True,
        )
    )
    accounts = acc_result.scalars().all()

    current_bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    current_investment_balance = sum(acc.balance for acc in accounts if acc.type == "investment")

    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.date >= start_date.strftime("%Y-%m-%d"),
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.is_visible == True,
                )
            ),
        ).limit(2000)
    )
    transactions = result.scalars().all()
    
    # Group transactions by date and type
    bank_daily = {}
    investment_daily = {}
    
    for tx in transactions:
        date = tx.date[:10]
        if tx.account_type == "bank":
            bank_daily[date] = bank_daily.get(date, 0) + tx.amount
        elif tx.account_type == "investment":
            investment_daily[date] = investment_daily.get(date, 0) + tx.amount
    
    # Generate daily points (working BACKWARDS from today to oldest)
    # Start with current balances and subtract transactions to get historical values
    history = []
    bank_balance = current_bank_balance
    investment_balance = current_investment_balance
    
    # First, record today's balance
    today = end_date.strftime("%Y-%m-%d")
    history.append({
        "date": today,
        "bank": round(bank_balance, 2),
        "investment": round(investment_balance, 2),
        "total": round(bank_balance + investment_balance, 2)
    })
    
    # Work backwards from today
    for i in range(1, days + 1):
        date = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        next_date = (end_date - timedelta(days=i-1)).strftime("%Y-%m-%d")
        
        # Subtract the NEXT day's transactions to get this day's ending balance
        # (because next_date transactions caused the change FROM this day TO next_date)
        if next_date in bank_daily:
            bank_balance -= bank_daily[next_date]
        if next_date in investment_daily:
            investment_balance -= investment_daily[next_date]
        
        history.append({
            "date": date,
            "bank": round(bank_balance, 2),
            "investment": round(investment_balance, 2),
            "total": round(bank_balance + investment_balance, 2)
        })
    
    # Reverse to get chronological order (oldest first, newest last)
    history.reverse()
    
    return {
        "history": history,
        "currency": "CZK"
    }


@router.get("/monthly-report")
async def get_monthly_report(
    months: int = Query(6, ge=1, le=24),
    full_amounts: bool = Query(False, description="True = bank-statement view: full amounts, settlements count as income"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get monthly report with income/expenses and category breakdown.

    Default counts only MY part of shared expenses and drops settlements from
    income; `full_amounts=true` shows raw bank amounts (matches the statement).
    """

    income_cat_result = await db.execute(
        select(CategoryModel.name).where(
            CategoryModel.user_id == current_user.id,
            CategoryModel.is_income == True,
        )
    )
    income_category_names = {row[0] for row in income_cat_result.all()}

    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.account_type == "bank",
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.is_visible == True,
                )
            ),
        )
    )
    transactions = result.scalars().all()

    # Group by month
    monthly_data = {}
    category_data = {}

    for tx in transactions:
        if not tx.date:
            continue

        # Skip excluded transactions (internal/family transfers) from totals
        if tx.is_excluded:
            continue

        month = tx.date[:7]  # YYYY-MM

        if month not in monthly_data:
            monthly_data[month] = {"income": 0, "expenses": 0}

        if tx.amount >= 0:
            # Settlement transfers are repayments, not income (unless full view)
            if full_amounts or not tx.settlement_flag:
                monthly_data[month]["income"] += tx.amount
        else:
            monthly_data[month]["expenses"] += abs(tx.amount) if full_amounts else _my_expense_amount(tx)

        # Category breakdown — only true expense categories
        if tx.amount < 0:
            cat = tx.category or "Other"
            if cat in income_category_names:
                continue
            if month not in category_data:
                category_data[month] = {}
            if cat not in category_data[month]:
                category_data[month][cat] = 0
            category_data[month][cat] += abs(tx.amount) if full_amounts else _my_expense_amount(tx)
    
    # Sort by month and limit to requested months
    sorted_months = sorted(monthly_data.keys(), reverse=True)[:months]
    sorted_months.reverse()  # Oldest first for chart
    
    # Build response
    monthly_totals = []
    for month in sorted_months:
        data = monthly_data[month]
        monthly_totals.append({
            "month": month,
            "income": round(data["income"], 2),
            "expenses": round(data["expenses"], 2),
            "balance": round(data["income"] - data["expenses"], 2)
        })
    
    # Category breakdown per month
    category_breakdown = []
    for month in sorted_months:
        if month in category_data:
            for cat, amount in category_data[month].items():
                category_breakdown.append({
                    "month": month,
                    "category": cat,
                    "amount": round(amount, 2)
                })
    
    # Categories that actually appear in the displayed window (avoid phantom legend entries)
    all_categories = set()
    for month in sorted_months:
        if month in category_data:
            all_categories.update(category_data[month].keys())
    
    return {
        "monthly_totals": monthly_totals,
        "category_breakdown": category_breakdown,
        "categories": sorted(list(all_categories)),
        "currency": "CZK"
    }
