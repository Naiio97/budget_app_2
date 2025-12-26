from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime
import json

from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel
from services.gocardless import gocardless_service
from services.trading212 import trading212_service

router = APIRouter()


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


@router.post("/")
async def sync_all_data(db: AsyncSession = Depends(get_db)):
    """Synchronize all data from external APIs to local database"""
    
    # Create sync status record
    sync_status = SyncStatusModel(
        started_at=datetime.utcnow(),
        status="running"
    )
    db.add(sync_status)
    await db.commit()
    await db.refresh(sync_status)
    
    accounts_synced = 0
    transactions_synced = 0
    
    try:
        # Clear existing transactions (fresh sync)
        await db.execute(delete(TransactionModel))
        
        # Sync bank accounts from GoCardless
        try:
            # Get requisitions/accounts that are connected
            # For now, we'll try to sync any existing connected accounts
            token = await gocardless_service.get_access_token()
            
            # Note: In production, you'd track requisition IDs and iterate
            # For demo, we'll create a placeholder bank account if none exists
        except Exception as e:
            print(f"GoCardless sync skipped: {e}")
        
        # Sync Trading 212
        try:
            cash = await trading212_service.get_account_info()
            portfolio = await trading212_service.get_portfolio()
            total_value = cash.get("free", 0) + sum(
                p.get("currentPrice", 0) * p.get("quantity", 0) for p in portfolio
            )
            
            # Upsert Trading 212 account
            t212_account = await db.get(AccountModel, "trading212")
            if t212_account:
                t212_account.balance = float(total_value)
                t212_account.currency = cash.get("currency", "EUR")
                t212_account.last_synced = datetime.utcnow()
                t212_account.details_json = json.dumps({"cash": cash, "positions": len(portfolio)})
            else:
                t212_account = AccountModel(
                    id="trading212",
                    name="Trading 212",
                    type="investment",
                    balance=float(total_value),
                    currency=cash.get("currency", "EUR"),
                    institution="Trading 212",
                    details_json=json.dumps({"cash": cash}),
                    last_synced=datetime.utcnow()
                )
                db.add(t212_account)
            
            accounts_synced += 1
            
            # Sync orders as transactions
            orders = await trading212_service.get_orders(limit=100)
            for order in orders.get("items", []):
                tx = TransactionModel(
                    id=order.get("id", ""),
                    account_id="trading212",
                    date=order.get("dateExecuted", order.get("dateCreated", ""))[:10],
                    description=f"{order.get('type', 'ORDER')} {order.get('ticker', '')}",
                    amount=-float(order.get("fillPrice", 0)) * float(order.get("filledQuantity", 0)),
                    currency="EUR",
                    category="Investment",
                    account_type="investment",
                    raw_json=json.dumps(order)
                )
                db.add(tx)
                transactions_synced += 1
            
            # Sync dividends
            dividends = await trading212_service.get_dividends(limit=100)
            for div in dividends.get("items", []):
                tx = TransactionModel(
                    id=f"div_{div.get('reference', '')}",
                    account_id="trading212",
                    date=div.get("paidOn", "")[:10] if div.get("paidOn") else "",
                    description=f"Dividend: {div.get('ticker', '')}",
                    amount=float(div.get("amount", 0)),
                    currency=div.get("currency", "EUR"),
                    category="Dividend",
                    account_type="investment",
                    raw_json=json.dumps(div)
                )
                db.add(tx)
                transactions_synced += 1
                
        except Exception as e:
            print(f"Trading 212 sync error: {e}")
        
        # Update sync status
        sync_status.status = "completed"
        sync_status.completed_at = datetime.utcnow()
        sync_status.accounts_synced = accounts_synced
        sync_status.transactions_synced = transactions_synced
        
        await db.commit()
        
        return {
            "status": "completed",
            "accounts_synced": accounts_synced,
            "transactions_synced": transactions_synced
        }
        
    except Exception as e:
        sync_status.status = "failed"
        sync_status.error_message = str(e)
        sync_status.completed_at = datetime.utcnow()
        await db.commit()
        
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    """Get the status of the last synchronization"""
    result = await db.execute(
        select(SyncStatusModel).order_by(SyncStatusModel.id.desc()).limit(1)
    )
    sync_status = result.scalar_one_or_none()
    
    if not sync_status:
        return {
            "status": "never",
            "last_sync": None,
            "accounts_synced": 0,
            "transactions_synced": 0
        }
    
    return {
        "status": sync_status.status,
        "last_sync": sync_status.completed_at.isoformat() if sync_status.completed_at else sync_status.started_at.isoformat(),
        "accounts_synced": sync_status.accounts_synced,
        "transactions_synced": sync_status.transactions_synced,
        "error": sync_status.error_message
    }
