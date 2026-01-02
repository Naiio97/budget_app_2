from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from database import get_db
from models import SettingsModel

router = APIRouter()


class ApiKeysRequest(BaseModel):
    gocardless_secret_id: Optional[str] = None
    gocardless_secret_key: Optional[str] = None
    trading212_api_key: Optional[str] = None


class ApiKeysResponse(BaseModel):
    gocardless_secret_id: Optional[str] = None
    gocardless_secret_key: Optional[str] = None
    trading212_api_key: Optional[str] = None
    has_gocardless: bool = False
    has_trading212: bool = False


async def get_setting(db: AsyncSession, key: str) -> Optional[str]:
    """Get a setting value by key"""
    result = await db.execute(select(SettingsModel).where(SettingsModel.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def set_setting(db: AsyncSession, key: str, value: str):
    """Set a setting value"""
    existing = await db.get(SettingsModel, key)
    if existing:
        existing.value = value
        existing.updated_at = datetime.utcnow()
    else:
        setting = SettingsModel(key=key, value=value)
        db.add(setting)


@router.get("/api-keys", response_model=ApiKeysResponse)
async def get_api_keys(db: AsyncSession = Depends(get_db)):
    """Get API keys (masked for security)"""
    gocardless_id = await get_setting(db, "gocardless_secret_id")
    gocardless_key = await get_setting(db, "gocardless_secret_key")
    trading212_key = await get_setting(db, "trading212_api_key")
    
    # Mask the keys for security (show only first 8 chars)
    def mask_key(key: Optional[str]) -> Optional[str]:
        if not key or len(key) < 12:
            return key
        return key[:8] + "..." + key[-4:]
    
    return ApiKeysResponse(
        gocardless_secret_id=mask_key(gocardless_id),
        gocardless_secret_key=mask_key(gocardless_key),
        trading212_api_key=mask_key(trading212_key),
        has_gocardless=bool(gocardless_id and gocardless_key),
        has_trading212=bool(trading212_key)
    )


@router.post("/api-keys")
async def save_api_keys(request: ApiKeysRequest, db: AsyncSession = Depends(get_db)):
    """Save API keys to database"""
    updated_keys = []
    
    if request.gocardless_secret_id is not None:
        await set_setting(db, "gocardless_secret_id", request.gocardless_secret_id)
        updated_keys.append("gocardless_secret_id")
    
    if request.gocardless_secret_key is not None:
        await set_setting(db, "gocardless_secret_key", request.gocardless_secret_key)
        updated_keys.append("gocardless_secret_key")
    
    if request.trading212_api_key is not None:
        await set_setting(db, "trading212_api_key", request.trading212_api_key)
        updated_keys.append("trading212_api_key")
    
    await db.commit()
    
    return {"status": "saved", "updated_keys": updated_keys}


# Helper function to get API keys for services
async def get_api_key(key: str) -> Optional[str]:
    """Get an API key from database (for use in services)"""
    from database import get_db_context
    async with get_db_context() as db:
        return await get_setting(db, key)
