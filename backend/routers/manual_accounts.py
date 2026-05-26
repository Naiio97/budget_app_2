from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import ManualAccountModel, ManualAccountItemModel, UserModel

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
    account_number: Optional[str] = None
    balance: float = 0.0
    currency: str = "CZK"


class ManualAccountUpdate(BaseModel):
    name: Optional[str] = None
    account_number: Optional[str] = None
    balance: Optional[float] = None
    is_visible: Optional[bool] = None


class ManualAccount(BaseModel):
    id: int
    name: str
    account_number: Optional[str] = None
    balance: float
    currency: str
    is_visible: bool
    my_balance: float
    envelopes: List[Envelope]


async def _get_user_account(
    db: AsyncSession, user_id: int, account_id: int, with_items: bool = False
) -> ManualAccountModel:
    stmt = select(ManualAccountModel).where(
        ManualAccountModel.id == account_id,
        ManualAccountModel.user_id == user_id,
    )
    if with_items:
        stmt = stmt.options(selectinload(ManualAccountModel.items))
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def _to_response(account: ManualAccountModel) -> ManualAccount:
    return ManualAccount(
        id=account.id,
        name=account.name,
        account_number=account.account_number,
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


# === Endpoints ===

@router.get("/", response_model=List[ManualAccount])
async def get_manual_accounts(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all manual accounts with envelopes"""
    result = await db.execute(
        select(ManualAccountModel)
        .options(selectinload(ManualAccountModel.items))
        .where(ManualAccountModel.user_id == current_user.id)
    )
    accounts = result.scalars().all()
    return [_to_response(acc) for acc in accounts]


@router.post("/", response_model=ManualAccount)
async def create_manual_account(
    data: ManualAccountCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new manual account"""
    account = ManualAccountModel(
        user_id=current_user.id,
        name=data.name,
        account_number=data.account_number,
        balance=data.balance,
        currency=data.currency
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)

    return ManualAccount(
        id=account.id,
        name=account.name,
        account_number=account.account_number,
        balance=account.balance,
        currency=account.currency,
        is_visible=True,
        my_balance=account.balance,
        envelopes=[]
    )


@router.get("/{account_id}", response_model=ManualAccount)
async def get_manual_account(
    account_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single manual account with envelopes"""
    account = await _get_user_account(db, current_user.id, account_id, with_items=True)
    return _to_response(account)


@router.put("/{account_id}", response_model=ManualAccount)
async def update_manual_account(
    account_id: int,
    data: ManualAccountUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a manual account"""
    account = await _get_user_account(db, current_user.id, account_id, with_items=True)

    if data.name is not None:
        account.name = data.name
    if data.account_number is not None:
        account.account_number = data.account_number
    if data.balance is not None:
        account.balance = data.balance
    if data.is_visible is not None:
        account.is_visible = data.is_visible

    await db.commit()
    await db.refresh(account)
    return _to_response(account)


@router.delete("/{account_id}")
async def delete_manual_account(
    account_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a manual account"""
    account = await _get_user_account(db, current_user.id, account_id)
    await db.delete(account)
    await db.commit()
    return {"status": "deleted", "id": account_id}


# === Envelope Endpoints ===

async def _get_user_envelope(
    db: AsyncSession, user_id: int, account_id: int, envelope_id: int
) -> ManualAccountItemModel:
    result = await db.execute(
        select(ManualAccountItemModel)
        .join(ManualAccountModel, ManualAccountItemModel.account_id == ManualAccountModel.id)
        .where(
            ManualAccountItemModel.id == envelope_id,
            ManualAccountItemModel.account_id == account_id,
            ManualAccountModel.user_id == user_id,
        )
    )
    envelope = result.scalar_one_or_none()
    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")
    return envelope


@router.post("/{account_id}/envelopes", response_model=Envelope)
async def create_envelope(
    account_id: int,
    data: EnvelopeCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new envelope in a manual account"""
    await _get_user_account(db, current_user.id, account_id)

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
async def update_envelope(
    account_id: int,
    envelope_id: int,
    data: EnvelopeUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an envelope"""
    envelope = await _get_user_envelope(db, current_user.id, account_id, envelope_id)

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
async def delete_envelope(
    account_id: int,
    envelope_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an envelope"""
    envelope = await _get_user_envelope(db, current_user.id, account_id, envelope_id)
    await db.delete(envelope)
    await db.commit()
    return {"status": "deleted", "id": envelope_id}
