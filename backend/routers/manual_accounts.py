from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import ManualAccountModel, ManualAccountItemModel

router = APIRouter()


# === Schemas ===

class EnvelopeCreate(BaseModel):
    name: str
    amount: float
    is_mine: bool = True
    note: Optional[str] = None


class EnvelopeUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    is_mine: Optional[bool] = None
    note: Optional[str] = None


class Envelope(BaseModel):
    id: int
    name: str
    amount: float
    is_mine: bool
    note: Optional[str]


class ManualAccountCreate(BaseModel):
    name: str
    balance: float = 0.0
    currency: str = "CZK"


class ManualAccountUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[float] = None
    is_visible: Optional[bool] = None


class ManualAccount(BaseModel):
    id: int
    name: str
    balance: float
    currency: str
    is_visible: bool
    my_balance: float  # balance - cizí obálky
    envelopes: List[Envelope]


# === Endpoints ===

@router.get("/", response_model=List[ManualAccount])
async def get_manual_accounts(db: AsyncSession = Depends(get_db)):
    """Get all manual accounts with envelopes"""
    result = await db.execute(
        select(ManualAccountModel).options(selectinload(ManualAccountModel.items))
    )
    accounts = result.scalars().all()
    
    return [
        ManualAccount(
            id=acc.id,
            name=acc.name,
            balance=acc.balance,
            currency=acc.currency,
            is_visible=acc.is_visible if acc.is_visible is not None else True,
            my_balance=acc.balance - sum(item.amount for item in acc.items if not item.is_mine),
            envelopes=[
                Envelope(
                    id=item.id,
                    name=item.name,
                    amount=item.amount,
                    is_mine=item.is_mine if item.is_mine is not None else True,
                    note=item.note
                )
                for item in acc.items
            ]
        )
        for acc in accounts
    ]


@router.post("/", response_model=ManualAccount)
async def create_manual_account(data: ManualAccountCreate, db: AsyncSession = Depends(get_db)):
    """Create a new manual account"""
    account = ManualAccountModel(
        name=data.name,
        balance=data.balance,
        currency=data.currency
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    
    return ManualAccount(
        id=account.id,
        name=account.name,
        balance=account.balance,
        currency=account.currency,
        is_visible=True,
        my_balance=account.balance,
        envelopes=[]
    )


@router.get("/{account_id}", response_model=ManualAccount)
async def get_manual_account(account_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single manual account with envelopes"""
    result = await db.execute(
        select(ManualAccountModel)
        .options(selectinload(ManualAccountModel.items))
        .where(ManualAccountModel.id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return ManualAccount(
        id=account.id,
        name=account.name,
        balance=account.balance,
        currency=account.currency,
        is_visible=account.is_visible if account.is_visible is not None else True,
        my_balance=account.balance - sum(item.amount for item in account.items if not item.is_mine),
        envelopes=[
            Envelope(
                id=item.id,
                name=item.name,
                amount=item.amount,
                is_mine=item.is_mine if item.is_mine is not None else True,
                note=item.note
            )
            for item in account.items
        ]
    )


@router.put("/{account_id}", response_model=ManualAccount)
async def update_manual_account(account_id: int, data: ManualAccountUpdate, db: AsyncSession = Depends(get_db)):
    """Update a manual account"""
    result = await db.execute(
        select(ManualAccountModel)
        .options(selectinload(ManualAccountModel.items))
        .where(ManualAccountModel.id == account_id)
    )
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if data.name is not None:
        account.name = data.name
    if data.balance is not None:
        account.balance = data.balance
    if data.is_visible is not None:
        account.is_visible = data.is_visible
    
    await db.commit()
    await db.refresh(account)
    
    return ManualAccount(
        id=account.id,
        name=account.name,
        balance=account.balance,
        currency=account.currency,
        is_visible=account.is_visible if account.is_visible is not None else True,
        my_balance=account.balance - sum(item.amount for item in account.items if not item.is_mine),
        envelopes=[
            Envelope(
                id=item.id,
                name=item.name,
                amount=item.amount,
                is_mine=item.is_mine if item.is_mine is not None else True,
                note=item.note
            )
            for item in account.items
        ]
    )


@router.delete("/{account_id}")
async def delete_manual_account(account_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a manual account"""
    account = await db.get(ManualAccountModel, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await db.delete(account)
    await db.commit()
    
    return {"status": "deleted", "id": account_id}


# === Envelope Endpoints ===

@router.post("/{account_id}/envelopes", response_model=Envelope)
async def create_envelope(account_id: int, data: EnvelopeCreate, db: AsyncSession = Depends(get_db)):
    """Create a new envelope in a manual account"""
    account = await db.get(ManualAccountModel, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    envelope = ManualAccountItemModel(
        account_id=account_id,
        name=data.name,
        amount=data.amount,
        is_mine=data.is_mine,
        note=data.note
    )
    db.add(envelope)
    await db.commit()
    await db.refresh(envelope)
    
    return Envelope(
        id=envelope.id,
        name=envelope.name,
        amount=envelope.amount,
        is_mine=envelope.is_mine,
        note=envelope.note
    )


@router.put("/{account_id}/envelopes/{envelope_id}", response_model=Envelope)
async def update_envelope(account_id: int, envelope_id: int, data: EnvelopeUpdate, db: AsyncSession = Depends(get_db)):
    """Update an envelope"""
    envelope = await db.get(ManualAccountItemModel, envelope_id)
    if not envelope or envelope.account_id != account_id:
        raise HTTPException(status_code=404, detail="Envelope not found")
    
    if data.name is not None:
        envelope.name = data.name
    if data.amount is not None:
        envelope.amount = data.amount
    if data.is_mine is not None:
        envelope.is_mine = data.is_mine
    if data.note is not None:
        envelope.note = data.note
    
    await db.commit()
    await db.refresh(envelope)
    
    return Envelope(
        id=envelope.id,
        name=envelope.name,
        amount=envelope.amount,
        is_mine=envelope.is_mine,
        note=envelope.note
    )


@router.delete("/{account_id}/envelopes/{envelope_id}")
async def delete_envelope(account_id: int, envelope_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an envelope"""
    envelope = await db.get(ManualAccountItemModel, envelope_id)
    if not envelope or envelope.account_id != account_id:
        raise HTTPException(status_code=404, detail="Envelope not found")
    
    await db.delete(envelope)
    await db.commit()
    
    return {"status": "deleted", "id": envelope_id}
