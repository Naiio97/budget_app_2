"""Contacts — IBAN address book for naming counterparties.

Fills in display names for transactions where the bank omits
creditorName/debtorName (typical for Czech standing orders, utilities).
Naming a counterparty once propagates to all past + future transactions
sharing that IBAN.
"""
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from database import get_db
from models import ContactModel, TransactionModel

router = APIRouter()


def normalize_iban(value: Optional[str]) -> Optional[str]:
    """Upper-case and strip whitespace so lookups are consistent."""
    if not value:
        return None
    cleaned = "".join(value.split()).upper()
    return cleaned or None


class Contact(BaseModel):
    iban: str
    name: str
    source: str
    note: Optional[str] = None

    class Config:
        from_attributes = True


class ContactUpsert(BaseModel):
    name: str
    note: Optional[str] = None


@router.get("/", response_model=List[Contact])
async def list_contacts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContactModel).order_by(ContactModel.name))
    return list(result.scalars().all())


@router.get("/{iban:path}", response_model=Contact)
async def get_contact(iban: str, db: AsyncSession = Depends(get_db)):
    normalized = normalize_iban(iban)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid IBAN")
    contact = await db.get(ContactModel, normalized)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.put("/{iban:path}", response_model=Contact)
async def upsert_contact(
    iban: str,
    data: ContactUpsert,
    db: AsyncSession = Depends(get_db),
):
    """Create or update a contact. Manual entries always win over auto-learned ones."""
    normalized = normalize_iban(iban)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid IBAN")
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name must not be empty")

    contact = await db.get(ContactModel, normalized)
    if contact:
        contact.name = name
        contact.note = data.note
        contact.source = "manual"
    else:
        contact = ContactModel(
            iban=normalized,
            name=name,
            note=data.note,
            source="manual",
        )
        db.add(contact)

    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/{iban:path}")
async def delete_contact(iban: str, db: AsyncSession = Depends(get_db)):
    normalized = normalize_iban(iban)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid IBAN")
    contact = await db.get(ContactModel, normalized)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.delete(contact)
    await db.commit()
    return {"deleted": normalized}


@router.post("/auto-populate")
async def auto_populate(db: AsyncSession = Depends(get_db)):
    """Scan existing transactions and learn IBAN→name pairs from raw_json.

    Only fills gaps — never overwrites manual entries. Uses the most recent
    non-empty name seen for each IBAN.
    """
    result = await db.execute(
        select(TransactionModel.raw_json, TransactionModel.date)
        .where(TransactionModel.raw_json.isnot(None))
        .order_by(TransactionModel.date.desc())
    )
    rows = result.all()

    latest_by_iban: dict[str, str] = {}
    for raw_json, _date in rows:
        try:
            raw = json.loads(raw_json)
        except Exception:
            continue

        for account_key, name_key in (("creditorAccount", "creditorName"), ("debtorAccount", "debtorName")):
            acc = raw.get(account_key) or {}
            iban = normalize_iban(acc.get("iban") or acc.get("bban"))
            name = (raw.get(name_key) or "").strip()
            if iban and name and iban not in latest_by_iban:
                latest_by_iban[iban] = name

    if not latest_by_iban:
        return {"learned": 0, "skipped": 0, "total_scanned": len(rows)}

    existing_result = await db.execute(
        select(ContactModel).where(ContactModel.iban.in_(list(latest_by_iban.keys())))
    )
    existing = {c.iban: c for c in existing_result.scalars().all()}

    learned = 0
    skipped = 0
    for iban, name in latest_by_iban.items():
        contact = existing.get(iban)
        if contact is None:
            db.add(ContactModel(iban=iban, name=name, source="auto"))
            learned += 1
        elif contact.source == "auto" and contact.name != name:
            contact.name = name
            learned += 1
        else:
            skipped += 1

    await db.commit()
    return {"learned": learned, "skipped": skipped, "total_scanned": len(rows)}
