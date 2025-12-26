from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from services.gocardless import gocardless_service
from services.trading212 import trading212_service
from database import get_db
from models import AccountModel
import json
from datetime import datetime

router = APIRouter()


class ConnectBankRequest(BaseModel):
    institution_id: str
    redirect_url: str


class AccountResponse(BaseModel):
    id: str
    name: str
    type: str  # "bank" or "investment"
    balance: float
    currency: str
    institution: Optional[str] = None


# Keep legacy in-memory storage for bank connection flow
connected_accounts: dict = {}


@router.get("/institutions")
async def get_institutions(country: str = "CZ"):
    """Get available banks for connection"""
    try:
        institutions = await gocardless_service.get_institutions(country)
        return {"institutions": institutions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/connect/bank")
async def connect_bank(request: ConnectBankRequest):
    """Initiate bank connection via GoCardless"""
    try:
        requisition = await gocardless_service.create_requisition(
            request.institution_id,
            request.redirect_url
        )
        return {
            "requisition_id": requisition["id"],
            "link": requisition["link"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/connect/bank/callback")
async def bank_callback(ref: str, db: AsyncSession = Depends(get_db)):
    """Handle bank connection callback - saves account to DB"""
    try:
        requisition = await gocardless_service.get_requisition(ref)
        accounts = requisition.get("accounts", [])
        
        for account_id in accounts:
            details = await gocardless_service.get_account_details(account_id)
            balances = await gocardless_service.get_account_balances(account_id)
            
            balance_list = balances.get("balances", [])
            balance = float(balance_list[0]["balanceAmount"]["amount"]) if balance_list else 0
            currency = balance_list[0]["balanceAmount"]["currency"] if balance_list else "CZK"
            account_details = details.get("account", {})
            
            # Save to database
            existing = await db.get(AccountModel, account_id)
            if existing:
                existing.balance = balance
                existing.currency = currency
                existing.last_synced = datetime.utcnow()
                existing.details_json = json.dumps(details)
            else:
                new_account = AccountModel(
                    id=account_id,
                    name=account_details.get("name", "Bank Account"),
                    type="bank",
                    balance=balance,
                    currency=currency,
                    institution=requisition.get("institution_id"),
                    details_json=json.dumps(details),
                    last_synced=datetime.utcnow()
                )
                db.add(new_account)
            
            # Also keep in memory for legacy compatibility
            connected_accounts[account_id] = {
                "id": account_id,
                "type": "bank",
                "details": details,
                "balances": balances,
                "institution": requisition.get("institution_id")
            }
        
        await db.commit()
        return {"status": "connected", "accounts": len(accounts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[AccountResponse])
async def get_accounts(db: AsyncSession = Depends(get_db)):
    """Get all connected accounts from database"""
    result = await db.execute(select(AccountModel))
    accounts = result.scalars().all()
    
    return [
        AccountResponse(
            id=acc.id,
            name=acc.name,
            type=acc.type,
            balance=acc.balance,
            currency=acc.currency,
            institution=acc.institution
        )
        for acc in accounts
    ]


@router.get("/{account_id}/balances")
async def get_account_balances(account_id: str, db: AsyncSession = Depends(get_db)):
    """Get account balances from database"""
    account = await db.get(AccountModel, account_id)
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return {"balances": [{"amount": account.balance, "currency": account.currency}]}
