from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from database import get_db
from models import TransactionModel, AccountModel, CategoryRuleModel

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
    transaction_type: str = "normal"  # "normal", "internal_transfer", "family_transfer"
    is_excluded: bool = False
    creditor_name: Optional[str] = None  # From raw_json creditorName
    debtor_name: Optional[str] = None  # From raw_json debtorName


class PaginatedTransactions(BaseModel):
    items: List[Transaction]
    total: int
    page: int
    size: int
    pages: int


@router.get("/", response_model=PaginatedTransactions)
async def get_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    account_id: Optional[str] = None,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    amount_type: Optional[str] = Query(None, description="income, expense, or all"),
    db: AsyncSession = Depends(get_db)
):
    """Get paginated transactions with filtering"""
    
    # Base query
    query = select(TransactionModel, AccountModel.name).join(AccountModel, TransactionModel.account_id == AccountModel.id)
    
    # Conditions
    conditions = []
    if date_from:
        conditions.append(TransactionModel.date >= date_from)
    if date_to:
        conditions.append(TransactionModel.date <= date_to)
    if account_id:
        conditions.append(TransactionModel.account_id == account_id)
    if category:
        conditions.append(TransactionModel.category == category)
    if search:
        search_term = f"%{search}%"
        conditions.append(TransactionModel.description.ilike(search_term))
    if amount_type == "income":
        conditions.append(TransactionModel.amount > 0)
    elif amount_type == "expense":
        conditions.append(TransactionModel.amount < 0)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Count total
    from sqlalchemy import func
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Pagination
    pages = (total + limit - 1) // limit
    offset = (page - 1) * limit
    
    query = query.order_by(TransactionModel.date.desc()).offset(offset).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()
    
    import json
    items = []
    for tx, account_name in rows:
        # Extract creditor/debtor names from raw_json
        creditor_name = None
        debtor_name = None
        if tx.raw_json:
            try:
                raw_data = json.loads(tx.raw_json)
                creditor_name = raw_data.get("creditorName")
                debtor_name = raw_data.get("debtorName")
            except:
                pass
        
        items.append(Transaction(
            id=tx.id,
            date=tx.date,
            description=tx.description,
            amount=tx.amount,
            currency=tx.currency,
            category=tx.category,
            account_id=tx.account_id,
            account_type=tx.account_type,
            account_name=account_name,
            transaction_type=tx.transaction_type or "normal",
            is_excluded=tx.is_excluded or False,
            creditor_name=creditor_name,
            debtor_name=debtor_name
        ))
    
    return PaginatedTransactions(
        items=items,
        total=total,
        page=page,
        size=limit,
        pages=pages
    )


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


class CategoryUpdate(BaseModel):
    category: str
    learn: bool = True  # If true, create a rule for this merchant


@router.patch("/{transaction_id}/category")
async def update_transaction_category(
    transaction_id: str,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update transaction category and optionally learn the mapping"""
    
    # Get the transaction
    tx = await db.get(TransactionModel, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    old_category = tx.category
    tx.category = data.category
    
    # Set is_excluded flag based on category type
    excluded_categories = ["Internal Transfer", "Family Transfer"]
    tx.is_excluded = data.category in excluded_categories
    
    # Also update transaction_type if changing to transfer category
    if data.category == "Internal Transfer":
        tx.transaction_type = "internal_transfer"
    elif data.category == "Family Transfer":
        tx.transaction_type = "family_transfer"
    elif tx.transaction_type in ["internal_transfer", "family_transfer"]:
        # Reset to normal if changing away from transfer
        tx.transaction_type = "normal"
    
    # Extract merchant name for learning
    if data.learn and tx.description:
        # Get the creditor name from description (usually first word/phrase)
        merchant = tx.description.lower().strip()
        
        # Check if rule already exists
        existing = await db.execute(
            select(CategoryRuleModel).where(CategoryRuleModel.pattern == merchant)
        )
        existing_rule = existing.scalar_one_or_none()
        
        if existing_rule:
            # Update existing rule
            existing_rule.category = data.category
            existing_rule.match_count += 1
        else:
            # Create new learned rule
            rule = CategoryRuleModel(
                pattern=merchant,
                category=data.category,
                is_user_defined=False,  # Learned from user action
                match_count=1
            )
            db.add(rule)
    
    await db.commit()
    
    return {
        "id": transaction_id,
        "old_category": old_category,
        "new_category": data.category,
        "is_excluded": tx.is_excluded,
        "rule_created": data.learn
    }


@router.get("/available-categories")
async def get_available_categories():
    """Get list of available categories"""
    return {
        "categories": [
            {"value": "Food", "label": "🍔 Jídlo"},
            {"value": "Transport", "label": "🚗 Doprava"},
            {"value": "Utilities", "label": "💡 Energie & Služby"},
            {"value": "Entertainment", "label": "🎬 Zábava"},
            {"value": "Shopping", "label": "🛒 Nákupy"},
            {"value": "Health", "label": "🏥 Zdraví"},
            {"value": "Salary", "label": "💰 Příjem"},
            {"value": "Investment", "label": "📈 Investice"},
            {"value": "Internal Transfer", "label": "🔄 Interní převod"},
            {"value": "Family Transfer", "label": "👨‍👩‍👧 Rodinný převod"},
            {"value": "Other", "label": "📦 Ostatní"},
        ]
    }


class TransactionTypeUpdate(BaseModel):
    transaction_type: str  # "normal", "internal_transfer", "family_transfer"


@router.patch("/{transaction_id}/type")
async def update_transaction_type(
    transaction_id: str,
    data: TransactionTypeUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update transaction type (normal, internal_transfer, family_transfer)"""
    
    valid_types = ["normal", "internal_transfer", "family_transfer"]
    if data.transaction_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {valid_types}")
    
    tx = await db.get(TransactionModel, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    old_type = tx.transaction_type
    tx.transaction_type = data.transaction_type
    tx.is_excluded = data.transaction_type != "normal"
    
    # Update category based on type
    if data.transaction_type == "internal_transfer":
        tx.category = "Internal Transfer"
    elif data.transaction_type == "family_transfer":
        tx.category = "Family Transfer"
    
    await db.commit()
    
    return {
        "id": transaction_id,
        "old_type": old_type,
        "new_type": data.transaction_type,
        "is_excluded": tx.is_excluded
    }


@router.get("/types")
async def get_transaction_types():
    """Get available transaction types"""
    return {
        "types": [
            {"value": "normal", "label": "Běžná transakce", "icon": "💳"},
            {"value": "internal_transfer", "label": "Interní převod", "icon": "🔄"},
            {"value": "family_transfer", "label": "Rodinný převod", "icon": "👨‍👩‍👧"},
        ]
    }
