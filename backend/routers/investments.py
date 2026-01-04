from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import json

from database import get_db
from models import AccountModel, TransactionModel

router = APIRouter()


class PortfolioResponse(BaseModel):
    total_value: float
    currency: str
    last_synced: Optional[str]
    

class HistoryPoint(BaseModel):
    date: str
    value: float


class DividendItem(BaseModel):
    date: str
    ticker: str
    amount: float
    currency: str


@router.get("/portfolio")
async def get_portfolio(db: AsyncSession = Depends(get_db)):
    """Get investment portfolio from database"""
    # Get investment account from DB
    result = await db.execute(
        select(AccountModel).where(AccountModel.type == "investment")
    )
    account = result.scalar_one_or_none()
    
    if not account:
        return {
            "total_value": 0,
            "currency": "CZK",
            "last_synced": None,
            "transactions": []
        }
    
    # Get recent investment transactions from DB
    tx_result = await db.execute(
        select(TransactionModel)
        .where(TransactionModel.account_type == "investment")
        .order_by(TransactionModel.date.desc())
        .limit(50)
    )
    transactions = tx_result.scalars().all()
    
    return {
        "total_value": account.balance,
        "currency": account.currency,
        "last_synced": account.last_synced.isoformat() if account.last_synced else None,
        "transactions": [
            {
                "id": tx.id,
                "date": tx.date,
                "description": tx.description,
                "amount": tx.amount,
                "currency": tx.currency,
                "category": tx.category
            }
            for tx in transactions
        ]
    }


@router.get("/history")
async def get_portfolio_history(period: str = "1M", db: AsyncSession = Depends(get_db)):
    """
    Get portfolio value history for charts from database.
    Uses transaction history to calculate portfolio value over time.
    """
    # Get investment account
    result = await db.execute(
        select(AccountModel).where(AccountModel.type == "investment")
    )
    account = result.scalar_one_or_none()
    
    if not account:
        return {"history": [], "currency": "CZK"}
    
    current_value = account.balance
    currency = account.currency
    
    # Determine period
    period_days = {"1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "ALL": 365}
    days = period_days.get(period, 30)
    
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    # Get transactions in this period
    tx_result = await db.execute(
        select(TransactionModel)
        .where(TransactionModel.account_type == "investment")
        .where(TransactionModel.date >= start_date)
        .order_by(TransactionModel.date.asc())
    )
    transactions = tx_result.scalars().all()
    
    # Build history - start from current value and work backwards
    # This is a simplified approach - real app would store daily snapshots
    history = []
    
    # Calculate starting value by subtracting all transactions in period
    starting_value = current_value
    for tx in transactions:
        starting_value -= tx.amount
    
    # Now build forward from starting value
    tx_by_date = {}
    for tx in transactions:
        if tx.date not in tx_by_date:
            tx_by_date[tx.date] = 0
        tx_by_date[tx.date] += tx.amount
    
    running_value = starting_value
    for i in range(days):
        date = (datetime.utcnow() - timedelta(days=days-i-1)).strftime("%Y-%m-%d")
        if date in tx_by_date:
            running_value += tx_by_date[date]
        history.append({"date": date, "value": round(running_value, 2)})
    
    return {"history": history, "currency": currency}


@router.get("/dividends")
async def get_dividends(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Get dividend transactions from database"""
    tx_result = await db.execute(
        select(TransactionModel)
        .where(TransactionModel.category == "Dividend")
        .order_by(TransactionModel.date.desc())
        .limit(limit)
    )
    transactions = tx_result.scalars().all()
    
    dividends = []
    for tx in transactions:
        # Extract ticker from description if possible
        ticker = ""
        if ":" in tx.description:
            parts = tx.description.split(":")
            if len(parts) > 1:
                ticker = parts[1].strip().split()[0] if parts[1].strip() else ""
        
        dividends.append({
            "date": tx.date,
            "ticker": ticker,
            "amount": tx.amount,
            "currency": tx.currency
        })
    
    return {"dividends": dividends}


@router.get("/summary")
async def get_investment_summary(db: AsyncSession = Depends(get_db)):
    """Get investment account summary from database"""
    result = await db.execute(
        select(AccountModel).where(AccountModel.type == "investment")
    )
    account = result.scalar_one_or_none()
    
    if not account:
        return {
            "account": None,
            "recent_transactions": [],
            "stats": {"total_dividends": 0, "transaction_count": 0}
        }
    
    # Get recent investment transactions
    tx_result = await db.execute(
        select(TransactionModel)
        .where(TransactionModel.account_type == "investment")
        .order_by(TransactionModel.date.desc())
        .limit(20)
    )
    transactions = tx_result.scalars().all()
    
    # Calculate stats
    div_result = await db.execute(
        select(func.sum(TransactionModel.amount))
        .where(TransactionModel.category == "Dividend")
    )
    total_dividends = div_result.scalar() or 0
    
    count_result = await db.execute(
        select(func.count(TransactionModel.id))
        .where(TransactionModel.account_type == "investment")
    )
    tx_count = count_result.scalar() or 0
    
    return {
        "account": {
            "id": account.id,
            "name": account.name,
            "balance": account.balance,
            "currency": account.currency,
            "last_synced": account.last_synced.isoformat() if account.last_synced else None
        },
        "recent_transactions": [
            {
                "id": tx.id,
                "date": tx.date,
                "description": tx.description,
                "amount": tx.amount,
                "currency": tx.currency,
                "category": tx.category
            }
            for tx in transactions
        ],
        "stats": {
            "total_dividends": total_dividends,
            "transaction_count": tx_count
        }
    }
