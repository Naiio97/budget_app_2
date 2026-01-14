from fastapi import APIRouter, Query, Depends
from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel
from services.trading212 import trading212_service

router = APIRouter()


@router.get("/")
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    """Get main dashboard data from database (instant response)"""
    
    # Get accounts from DB
    result = await db.execute(select(AccountModel).where(AccountModel.is_visible == True))
    accounts = result.scalars().all()
    
    # Calculate totals
    total_balance = sum(acc.balance for acc in accounts)
    bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    investment_balance = sum(acc.balance for acc in accounts if acc.type == "investment")
    
    # Get recent transactions from DB
    # Get recent transactions from DB with account name
    tx_result = await db.execute(
        select(TransactionModel, AccountModel.name)
        .join(AccountModel, TransactionModel.account_id == AccountModel.id)
        .order_by(TransactionModel.date.desc())
        .limit(5)
    )
    recent_tx_rows = tx_result.all()
    
    # Get transactions for last 30 days for calculations
    date_30_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    all_tx_result = await db.execute(
        select(TransactionModel).where(TransactionModel.date >= date_30_days_ago).limit(500)
    )
    all_tx = all_tx_result.scalars().all()
    
    # Calculate income vs expenses (excluding internal/family transfers)
    income = sum(tx.amount for tx in all_tx if tx.amount > 0 and tx.account_type == "bank" and not tx.is_excluded)
    expenses = sum(abs(tx.amount) for tx in all_tx if tx.amount < 0 and tx.account_type == "bank" and not tx.is_excluded)
    
    # Calculate categories (excluding internal/family transfers)
    categories = {}
    for tx in all_tx:
        if tx.amount < 0 and not tx.is_excluded:
            cat = tx.category or "Other"
            if cat not in categories:
                categories[cat] = 0
            categories[cat] += abs(tx.amount)
    
    return {
        "summary": {
            "total_balance": total_balance,
            "bank_balance": bank_balance,
            "investment_balance": investment_balance,
            "currency": "CZK",
            "accounts_count": len(accounts)
        },
        "monthly": {
            "income": income,
            "expenses": expenses,
            "savings": income - expenses
        },
        "categories": categories,
        "recent_transactions": [
            {
                "id": tx.id,
                "date": tx.date,
                "description": tx.description,
                "amount": tx.amount,
                "currency": tx.currency,
                "category": tx.category,
                "account_name": account_name
            }
            for tx, account_name in recent_tx_rows
        ],
        "accounts": [
            {
                "id": acc.id,
                "name": acc.name,
                "type": acc.type,
                "balance": acc.balance,
                "currency": acc.currency,
                "institution": acc.institution
            }
            for acc in accounts
        ]
    }


@router.get("/portfolio")
async def get_portfolio_summary():
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
    db: AsyncSession = Depends(get_db)
):
    """Get balance history for chart from database"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    # Get transactions from DB
    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.date >= start_date.strftime("%Y-%m-%d")
        ).limit(1000)
    )
    transactions = result.scalars().all()
    
    # Get current balance
    acc_result = await db.execute(
        select(func.sum(AccountModel.balance)).where(AccountModel.type == "bank")
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
    db: AsyncSession = Depends(get_db)
):
    """Get net worth history (bank + investments) for chart"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    # Get all accounts with current balances
    acc_result = await db.execute(
        select(AccountModel).where(AccountModel.is_visible == True)
    )
    accounts = acc_result.scalars().all()
    
    current_bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    current_investment_balance = sum(acc.balance for acc in accounts if acc.type == "investment")
    
    # Get transactions from DB
    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.date >= start_date.strftime("%Y-%m-%d")
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
    db: AsyncSession = Depends(get_db)
):
    """Get monthly report with income/expenses and category breakdown"""
    
    # Get transactions grouped by month
    result = await db.execute(
        select(TransactionModel).where(TransactionModel.account_type == "bank")
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
            monthly_data[month]["income"] += tx.amount
        else:
            monthly_data[month]["expenses"] += abs(tx.amount)
        
        # Category breakdown
        cat = tx.category or "Other"
        if month not in category_data:
            category_data[month] = {}
        if cat not in category_data[month]:
            category_data[month][cat] = 0
        if tx.amount < 0:  # Only expenses for category breakdown
            category_data[month][cat] += abs(tx.amount)
    
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
    
    # Get all unique categories for chart
    all_categories = set()
    for month_cats in category_data.values():
        all_categories.update(month_cats.keys())
    
    return {
        "monthly_totals": monthly_totals,
        "category_breakdown": category_breakdown,
        "categories": sorted(list(all_categories)),
        "currency": "CZK"
    }
