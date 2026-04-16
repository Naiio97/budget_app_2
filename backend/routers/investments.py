from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import json

from database import get_db
from models import AccountModel, TransactionModel, PortfolioSnapshotModel
from services.exchange_rates import get_exchange_rate

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
    
    # Detect failed exchange rate conversion during sync (rate fell back to 1.0)
    # In that case re-convert from original EUR value using current rate
    total_value = account.balance
    details = json.loads(account.details_json) if account.details_json else {}
    original_currency = details.get("original_currency", account.currency)
    stored_rate = details.get("exchange_rate", 1.0)
    original_balance = details.get("original_balance")

    if (
        original_currency != "CZK"
        and original_balance is not None
        and abs(stored_rate - 1.0) < 0.001  # rate was effectively 1.0 = conversion failed
    ):
        live_rate = await get_exchange_rate(original_currency, "CZK")
        total_value = original_balance * live_rate

    return {
        "total_value": round(total_value, 2),
        "currency": "CZK",
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
    """Get portfolio value history from daily snapshots saved at each sync"""
    period_days = {"1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "ALL": 3650}
    days = period_days.get(period, 30)
    start_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

    result = await db.execute(
        select(PortfolioSnapshotModel)
        .where(PortfolioSnapshotModel.snapshot_date >= start_date)
        .order_by(PortfolioSnapshotModel.snapshot_date.asc())
    )
    snapshots = result.scalars().all()

    history = [{"date": s.snapshot_date, "value": s.total_value_czk} for s in snapshots]
    return {"history": history, "currency": "CZK"}


@router.get("/portfolio-detail")
async def get_portfolio_detail(db: AsyncSession = Depends(get_db)):
    """Get investment portfolio with P&L data (invested, result, free cash)"""
    result = await db.execute(
        select(AccountModel).where(AccountModel.type == "investment")
    )
    account = result.scalar_one_or_none()

    if not account:
        return {
            "total_value": 0,
            "invested": 0,
            "result": 0,
            "cash_free": 0,
            "currency": "CZK",
            "last_synced": None,
        }

    details = json.loads(account.details_json) if account.details_json else {}
    cash = details.get("cash", {})
    exchange_rate = details.get("exchange_rate", 1.0)

    invested_czk = float(cash.get("invested", 0) or 0) * exchange_rate
    # T212 API uses "ppl" for unrealized P&L; fall back to calculating from totals
    result_czk = float(cash.get("ppl", 0) or cash.get("result", 0) or 0) * exchange_rate
    cash_free_czk = float(cash.get("free", 0) or 0) * exchange_rate

    # If API didn't return P&L but we have invested amount, calculate from known values
    if result_czk == 0 and invested_czk > 0 and account.balance > 0:
        result_czk = account.balance - invested_czk - cash_free_czk

    return {
        "total_value": round(account.balance, 2),
        "invested": round(invested_czk, 2),
        "result": round(result_czk, 2),
        "cash_free": round(cash_free_czk, 2),
        "currency": "CZK",
        "last_synced": account.last_synced.isoformat() if account.last_synced else None,
    }


@router.get("/positions")
async def get_positions(db: AsyncSession = Depends(get_db)):
    """Get individual portfolio positions from last sync"""
    result = await db.execute(
        select(AccountModel).where(AccountModel.type == "investment")
    )
    account = result.scalar_one_or_none()

    if not account or not account.details_json:
        return {"positions": [], "currency": "CZK"}

    details = json.loads(account.details_json)
    exchange_rate = details.get("exchange_rate", 1.0)
    raw_positions = details.get("positions", [])

    # positions may be stored as int (old format) — handle gracefully
    if not isinstance(raw_positions, list):
        return {"positions": [], "currency": "CZK"}

    positions = []
    for p in raw_positions:
        qty = float(p.get("quantity", 0) or 0)
        avg_price = float(p.get("averagePrice", 0) or 0)
        current_price = float(p.get("currentPrice", 0) or 0)
        ppl_eur = float(p.get("ppl", 0) or 0)
        current_value_eur = qty * current_price
        invested_eur = qty * avg_price

        positions.append({
            "ticker": p.get("ticker", ""),
            "quantity": qty,
            "average_price_eur": round(avg_price, 4),
            "current_price_eur": round(current_price, 4),
            "value_czk": round(current_value_eur * exchange_rate, 2),
            "invested_czk": round(invested_eur * exchange_rate, 2),
            "ppl_czk": round(ppl_eur * exchange_rate, 2),
            "ppl_pct": round((ppl_eur / invested_eur * 100) if invested_eur else 0, 2),
        })

    # Sort by value descending
    positions.sort(key=lambda x: x["value_czk"], reverse=True)

    return {"positions": positions, "currency": "CZK"}


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


@router.get("/pies")
async def get_pies(db: AsyncSession = Depends(get_db)):
    """Get Trading 212 pies from last sync"""
    result = await db.execute(
        select(AccountModel).where(AccountModel.type == "investment")
    )
    account = result.scalar_one_or_none()

    if not account or not account.details_json:
        return {"pies": [], "currency": "CZK"}

    details = json.loads(account.details_json)
    exchange_rate = details.get("exchange_rate", 1.0)
    raw_pies = details.get("pies", [])

    if not isinstance(raw_pies, list):
        return {"pies": [], "currency": "CZK"}

    pies = []
    for p in raw_pies:
        pies.append({
            "id": p.get("id"),
            "name": p.get("name", ""),
            "icon": p.get("icon", ""),
            "goal": p.get("goal"),
            "invested_czk": round(p.get("invested_eur", 0) * exchange_rate, 2),
            "value_czk": round(p.get("value_eur", 0) * exchange_rate, 2),
            "result_czk": round(p.get("result_eur", 0) * exchange_rate, 2),
            "result_pct": round(p.get("result_pct", 0), 2),
            "instruments": [
                {
                    "ticker": inst.get("ticker", "").replace("_US_EQ", "").replace("_EQ", ""),
                    "current_share": round(inst.get("current_share", 0) * 100, 1),
                    "value_czk": round(inst.get("value_eur", 0) * exchange_rate, 2),
                    "result_czk": round(inst.get("result_eur", 0) * exchange_rate, 2),
                }
                for inst in p.get("instruments", [])
            ],
        })

    # Sort by value descending
    pies.sort(key=lambda x: x["value_czk"], reverse=True)
    return {"pies": pies, "currency": "CZK"}


@router.get("/debug/pies-raw")
async def debug_pies_raw():
    """Debug: return raw T212 API response for pies (list + first pie detail)"""
    from services.trading212 import trading212_service
    pies_list = await trading212_service.get_pies()
    detail = None
    if isinstance(pies_list, list) and pies_list:
        first_id = pies_list[0].get("id")
        if first_id:
            detail = await trading212_service.get_pie_detail(first_id)
    return {"pies_list": pies_list, "first_pie_detail": detail}


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
