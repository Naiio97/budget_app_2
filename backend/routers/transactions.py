from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from services.gocardless import gocardless_service
from services.trading212 import trading212_service
from routers.accounts import connected_accounts

router = APIRouter()


class Transaction(BaseModel):
    id: str
    date: str
    description: str
    amount: float
    currency: str
    category: Optional[str] = None
    account_id: str
    account_type: str  # "bank" or "investment"


@router.get("/", response_model=List[Transaction])
async def get_transactions(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    account_id: Optional[str] = None,
    limit: int = 100
):
    """Get all transactions from connected accounts"""
    transactions = []
    
    # Default date range: last 30 days
    if not date_from:
        date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now().strftime("%Y-%m-%d")
    
    # Bank transactions
    for acc_id, acc in connected_accounts.items():
        if account_id and acc_id != account_id:
            continue
        if acc["type"] != "bank":
            continue
        
        try:
            tx_data = await gocardless_service.get_account_transactions(
                acc_id, date_from, date_to
            )
            booked = tx_data.get("transactions", {}).get("booked", [])
            
            for tx in booked[:limit]:
                transactions.append(Transaction(
                    id=tx.get("transactionId", tx.get("internalTransactionId", "")),
                    date=tx.get("bookingDate", tx.get("valueDate", "")),
                    description=tx.get("remittanceInformationUnstructured", 
                                      tx.get("creditorName", tx.get("debtorName", "Transaction"))),
                    amount=float(tx.get("transactionAmount", {}).get("amount", 0)),
                    currency=tx.get("transactionAmount", {}).get("currency", "CZK"),
                    category=categorize_transaction(tx),
                    account_id=acc_id,
                    account_type="bank"
                ))
        except:
            pass
    
    # Investment transactions (Trading 212 orders)
    if not account_id or account_id == "trading212":
        try:
            orders = await trading212_service.get_orders(limit=limit)
            for order in orders.get("items", []):
                transactions.append(Transaction(
                    id=order.get("id", ""),
                    date=order.get("dateExecuted", order.get("dateCreated", "")),
                    description=f"{order.get('type', 'ORDER')} {order.get('ticker', '')}",
                    amount=-float(order.get("fillPrice", 0)) * float(order.get("filledQuantity", 0)),
                    currency="EUR",
                    category="Investment",
                    account_id="trading212",
                    account_type="investment"
                ))
            
            # Dividends
            dividends = await trading212_service.get_dividends(limit=limit)
            for div in dividends.get("items", []):
                transactions.append(Transaction(
                    id=div.get("reference", ""),
                    date=div.get("paidOn", ""),
                    description=f"Dividend: {div.get('ticker', '')}",
                    amount=float(div.get("amount", 0)),
                    currency=div.get("currency", "EUR"),
                    category="Dividend",
                    account_id="trading212",
                    account_type="investment"
                ))
        except:
            pass
    
    # Sort by date
    transactions.sort(key=lambda x: x.date, reverse=True)
    return transactions[:limit]


def categorize_transaction(tx: dict) -> str:
    """Simple category detection based on description"""
    desc = (tx.get("remittanceInformationUnstructured", "") or 
            tx.get("creditorName", "") or 
            tx.get("debtorName", "")).lower()
    
    categories = {
        "food": ["lidl", "albert", "tesco", "billa", "kaufland", "restaurant", "bistro", "food"],
        "transport": ["uber", "bolt", "benzina", "orlen", "mhd", "jízdenka", "prague transport"],
        "utilities": ["čez", "pražské vodovody", "innogy", "vodafone", "t-mobile", "o2"],
        "entertainment": ["netflix", "spotify", "cinema", "hbo", "disney"],
        "shopping": ["amazon", "alza", "mall.cz", "czc", "datart"],
        "salary": ["mzda", "plat", "salary", "výplata"],
    }
    
    for category, keywords in categories.items():
        if any(kw in desc for kw in keywords):
            return category.capitalize()
    
    return "Other"


@router.get("/categories")
async def get_category_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Get spending by category"""
    transactions = await get_transactions(date_from, date_to, limit=500)
    
    categories = {}
    for tx in transactions:
        if tx.amount < 0:  # Only expenses
            cat = tx.category or "Other"
            if cat not in categories:
                categories[cat] = 0
            categories[cat] += abs(tx.amount)
    
    return {"categories": categories}
