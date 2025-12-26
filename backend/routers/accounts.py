from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.gocardless import gocardless_service
from services.trading212 import trading212_service

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


# In-memory storage for connected accounts (for demo - use DB in production)
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
async def bank_callback(ref: str):
    """Handle bank connection callback"""
    try:
        requisition = await gocardless_service.get_requisition(ref)
        accounts = requisition.get("accounts", [])
        
        for account_id in accounts:
            details = await gocardless_service.get_account_details(account_id)
            balances = await gocardless_service.get_account_balances(account_id)
            
            connected_accounts[account_id] = {
                "id": account_id,
                "type": "bank",
                "details": details,
                "balances": balances,
                "institution": requisition.get("institution_id")
            }
        
        return {"status": "connected", "accounts": len(accounts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[AccountResponse])
async def get_accounts():
    """Get all connected accounts"""
    accounts = []
    
    # Bank accounts
    for acc_id, acc in connected_accounts.items():
        if acc["type"] == "bank":
            balances = acc.get("balances", {}).get("balances", [])
            balance = balances[0]["balanceAmount"]["amount"] if balances else 0
            currency = balances[0]["balanceAmount"]["currency"] if balances else "CZK"
            
            details = acc.get("details", {}).get("account", {})
            accounts.append(AccountResponse(
                id=acc_id,
                name=details.get("name", "Bank Account"),
                type="bank",
                balance=float(balance),
                currency=currency,
                institution=acc.get("institution")
            ))
    
    # Investment account (Trading 212)
    try:
        cash = await trading212_service.get_account_info()
        portfolio = await trading212_service.get_portfolio()
        total_value = cash.get("free", 0) + sum(p.get("currentPrice", 0) * p.get("quantity", 0) for p in portfolio)
        
        accounts.append(AccountResponse(
            id="trading212",
            name="Trading 212",
            type="investment",
            balance=float(total_value),
            currency=cash.get("currency", "EUR"),
            institution="Trading 212"
        ))
    except:
        pass  # Trading 212 not configured
    
    return accounts


@router.get("/{account_id}/balances")
async def get_account_balances(account_id: str):
    """Get account balances"""
    if account_id == "trading212":
        try:
            cash = await trading212_service.get_account_info()
            return {"balances": [{"amount": cash.get("free", 0), "currency": cash.get("currency", "EUR")}]}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    try:
        balances = await gocardless_service.get_account_balances(account_id)
        return balances
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
