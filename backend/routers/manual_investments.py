from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
from models import ManualInvestmentAccountModel, ManualInvestmentPositionModel, ManualInvestmentSnapshotModel

router = APIRouter()


# === Schemas ===

class PositionCreate(BaseModel):
    name: str
    quantity: Optional[float] = None
    avg_buy_price: Optional[float] = None
    current_value: float
    currency: str = "CZK"
    note: Optional[str] = None


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    avg_buy_price: Optional[float] = None
    current_value: Optional[float] = None
    currency: Optional[str] = None
    note: Optional[str] = None


class Position(BaseModel):
    id: int
    name: str
    quantity: Optional[float]
    avg_buy_price: Optional[float]
    current_value: float
    currency: str
    note: Optional[str]
    invested: Optional[float]   # qty * avg_buy_price, if both present
    pnl: Optional[float]        # current_value - invested
    pnl_pct: Optional[float]

    class Config:
        from_attributes = True


class AccountCreate(BaseModel):
    name: str
    currency: str = "CZK"
    note: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    note: Optional[str] = None
    is_visible: Optional[bool] = None


class ManualInvestmentAccount(BaseModel):
    id: int
    name: str
    currency: str
    note: Optional[str]
    is_visible: bool
    total_value: float
    invested: float
    pnl: float
    pnl_pct: float
    positions: List[Position]

    class Config:
        from_attributes = True


class HistoryPoint(BaseModel):
    date: str
    value: float


def _calc_position(pos: ManualInvestmentPositionModel) -> Position:
    invested: Optional[float] = None
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None
    if pos.quantity is not None and pos.avg_buy_price is not None:
        invested = round(pos.quantity * pos.avg_buy_price, 2)
        pnl = round(pos.current_value - invested, 2)
        pnl_pct = round((pnl / invested * 100) if invested else 0, 2)
    return Position(
        id=pos.id,
        name=pos.name,
        quantity=pos.quantity,
        avg_buy_price=pos.avg_buy_price,
        current_value=pos.current_value,
        currency=pos.currency,
        note=pos.note,
        invested=invested,
        pnl=pnl,
        pnl_pct=pnl_pct,
    )


def _build_account(acc: ManualInvestmentAccountModel) -> ManualInvestmentAccount:
    positions = [_calc_position(p) for p in acc.positions]
    total_value = round(sum(p.current_value for p in acc.positions), 2)
    total_invested = sum(p.invested for p in positions if p.invested is not None)
    pnl = round(total_value - total_invested, 2) if total_invested else 0.0
    pnl_pct = round((pnl / total_invested * 100) if total_invested else 0, 2)
    return ManualInvestmentAccount(
        id=acc.id,
        name=acc.name,
        currency=acc.currency,
        note=acc.note,
        is_visible=acc.is_visible if acc.is_visible is not None else True,
        total_value=total_value,
        invested=round(total_invested, 2),
        pnl=pnl,
        pnl_pct=pnl_pct,
        positions=positions,
    )


async def _save_snapshot(db: AsyncSession, account_id: int, total_value: float) -> None:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    existing = await db.execute(
        select(ManualInvestmentSnapshotModel)
        .where(ManualInvestmentSnapshotModel.account_id == account_id)
        .where(ManualInvestmentSnapshotModel.snapshot_date == today)
    )
    snap = existing.scalar_one_or_none()
    if snap:
        snap.total_value = total_value
    else:
        db.add(ManualInvestmentSnapshotModel(
            account_id=account_id,
            snapshot_date=today,
            total_value=total_value,
        ))


# === Account endpoints ===

@router.get("/", response_model=List[ManualInvestmentAccount])
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ManualInvestmentAccountModel)
        .options(selectinload(ManualInvestmentAccountModel.positions))
    )
    return [_build_account(a) for a in result.scalars().all()]


@router.post("/", response_model=ManualInvestmentAccount)
async def create_account(data: AccountCreate, db: AsyncSession = Depends(get_db)):
    acc = ManualInvestmentAccountModel(name=data.name, currency=data.currency, note=data.note)
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    # Nový účet nemá žádné pozice — nevstupujeme do lazy relationship
    return ManualInvestmentAccount(
        id=acc.id,
        name=acc.name,
        currency=acc.currency,
        note=acc.note,
        is_visible=acc.is_visible if acc.is_visible is not None else True,
        total_value=0.0,
        invested=0.0,
        pnl=0.0,
        pnl_pct=0.0,
        positions=[],
    )


@router.get("/{account_id}", response_model=ManualInvestmentAccount)
async def get_account(account_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ManualInvestmentAccountModel)
        .options(selectinload(ManualInvestmentAccountModel.positions))
        .where(ManualInvestmentAccountModel.id == account_id)
    )
    acc = result.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return _build_account(acc)


@router.put("/{account_id}", response_model=ManualInvestmentAccount)
async def update_account(account_id: int, data: AccountUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ManualInvestmentAccountModel)
        .options(selectinload(ManualInvestmentAccountModel.positions))
        .where(ManualInvestmentAccountModel.id == account_id)
    )
    acc = result.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    if data.name is not None:
        acc.name = data.name
    if data.currency is not None:
        acc.currency = data.currency
    if data.note is not None:
        acc.note = data.note
    if data.is_visible is not None:
        acc.is_visible = data.is_visible
    await db.commit()
    await db.refresh(acc)
    return _build_account(acc)


@router.delete("/{account_id}")
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    acc = await db.get(ManualInvestmentAccountModel, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(acc)
    await db.commit()
    return {"status": "deleted", "id": account_id}


# === History endpoint ===

@router.get("/{account_id}/history", response_model=List[HistoryPoint])
async def get_history(account_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ManualInvestmentSnapshotModel)
        .where(ManualInvestmentSnapshotModel.account_id == account_id)
        .order_by(ManualInvestmentSnapshotModel.snapshot_date.asc())
    )
    return [HistoryPoint(date=s.snapshot_date, value=s.total_value) for s in result.scalars().all()]


# === Position endpoints ===

@router.post("/{account_id}/positions", response_model=Position)
async def create_position(account_id: int, data: PositionCreate, db: AsyncSession = Depends(get_db)):
    acc = await db.get(ManualInvestmentAccountModel, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    pos = ManualInvestmentPositionModel(
        account_id=account_id,
        name=data.name,
        quantity=data.quantity,
        avg_buy_price=data.avg_buy_price,
        current_value=data.current_value,
        currency=data.currency,
        note=data.note,
    )
    db.add(pos)
    await db.flush()  # get pos.id before snapshot
    # Recalculate total and save snapshot
    all_pos_result = await db.execute(
        select(ManualInvestmentPositionModel).where(ManualInvestmentPositionModel.account_id == account_id)
    )
    total = sum(p.current_value for p in all_pos_result.scalars().all())
    await _save_snapshot(db, account_id, total)
    await db.commit()
    await db.refresh(pos)
    return _calc_position(pos)


@router.put("/{account_id}/positions/{position_id}", response_model=Position)
async def update_position(account_id: int, position_id: int, data: PositionUpdate, db: AsyncSession = Depends(get_db)):
    pos = await db.get(ManualInvestmentPositionModel, position_id)
    if not pos or pos.account_id != account_id:
        raise HTTPException(status_code=404, detail="Position not found")
    if data.name is not None:
        pos.name = data.name
    if data.quantity is not None:
        pos.quantity = data.quantity
    if data.avg_buy_price is not None:
        pos.avg_buy_price = data.avg_buy_price
    if data.current_value is not None:
        pos.current_value = data.current_value
    if data.currency is not None:
        pos.currency = data.currency
    if data.note is not None:
        pos.note = data.note
    await db.flush()
    all_pos_result = await db.execute(
        select(ManualInvestmentPositionModel).where(ManualInvestmentPositionModel.account_id == account_id)
    )
    total = sum(p.current_value for p in all_pos_result.scalars().all())
    await _save_snapshot(db, account_id, total)
    await db.commit()
    await db.refresh(pos)
    return _calc_position(pos)


@router.delete("/{account_id}/positions/{position_id}")
async def delete_position(account_id: int, position_id: int, db: AsyncSession = Depends(get_db)):
    pos = await db.get(ManualInvestmentPositionModel, position_id)
    if not pos or pos.account_id != account_id:
        raise HTTPException(status_code=404, detail="Position not found")
    await db.delete(pos)
    await db.flush()
    all_pos_result = await db.execute(
        select(ManualInvestmentPositionModel).where(ManualInvestmentPositionModel.account_id == account_id)
    )
    total = sum(p.current_value for p in all_pos_result.scalars().all())
    await _save_snapshot(db, account_id, total)
    await db.commit()
    return {"status": "deleted", "id": position_id}
