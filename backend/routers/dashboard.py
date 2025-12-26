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
    result = await db.execute(select(AccountModel))
    accounts = result.scalars().all()
    
    # Calculate totals
    total_balance = sum(acc.balance for acc in accounts)
    bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    investment_balance = sum(acc.balance for acc in accounts if acc.type == "investment")
    
    # Get recent transactions from DB
    tx_result = await db.execute(
        select(TransactionModel).order_by(TransactionModel.date.desc()).limit(10)
    )
    recent_tx = tx_result.scalars().all()
    
    # Get transactions for last 30 days for calculations
    date_30_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    all_tx_result = await db.execute(
        select(TransactionModel).where(TransactionModel.date >= date_30_days_ago).limit(500)
    )
    all_tx = all_tx_result.scalars().all()
    
    # Calculate income vs expenses
    income = sum(tx.amount for tx in all_tx if tx.amount > 0 and tx.account_type == "bank")
    expenses = sum(abs(tx.amount) for tx in all_tx if tx.amount < 0 and tx.account_type == "bank")
    
    # Calculate categories
    categories = {}
    for tx in all_tx:
        if tx.amount < 0:
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
                "category": tx.category
            }
            for tx in recent_tx
        ],
        "accounts": [
            {
                "id": acc.id,
                "name": acc.name,
                "type": acc.type,
                "balance": acc.balance,
                "currency": acc.currency
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
