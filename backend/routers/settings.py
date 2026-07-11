from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from datetime import datetime

from auth import get_current_user
from database import get_db
from models import SettingsModel, CategoryRuleModel, UserModel, ShareRuleModel, TransactionModel
from services.share_rules import compute_my_share

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


async def get_setting(db: AsyncSession, user_id: int, key: str) -> Optional[str]:
    """Get a setting value by (user, key)"""
    setting = await db.get(SettingsModel, (user_id, key))
    return setting.value if setting else None


async def set_setting(db: AsyncSession, user_id: int, key: str, value: str):
    """Set a setting value scoped to user"""
    existing = await db.get(SettingsModel, (user_id, key))
    if existing:
        existing.value = value
        existing.updated_at = datetime.utcnow()
    else:
        setting = SettingsModel(user_id=user_id, key=key, value=value)
        db.add(setting)


@router.get("/api-keys", response_model=ApiKeysResponse)
async def get_api_keys(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get API keys (masked for security)"""
    gocardless_id = await get_setting(db, current_user.id, "gocardless_secret_id")
    gocardless_key = await get_setting(db, current_user.id, "gocardless_secret_key")
    trading212_key = await get_setting(db, current_user.id, "trading212_api_key")

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
async def save_api_keys(
    request: ApiKeysRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save API keys to database"""
    updated_keys = []

    if request.gocardless_secret_id is not None:
        await set_setting(db, current_user.id, "gocardless_secret_id", request.gocardless_secret_id)
        updated_keys.append("gocardless_secret_id")

    if request.gocardless_secret_key is not None:
        await set_setting(db, current_user.id, "gocardless_secret_key", request.gocardless_secret_key)
        updated_keys.append("gocardless_secret_key")

    if request.trading212_api_key is not None:
        await set_setting(db, current_user.id, "trading212_api_key", request.trading212_api_key)
        updated_keys.append("trading212_api_key")

    await db.commit()

    if any(k.startswith("gocardless_") for k in updated_keys):
        from services.gocardless import gocardless_service
        gocardless_service.clear_token()

    return {"status": "saved", "updated_keys": updated_keys}


# Helpers for services that operate outside a request context (GoCardless
# token refresh, Trading 212 polling). These don't have a current_user, so
# they fall back to the lowest-id user in the DB — fine for single-tenant
# deployments, but multi-tenant deployments must plumb request context
# through.
async def _resolve_default_user_id(db: AsyncSession) -> Optional[int]:
    from models import UserModel
    result = await db.execute(
        select(UserModel.id).order_by(UserModel.id).limit(1)
    )
    return result.scalar_one_or_none()


async def get_api_key(key: str, user_id: Optional[int] = None) -> Optional[str]:
    """Get an API key from database (for use in services)."""
    from database import get_db_context
    async with get_db_context() as db:
        if user_id is None:
            user_id = await _resolve_default_user_id(db)
            if user_id is None:
                return None
        return await get_setting(db, user_id, key)


async def set_api_key(key: str, value: str, user_id: Optional[int] = None) -> None:
    """Set an API key in database (for use in services like GoCardless token cache)."""
    from database import get_db_context
    async with get_db_context() as db:
        if user_id is None:
            user_id = await _resolve_default_user_id(db)
            if user_id is None:
                return  # no users yet — silently drop; service will re-fetch next time
        await set_setting(db, user_id, key, value)
        await db.commit()


# ============== Category Rules ==============


class CategoryRuleRequest(BaseModel):
    pattern: str
    category: str


class CategoryRuleResponse(BaseModel):
    id: int
    pattern: str
    category: str
    is_user_defined: bool
    is_builtin: bool
    match_count: int


@router.get("/category-rules")
async def get_category_rules(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all category rules for the current user"""
    result = await db.execute(
        select(CategoryRuleModel)
        .where(CategoryRuleModel.user_id == current_user.id)
        # Vlastní → naučená → výchozí (builtin), uvnitř podle úspěšnosti
        .order_by(
            CategoryRuleModel.is_user_defined.desc(),
            CategoryRuleModel.is_builtin.asc(),
            CategoryRuleModel.match_count.desc(),
        )
    )
    rules = result.scalars().all()

    return {
        "rules": [
            CategoryRuleResponse(
                id=r.id,
                pattern=r.pattern,
                category=r.category,
                is_user_defined=r.is_user_defined,
                is_builtin=r.is_builtin,
                match_count=r.match_count
            )
            for r in rules
        ]
    }


@router.post("/category-rules")
async def create_category_rule(
    request: CategoryRuleRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new category rule"""
    existing = await db.execute(
        select(CategoryRuleModel).where(
            CategoryRuleModel.user_id == current_user.id,
            CategoryRuleModel.pattern == request.pattern.lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Rule with this pattern already exists")

    rule = CategoryRuleModel(
        user_id=current_user.id,
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


@router.put("/category-rules/{rule_id}")
async def update_category_rule(
    rule_id: int,
    request: CategoryRuleRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing category rule's pattern/category"""
    result = await db.execute(
        select(CategoryRuleModel).where(
            CategoryRuleModel.id == rule_id,
            CategoryRuleModel.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    new_pattern = request.pattern.lower()
    if new_pattern != rule.pattern:
        existing = await db.execute(
            select(CategoryRuleModel).where(
                CategoryRuleModel.user_id == current_user.id,
                CategoryRuleModel.pattern == new_pattern,
                CategoryRuleModel.id != rule_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Rule with this pattern already exists")

    rule.pattern = new_pattern
    rule.category = request.category
    await db.commit()
    await db.refresh(rule)

    return CategoryRuleResponse(
        id=rule.id,
        pattern=rule.pattern,
        category=rule.category,
        is_user_defined=rule.is_user_defined,
        is_builtin=rule.is_builtin,
        match_count=rule.match_count,
    )


@router.delete("/category-rules/{rule_id}")
async def delete_category_rule(
    rule_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a category rule"""
    result = await db.execute(
        select(CategoryRuleModel).where(
            CategoryRuleModel.id == rule_id,
            CategoryRuleModel.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.delete(rule)
    await db.commit()

    return {"message": "Rule deleted", "id": rule_id}


# ============== Family Account Settings ==============

class FamilyAccountRequest(BaseModel):
    pattern: str
    name: Optional[str] = "Partner"


class FamilyAccountResponse(BaseModel):
    pattern: str
    name: str


@router.get("/family-accounts")
async def get_family_accounts(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get configured family accounts (wife's account, etc.)"""
    family_pattern = await get_setting(db, current_user.id, "family_account_pattern")
    family_name = await get_setting(db, current_user.id, "family_account_name") or "Partner"

    accounts = []
    if family_pattern:
        accounts.append(FamilyAccountResponse(pattern=family_pattern, name=family_name))

    return {"accounts": accounts}


@router.post("/family-accounts")
async def save_family_account(
    request: FamilyAccountRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save family account pattern for automatic transaction detection"""
    await set_setting(db, current_user.id, "family_account_pattern", request.pattern.lower().strip())
    await set_setting(db, current_user.id, "family_account_name", request.name)
    await db.commit()

    return {"status": "saved", "pattern": request.pattern, "name": request.name}


@router.delete("/family-accounts")
async def delete_family_account(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove family account setting"""
    existing_pattern = await db.get(SettingsModel, (current_user.id, "family_account_pattern"))
    existing_name = await db.get(SettingsModel, (current_user.id, "family_account_name"))

    if existing_pattern:
        await db.delete(existing_pattern)
    if existing_name:
        await db.delete(existing_name)
    await db.commit()

    return {"status": "deleted"}


# ============== Salary Config (odhad výplaty) ==============

class SalaryConfigRequest(BaseModel):
    base_monthly: float
    prumer: float
    # "2026-Q3" — pro detekci zastaralého průměru; volitelné, bez něj se
    # jen nezobrazuje warning o zastaralém průměru
    prumer_quarter: Optional[str] = None


class SalaryConfigResponse(BaseModel):
    base_monthly: Optional[float] = None
    prumer: Optional[float] = None
    prumer_quarter: Optional[str] = None


@router.get("/salary-config", response_model=SalaryConfigResponse)
async def get_salary_config(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Konfigurace pro odhad výplaty (základní mzda + kvartální průměr náhrady)"""
    base = await get_setting(db, current_user.id, "salary_base_monthly")
    prumer = await get_setting(db, current_user.id, "salary_prumer")
    quarter = await get_setting(db, current_user.id, "salary_prumer_quarter")
    return SalaryConfigResponse(
        base_monthly=float(base) if base else None,
        prumer=float(prumer) if prumer else None,
        prumer_quarter=quarter,
    )


@router.post("/salary-config")
async def save_salary_config(
    request: SalaryConfigRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Uložit konfiguraci pro odhad výplaty"""
    await set_setting(db, current_user.id, "salary_base_monthly", str(request.base_monthly))
    await set_setting(db, current_user.id, "salary_prumer", str(request.prumer))
    if request.prumer_quarter and request.prumer_quarter.strip():
        await set_setting(db, current_user.id, "salary_prumer_quarter", request.prumer_quarter.strip())
    await db.commit()
    return {"status": "saved"}


# ============== My Account Patterns (Internal Transfers) ==============

class MyAccountPatternRequest(BaseModel):
    patterns: list[str]


@router.get("/my-account-patterns")
async def get_my_account_patterns(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get patterns that identify user's own accounts for internal transfer detection"""
    import json
    patterns_json = await get_setting(db, current_user.id, "my_account_patterns")
    patterns = json.loads(patterns_json) if patterns_json else []
    return {"patterns": patterns}


@router.post("/my-account-patterns")
async def save_my_account_patterns(
    request: MyAccountPatternRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save patterns for internal transfer detection"""
    import json
    clean_patterns = [p.lower().strip() for p in request.patterns if p.strip()]
    await set_setting(db, current_user.id, "my_account_patterns", json.dumps(clean_patterns))
    await db.commit()
    return {"status": "saved", "patterns": clean_patterns}


@router.delete("/my-account-patterns")
async def delete_my_account_patterns(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove all my account patterns"""
    existing = await db.get(SettingsModel, (current_user.id, "my_account_patterns"))
    if existing:
        await db.delete(existing)
    await db.commit()
    return {"status": "deleted"}


# ============== Share rules (auto-split of shared expenses) ==============
# Pravidlo "nájem → moje část 50 %": nové transakce odpovídající patternu
# dostanou my_share_amount automaticky při syncu; při založení se pravidlo
# aplikuje i zpětně na existující výdaje bez ručního rozdělení.

class ShareRuleRequest(BaseModel):
    pattern: str
    my_percentage: Optional[float] = None      # 0-100
    my_amount_override: Optional[float] = None  # pevná moje část v Kč (přednost)
    counterparty: Optional[str] = None          # kdo dluží zbytek ("Žena")
    note: Optional[str] = None
    apply_retroactively: bool = True


def _share_rule_response(rule: ShareRuleModel) -> dict:
    return {
        "id": rule.id,
        "pattern": rule.pattern,
        "my_percentage": rule.my_percentage,
        "my_amount_override": rule.my_amount_override,
        "counterparty": rule.counterparty,
        "note": rule.note,
        "is_active": rule.is_active,
        "match_count": rule.match_count,
    }


@router.get("/share-rules")
async def get_share_rules(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pravidla automatického dělení výdajů"""
    result = await db.execute(
        select(ShareRuleModel)
        .where(ShareRuleModel.user_id == current_user.id)
        .order_by(ShareRuleModel.match_count.desc())
    )
    return {"rules": [_share_rule_response(r) for r in result.scalars().all()]}


@router.post("/share-rules")
async def create_share_rule(
    request: ShareRuleRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Založit pravidlo dělení a (volitelně) aplikovat zpětně na existující výdaje"""
    pattern = request.pattern.lower().strip()
    if len(pattern) < 3:
        raise HTTPException(status_code=400, detail="Pattern must be at least 3 characters")
    if request.my_amount_override is None and request.my_percentage is None:
        raise HTTPException(status_code=400, detail="Set my_percentage or my_amount_override")
    if request.my_percentage is not None and not (0 <= request.my_percentage <= 100):
        raise HTTPException(status_code=400, detail="my_percentage must be between 0 and 100")
    if request.my_amount_override is not None and request.my_amount_override < 0:
        raise HTTPException(status_code=400, detail="my_amount_override must not be negative")

    existing = await db.execute(
        select(ShareRuleModel).where(
            ShareRuleModel.user_id == current_user.id,
            ShareRuleModel.pattern == pattern,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Rule with this pattern already exists")

    rule = ShareRuleModel(
        user_id=current_user.id,
        pattern=pattern,
        my_percentage=request.my_percentage,
        my_amount_override=request.my_amount_override,
        counterparty=(request.counterparty or "").strip() or None,
        note=(request.note or "").strip() or None,
    )
    db.add(rule)

    applied = 0
    if request.apply_retroactively:
        # Jen normální bankovní výdaje bez ručního rozdělení — ruční hodnoty nepřepisujeme.
        like = f"%{pattern}%"
        retro = await db.execute(
            select(TransactionModel).where(
                and_(
                    TransactionModel.user_id == current_user.id,
                    TransactionModel.account_type == "bank",
                    TransactionModel.amount < 0,
                    TransactionModel.transaction_type == "normal",
                    TransactionModel.is_excluded.isnot(True),
                    TransactionModel.settlement_flag.isnot(True),
                    TransactionModel.my_share_amount.is_(None),
                    or_(
                        TransactionModel.description.ilike(like),
                        TransactionModel.raw_json.ilike(like),
                    ),
                )
            )
        )
        for tx in retro.scalars():
            tx.my_share_amount = compute_my_share(tx.amount, rule)
            if rule.counterparty and not tx.share_counterparty:
                tx.share_counterparty = rule.counterparty
            if rule.note and not tx.settlement_note:
                tx.settlement_note = rule.note
            applied += 1
        rule.match_count = applied

    await db.commit()
    await db.refresh(rule)
    return {"rule": _share_rule_response(rule), "applied_to": applied}


@router.delete("/share-rules/{rule_id}")
async def delete_share_rule(
    rule_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat pravidlo dělení (už rozdělené transakce zůstávají rozdělené)"""
    result = await db.execute(
        select(ShareRuleModel).where(
            ShareRuleModel.id == rule_id,
            ShareRuleModel.user_id == current_user.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"status": "deleted", "id": rule_id}


# ============== Transfer-excluded accounts (credit card etc.) ==============
# Own accounts that must NOT be treated as "mine" by internal transfer detection.
# Typical case: credit card — sending money there is repayment, i.e. a real
# expense, not a transfer between own accounts.

class TransferExcludedAccountsRequest(BaseModel):
    accounts: list[str]


@router.get("/transfer-excluded-accounts")
async def get_transfer_excluded_accounts(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get accounts (numbers/IBANs) excluded from internal transfer detection"""
    import json
    accounts_json = await get_setting(db, current_user.id, "transfer_excluded_accounts")
    accounts = json.loads(accounts_json) if accounts_json else []
    return {"accounts": accounts}


@router.post("/transfer-excluded-accounts")
async def save_transfer_excluded_accounts(
    request: TransferExcludedAccountsRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save accounts excluded from internal transfer detection"""
    import json
    clean_accounts = [a.strip() for a in request.accounts if a.strip()]
    await set_setting(db, current_user.id, "transfer_excluded_accounts", json.dumps(clean_accounts))
    await db.commit()
    return {"status": "saved", "accounts": clean_accounts}
