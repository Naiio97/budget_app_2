from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timedelta
from routers.accounts import get_accounts
from routers.transactions import get_transactions, get_category_summary
from services.trading212 import trading212_service

router = APIRouter()


@router.get("/")
async def get_dashboard():
    """Get main dashboard data"""
    # Get accounts
    accounts = await get_accounts()
    
    # Calculate totals
    total_balance = sum(acc.balance for acc in accounts)
    bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    investment_balance = sum(acc.balance for acc in accounts if acc.type == "investment")
    
    # Get recent transactions
    transactions = await get_transactions(limit=10)
    
    # Get spending by category (last 30 days)
    categories = await get_category_summary()
    
    # Calculate income vs expenses (last 30 days)
    all_tx = await get_transactions(limit=500)
    income = sum(tx.amount for tx in all_tx if tx.amount > 0 and tx.account_type == "bank")
    expenses = sum(abs(tx.amount) for tx in all_tx if tx.amount < 0 and tx.account_type == "bank")
    
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
        "categories": categories.get("categories", {}),
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
    """Get investment portfolio summary"""
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
async def get_balance_history(days: int = Query(30, ge=7, le=365)):
    """Get balance history for chart (simplified - uses transactions)"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    transactions = await get_transactions(
        date_from=start_date.strftime("%Y-%m-%d"),
        date_to=end_date.strftime("%Y-%m-%d"),
        limit=1000
    )
    
    # Build daily balances (simplified simulation)
    accounts = await get_accounts()
    current_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    
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
            balance -= daily_totals[date]  # Reverse to get historical balance
        history.append({"date": date, "balance": balance})
    
    # Reverse to correct chronological order
    history.reverse()
    return {"history": history}
