from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from database import get_db
from models import TransactionModel, AccountModel

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
    account_name: Optional[str] = None


@router.get("/", response_model=List[Transaction])
async def get_transactions(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    account_id: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all transactions from database (instant response)"""
    
    # Build query with join to get account name
    query = select(TransactionModel, AccountModel.name).join(AccountModel, TransactionModel.account_id == AccountModel.id)
    
    conditions = []
    if date_from:
        conditions.append(TransactionModel.date >= date_from)
    if date_to:
        conditions.append(TransactionModel.date <= date_to)
    if account_id:
        conditions.append(TransactionModel.account_id == account_id)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(TransactionModel.date.desc()).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        Transaction(
            id=tx.id,
            date=tx.date,
            description=tx.description,
            amount=tx.amount,
            currency=tx.currency,
            category=tx.category,
            account_id=tx.account_id,
            account_type=tx.account_type,
            account_name=account_name
        )
        for tx, account_name in rows
    ]


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
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Get spending by category from database"""
    transactions = await get_transactions(date_from, date_to, limit=500, db=db)
    
    categories = {}
    for tx in transactions:
        if tx.amount < 0:  # Only expenses
            cat = tx.category or "Other"
            if cat not in categories:
                categories[cat] = 0
            categories[cat] += abs(tx.amount)
    
    return {"categories": categories}
