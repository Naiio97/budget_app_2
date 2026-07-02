from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from services.gocardless import gocardless_service, select_balance
from auth import get_current_user
from database import get_db
from models import AccountModel, TransactionModel, UserModel
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

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
    consent_expires_at: Optional[datetime] = None


# Keep legacy in-memory storage for bank connection flow
connected_accounts: dict = {}


@router.get("/institutions")
async def get_institutions(
    country: str = "CZ",
    current_user: UserModel = Depends(get_current_user),
):
    """Get available banks for connection"""
    try:
        institutions = await gocardless_service.get_institutions(country)
        return {"institutions": institutions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/connect/bank")
async def connect_bank(
    request: ConnectBankRequest,
    current_user: UserModel = Depends(get_current_user),
):
    """Initiate bank connection via GoCardless"""
    try:
        requisition = await gocardless_service.create_requisition(
            request.institution_id,
            request.redirect_url
        )
        return {
            "requisition_id": str(requisition.id),
            "link": str(requisition.link)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/connect/bank/callback")
async def bank_callback(
    ref: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Handle bank connection callback - saves account to DB.

    Hit by the browser after the user authorizes at the bank's site; the
    Auth.js session cookie comes along so we know which user owns the account.
    """
    try:
        requisition = await gocardless_service.get_requisition(ref)
        accounts = requisition.accounts or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    consent_expires_at = None
    if requisition.agreement:
        try:
            consent_expires_at = await gocardless_service.get_agreement_expiry(
                str(requisition.agreement)
            )
        except Exception as e:
            logger.warning(f"Failed to fetch agreement expiry for requisition {ref}: {e}")

    connected = 0
    failed = 0
    for account_id in accounts:
        account_id_str = str(account_id)
        existing = await db.execute(
            select(AccountModel).where(
                AccountModel.id == account_id_str,
                AccountModel.user_id == current_user.id,
            )
        )
        existing_acc = existing.scalar_one_or_none()

        try:
            details = await gocardless_service.get_account_details(account_id_str)
            balances = await gocardless_service.get_account_balances(account_id_str)
        except Exception as e:
            # Details/balances can fail right after authorization (e.g. the
            # GoCardless daily rate limit when the account already synced
            # today). The renewed consent must survive that — otherwise the
            # UI keeps saying "expired" until the next sync.
            logger.warning(f"Failed to fetch data for account {account_id_str} during connect: {e}")
            if existing_acc and consent_expires_at:
                existing_acc.consent_expires_at = consent_expires_at
                connected += 1
            else:
                failed += 1
            continue

        balance_list = balances.balances or []
        selected_balance = select_balance(balance_list)
        balance = float(selected_balance.balanceAmount.amount) if selected_balance else 0
        currency = selected_balance.balanceAmount.currency if selected_balance else "CZK"
        account_detail = details.account

        details_dict = details.model_dump(mode="json")

        if existing_acc:
            existing_acc.balance = balance
            existing_acc.currency = currency
            existing_acc.last_synced = datetime.utcnow()
            existing_acc.details_json = json.dumps(details_dict)
            if consent_expires_at:
                existing_acc.consent_expires_at = consent_expires_at
        else:
            new_account = AccountModel(
                id=account_id_str,
                user_id=current_user.id,
                name=account_detail.name or "Bank Account",
                type="bank",
                balance=balance,
                currency=currency,
                institution=requisition.institution_id,
                details_json=json.dumps(details_dict),
                last_synced=datetime.utcnow(),
                consent_expires_at=consent_expires_at
            )
            db.add(new_account)
        connected += 1

        connected_accounts[account_id_str] = {
            "id": account_id_str,
            "type": "bank",
            "details": details_dict,
            "balances": balances.model_dump(mode="json"),
            "institution": requisition.institution_id
        }

    await db.commit()
    if failed and not connected:
        raise HTTPException(status_code=502, detail="Failed to fetch any account data from GoCardless")
    return {"status": "connected", "accounts": connected, "failed": failed}


@router.get("/", response_model=List[AccountResponse])
async def get_accounts(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all connected accounts for the current user"""
    result = await db.execute(
        select(AccountModel).where(AccountModel.user_id == current_user.id)
    )
    accounts = result.scalars().all()

    return [
        AccountResponse(
            id=acc.id,
            name=acc.name,
            type=acc.type,
            balance=acc.balance,
            currency=acc.currency,
            institution=acc.institution,
            consent_expires_at=acc.consent_expires_at
        )
        for acc in accounts
    ]


async def _get_user_account(
    db: AsyncSession, account_id: str, user_id: int
) -> AccountModel:
    """Fetch account verifying it belongs to the user. 404 either way (don't
    leak existence of accounts owned by other users)."""
    result = await db.execute(
        select(AccountModel).where(
            AccountModel.id == account_id,
            AccountModel.user_id == user_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{account_id}/balances")
async def get_account_balances(
    account_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get account balances from database"""
    account = await _get_user_account(db, account_id, current_user.id)
    return {"balances": [{"amount": account.balance, "currency": account.currency}]}


@router.get("/{account_id}/detail")
async def get_account_detail(
    account_id: str,
    page: int = 1,
    limit: int = 20,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full account details including paginated transactions"""
    account = await _get_user_account(db, account_id, current_user.id)

    offset = (page - 1) * limit

    from sqlalchemy import func
    count_query = select(func.count()).where(
        TransactionModel.account_id == account_id,
        TransactionModel.user_id == current_user.id,
    )
    count_result = await db.execute(count_query)
    total_items = count_result.scalar() or 0

    import math
    total_pages = math.ceil(total_items / limit) if total_items > 0 else 1

    tx_result = await db.execute(
        select(TransactionModel)
        .where(
            TransactionModel.account_id == account_id,
            TransactionModel.user_id == current_user.id,
        )
        .order_by(TransactionModel.date.desc())
        .offset(offset)
        .limit(limit)
    )
    transactions = tx_result.scalars().all()

    return {
        "account": {
            "id": account.id,
            "name": account.name,
            "type": account.type,
            "balance": account.balance,
            "currency": account.currency,
            "institution": account.institution,
            "is_visible": account.is_visible,
            "last_synced": account.last_synced.isoformat() if account.last_synced else None,
            "consent_expires_at": account.consent_expires_at.isoformat() if account.consent_expires_at else None
        },
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
        ],
        "total": total_items,
        "pages": total_pages,
        "current_page": page
    }


class UpdateAccountRequest(BaseModel):
    name: Optional[str] = None
    is_visible: Optional[bool] = None


@router.put("/{account_id}")
async def update_account(
    account_id: str,
    request: UpdateAccountRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update account details (name, visibility)"""
    account = await _get_user_account(db, account_id, current_user.id)

    if request.name is not None:
        account.name = request.name
    if request.is_visible is not None:
        account.is_visible = request.is_visible

    await db.commit()
    return {"status": "updated", "id": account.id}


@router.delete("/{account_id}")
async def delete_account(
    account_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete account and all its transactions"""
    account = await _get_user_account(db, account_id, current_user.id)
    await db.delete(account)
    await db.commit()
    return {"status": "deleted", "id": account_id}
