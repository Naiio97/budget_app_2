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


# ============== Category Rules ==============

from models import CategoryRuleModel

class CategoryRuleRequest(BaseModel):
    pattern: str
    category: str


class CategoryRuleResponse(BaseModel):
    id: int
    pattern: str
    category: str
    is_user_defined: bool
    match_count: int


@router.get("/category-rules")
async def get_category_rules(db: AsyncSession = Depends(get_db)):
    """Get all category rules"""
    result = await db.execute(
        select(CategoryRuleModel).order_by(CategoryRuleModel.is_user_defined.desc(), CategoryRuleModel.match_count.desc())
    )
    rules = result.scalars().all()
    
    return {
        "rules": [
            CategoryRuleResponse(
                id=r.id,
                pattern=r.pattern,
                category=r.category,
                is_user_defined=r.is_user_defined,
                match_count=r.match_count
            )
            for r in rules
        ]
    }


@router.post("/category-rules")
async def create_category_rule(request: CategoryRuleRequest, db: AsyncSession = Depends(get_db)):
    """Create a new category rule"""
    # Check if pattern already exists
    existing = await db.execute(
        select(CategoryRuleModel).where(CategoryRuleModel.pattern == request.pattern.lower())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Rule with this pattern already exists")
    
    rule = CategoryRuleModel(
        pattern=request.pattern.lower(),
        category=request.category,
        is_user_defined=True,
        match_count=0
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    
    return {
        "id": rule.id,
        "pattern": rule.pattern,
        "category": rule.category,
        "message": "Rule created successfully"
    }


@router.delete("/category-rules/{rule_id}")
async def delete_category_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a category rule"""
    rule = await db.get(CategoryRuleModel, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    await db.delete(rule)
    await db.commit()
    
    return {"message": "Rule deleted", "id": rule_id}


# ============== Family Account Settings ==============

class FamilyAccountRequest(BaseModel):
    pattern: str  # Name pattern to match in transaction description (e.g., "Sandri")
    name: Optional[str] = "Partner"


class FamilyAccountResponse(BaseModel):
    pattern: str
    name: str


@router.get("/family-accounts")
async def get_family_accounts(db: AsyncSession = Depends(get_db)):
    """Get configured family accounts (wife's account, etc.)"""
    family_pattern = await get_setting(db, "family_account_pattern")
    family_name = await get_setting(db, "family_account_name") or "Partner"
    
    accounts = []
    if family_pattern:
        accounts.append(FamilyAccountResponse(pattern=family_pattern, name=family_name))
    
    return {"accounts": accounts}


@router.post("/family-accounts")
async def save_family_account(request: FamilyAccountRequest, db: AsyncSession = Depends(get_db)):
    """Save family account pattern for automatic transaction detection"""
    await set_setting(db, "family_account_pattern", request.pattern.lower().strip())
    await set_setting(db, "family_account_name", request.name)
    await db.commit()
    
    return {"status": "saved", "pattern": request.pattern, "name": request.name}


@router.delete("/family-accounts")
async def delete_family_account(db: AsyncSession = Depends(get_db)):
    """Remove family account setting"""
    existing_pattern = await db.get(SettingsModel, "family_account_pattern")
    existing_name = await db.get(SettingsModel, "family_account_name")
    
    if existing_pattern:
        await db.delete(existing_pattern)
    if existing_name:
        await db.delete(existing_name)
    await db.commit()
    
    return {"status": "deleted"}


# ============== My Account Patterns (Internal Transfers) ==============

class MyAccountPatternRequest(BaseModel):
    patterns: list[str]  # List of patterns to match (e.g., ["spořící", "savings", "CZ123456"])


@router.get("/my-account-patterns")
async def get_my_account_patterns(db: AsyncSession = Depends(get_db)):
    """Get patterns that identify user's own accounts for internal transfer detection"""
    import json
    patterns_json = await get_setting(db, "my_account_patterns")
    patterns = json.loads(patterns_json) if patterns_json else []
    return {"patterns": patterns}


@router.post("/my-account-patterns")
async def save_my_account_patterns(request: MyAccountPatternRequest, db: AsyncSession = Depends(get_db)):
    """Save patterns for internal transfer detection"""
    import json
    # Clean and lowercase patterns
    clean_patterns = [p.lower().strip() for p in request.patterns if p.strip()]
    await set_setting(db, "my_account_patterns", json.dumps(clean_patterns))
    await db.commit()
    return {"status": "saved", "patterns": clean_patterns}


@router.delete("/my-account-patterns")
async def delete_my_account_patterns(db: AsyncSession = Depends(get_db)):
    """Remove all my account patterns"""
    existing = await db.get(SettingsModel, "my_account_patterns")
    if existing:
        await db.delete(existing)
    await db.commit()
    return {"status": "deleted"}

