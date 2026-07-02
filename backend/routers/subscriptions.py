"""Subscriptions router — přehled předplatných (opakovaných plateb).

Předplatné je definované patternem (merchant_pattern) — poslední platba, příští
obnovení, zdražení a „možná zrušené" se počítají živě z transakcí, nic se
neduplikuje do DB.

Detekce (/detect) projde historii odchozích plateb, seskupí je podle protistrany
(creditorName z raw_json, fallback normalizovaný popis) a hledá skupiny
s pravidelným intervalem (~měsíc / kvartál / rok) a konzistentní částkou.
"""
import json
import re
from datetime import date, datetime
from statistics import median
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import SubscriptionModel, TransactionModel, UserModel

router = APIRouter()

VALID_PERIODS = ("monthly", "quarterly", "yearly")
PERIOD_MONTHS = {"monthly": 1, "quarterly": 3, "yearly": 12}

# Detekční pásma: (perioda, min. interval dní, max. interval dní, min. počet plateb)
DETECTION_BANDS = [
    ("monthly", 25, 36, 3),
    ("quarterly", 80, 102, 3),
    ("yearly", 330, 400, 2),
]
# Podíl intervalů, které musí padnout do pásma, aby skupina platila za pravidelnou
INTERVAL_CONSISTENCY = 0.6
# Podíl plateb, jejichž částka musí být do ±25 % mediánu (předplatné ≈ stálá cena)
AMOUNT_CONSISTENCY = 0.7
AMOUNT_TOLERANCE = 0.25


# === Date/merchant helpers ===

def _add_months(d: date, months: int) -> date:
    """Add N months, clamping the day to the target month's length."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    if month == 12:
        next_first = date(year + 1, 1, 1)
    else:
        next_first = date(year, month + 1, 1)
    last_day = (next_first - date(year, month, 1)).days
    return date(year, month, min(d.day, last_day))


def _parse_date(s: str) -> Optional[date]:
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _normalize_merchant(s: str) -> str:
    """Grouping key from a counterparty/description string.

    Strips date fragments and long reference numbers but keeps short digits
    (O2, Trading 212) so the key stays a substring of the original text and
    ILIKE matching keeps working.
    """
    s = (s or "").lower().strip()
    s = re.sub(r"\b\d{1,2}\.\s?\d{1,2}\.(\s?\d{2,4})?\b", " ", s)  # 12.5.2026
    s = re.sub(r"\d{4,}", " ", s)                                   # ref. čísla
    s = re.sub(r"\s+", " ", s).strip()
    return s[:60]


# Card/transfer descriptors often rotate a secondary detail between charges —
# a city one month, a phone/reference number the next — while the brand name
# itself stays put (e.g. "NETFLIX.COM Amsterdam NL" vs "NETFLIX.COM
# 408-724-9160 NL"). Matching the whole descriptor as one substring silently
# drops every charge that used the "other" variant. Anchoring on just the
# single most distinctive token survives that rotation.
_PURE_DIGIT_HYPHEN_RE = re.compile(r"^[\d\-]+$")
_GEO_CODE_RE = re.compile(r"^[a-z]{2}$")
_COMMON_GEO_WORDS = {
    "amsterdam", "prague", "praha", "london", "dublin", "berlin",
    "luxembourg", "paris", "madrid", "vienna", "wien", "zurich",
    "bratislava", "warszawa", "warsaw", "budapest", "brno", "ostrava",
}


def _primary_token(text: str) -> str:
    """Extract the single most distinctive token from a merchant pattern.

    Picks the longest token that isn't a country code, a digit/reference
    group, or a common city name. Falls back to the original text if nothing
    survives the filter (e.g. a pattern that's just a country code).
    """
    tokens = [t for t in re.split(r"[^a-z0-9.\-]+", text.lower()) if t]
    candidates = [
        t for t in tokens
        if len(t) >= 4
        and not _PURE_DIGIT_HYPHEN_RE.match(t)
        and not _GEO_CODE_RE.match(t)
        and t not in _COMMON_GEO_WORDS
    ]
    return max(candidates, key=len) if candidates else text


# === Pydantic schemas ===

class SubscriptionCreate(BaseModel):
    name: str
    merchant_pattern: str
    amount: float
    currency: str = "CZK"
    period: str = "monthly"
    category: Optional[str] = None
    first_seen_date: Optional[str] = None
    note: Optional[str] = None
    my_percentage: Optional[int] = 100
    my_amount_override: Optional[float] = None


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    merchant_pattern: Optional[str] = None
    amount: Optional[float] = None
    period: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None
    is_active: Optional[bool] = None
    my_percentage: Optional[int] = None
    my_amount_override: Optional[float] = None


class SubscriptionResponse(BaseModel):
    id: int
    name: str
    merchant_pattern: str
    amount: float
    currency: str
    period: str
    category: Optional[str]
    first_seen_date: Optional[str]
    note: Optional[str]
    is_active: bool
    # Sdílené předplatné — kolik z `amount` reálně platím já
    my_percentage: int = 100
    my_amount_override: Optional[float] = None
    my_amount: float = 0            # efektivní moje část za periodu
    # Živě dopočítané z transakcí:
    monthly_equivalent: float       # celková částka/měsíc (co odchází z karty)
    yearly_cost: float              # celková částka/rok
    my_monthly_equivalent: float = 0   # moje část/měsíc
    my_yearly_cost: float = 0          # moje část/rok
    last_charged_date: Optional[str] = None
    last_amount: Optional[float] = None
    charges_count: int = 0
    next_due_date: Optional[str] = None
    renewing_soon: bool = False          # obnovení do 7 dní
    is_stale: bool = False               # >2 periody bez platby → možná zrušené
    price_change_from: Optional[float] = None  # předposlední cena, pokud se liší
    price_change_to: Optional[float] = None


class DetectedSubscription(BaseModel):
    name: str
    merchant_pattern: str
    amount: float
    currency: str = "CZK"
    period: str
    category: Optional[str] = None
    occurrences: int
    avg_interval_days: int
    first_seen_date: str
    last_charged_date: str
    next_due_estimate: str


# === Enrichment ===

def _monthly_equivalent(amount: float, period: str) -> float:
    return round(amount / PERIOD_MONTHS.get(period, 1), 2)


def _my_amount(sub: SubscriptionModel) -> float:
    """Efektivní částka za periodu, kterou reálně platím já (sdílené předplatné)."""
    if sub.my_amount_override is not None:
        return sub.my_amount_override
    pct = sub.my_percentage if sub.my_percentage is not None else 100
    return round(sub.amount * pct / 100, 2)


async def _load_charges(
    db: AsyncSession, user_id: int, pattern: str
) -> list[tuple[str, float]]:
    """Odchozí platby odpovídající patternu — [(date, abs_amount)], nejnovější první.

    Matchuje jen na `_primary_token(pattern)`, ne na celý uložený pattern —
    tím to funguje i pro už dřív uložená předplatná se „širokým" patternem
    (obsahujícím rotující město/telefon), aniž by bylo potřeba je opravovat v DB.
    """
    like = f"%{_primary_token(pattern)}%"
    result = await db.execute(
        select(TransactionModel.date, TransactionModel.amount)
        .where(
            and_(
                TransactionModel.user_id == user_id,
                TransactionModel.account_type == "bank",
                TransactionModel.amount < 0,
                TransactionModel.is_excluded == False,  # noqa: E712
                or_(
                    TransactionModel.description.ilike(like),
                    TransactionModel.raw_json.ilike(like),
                ),
            )
        )
        .order_by(TransactionModel.date.desc())
        .limit(120)
    )
    return [(row[0], round(abs(row[1]), 2)) for row in result.all()]


def _build_response(sub: SubscriptionModel, charges: list[tuple[str, float]]) -> SubscriptionResponse:
    today = date.today()
    last_date_str: Optional[str] = charges[0][0] if charges else None
    last_amount: Optional[float] = charges[0][1] if charges else None

    next_due: Optional[str] = None
    renewing_soon = False
    is_stale = False
    last_date = _parse_date(last_date_str) if last_date_str else None
    period_months = PERIOD_MONTHS.get(sub.period, 1)
    if last_date:
        due = _add_months(last_date, period_months)
        next_due = due.strftime("%Y-%m-%d")
        renewing_soon = 0 <= (due - today).days <= 7
        # bez platby déle než 2 periody → nejspíš zrušené
        is_stale = (today - last_date).days > 2 * period_months * 31

    # Zdražení/zlevnění: porovnej aktuální cenu s cenou před ní. Badge svítí,
    # dokud je nová cena „čerstvá" (max 3 platby) — pak zhasne.
    price_from = price_to = None
    if len(charges) >= 2 and last_amount is not None:
        streak = 1  # kolik posledních plateb má aktuální cenu
        prev_amount = None
        for _, a in charges[1:]:
            if abs(a - last_amount) < 1.0:
                streak += 1
            else:
                prev_amount = a
                break
        if prev_amount is not None and streak <= 3:
            price_from, price_to = prev_amount, last_amount

    return SubscriptionResponse(
        id=sub.id,
        name=sub.name,
        merchant_pattern=sub.merchant_pattern,
        amount=sub.amount,
        currency=sub.currency,
        period=sub.period,
        category=sub.category,
        first_seen_date=sub.first_seen_date,
        note=sub.note,
        is_active=sub.is_active,
        my_percentage=sub.my_percentage if sub.my_percentage is not None else 100,
        my_amount_override=sub.my_amount_override,
        my_amount=_my_amount(sub),
        monthly_equivalent=_monthly_equivalent(sub.amount, sub.period),
        yearly_cost=round(_monthly_equivalent(sub.amount, sub.period) * 12, 2),
        my_monthly_equivalent=_monthly_equivalent(_my_amount(sub), sub.period),
        my_yearly_cost=round(_monthly_equivalent(_my_amount(sub), sub.period) * 12, 2),
        last_charged_date=last_date_str,
        last_amount=last_amount,
        charges_count=len(charges),
        next_due_date=next_due,
        renewing_soon=renewing_soon,
        is_stale=is_stale,
        price_change_from=price_from,
        price_change_to=price_to,
    )


async def _get_user_subscription(db: AsyncSession, user_id: int, sub_id: int) -> SubscriptionModel:
    result = await db.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.id == sub_id,
            SubscriptionModel.user_id == user_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


# === Endpoints ===

@router.get("/", response_model=List[SubscriptionResponse])
async def get_subscriptions(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seznam předplatných s živě dopočítaným stavem (poslední platba, obnovení, zdražení)."""
    result = await db.execute(
        select(SubscriptionModel)
        .where(SubscriptionModel.user_id == current_user.id)
        .order_by(SubscriptionModel.is_active.desc(), SubscriptionModel.amount.desc())
    )
    subs = list(result.scalars().all())
    out = []
    for sub in subs:
        charges = await _load_charges(db, current_user.id, sub.merchant_pattern)
        out.append(_build_response(sub, charges))
    return out


@router.get("/summary")
async def get_subscriptions_summary(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Souhrn: kolik měsíčně/ročně platím za aktivní předplatná.

    `my_monthly_total`/`my_yearly_total` počítají jen moji reálnou část u
    sdílených předplatných (`my_percentage`/`my_amount_override`) — to je
    hlavní číslo, co mě zajímá. `monthly_total`/`yearly_total` je celková
    částka odcházející z karty (včetně částí ostatních), pro srovnání.
    """
    result = await db.execute(
        select(SubscriptionModel).where(
            SubscriptionModel.user_id == current_user.id,
            SubscriptionModel.is_active == True,  # noqa: E712
        )
    )
    subs = list(result.scalars().all())
    monthly_total = sum(_monthly_equivalent(s.amount, s.period) for s in subs)
    my_monthly_total = sum(_monthly_equivalent(_my_amount(s), s.period) for s in subs)
    return {
        "active_count": len(subs),
        "monthly_total": round(monthly_total, 2),
        "yearly_total": round(monthly_total * 12, 2),
        "my_monthly_total": round(my_monthly_total, 2),
        "my_yearly_total": round(my_monthly_total * 12, 2),
        "currency": "CZK",
    }


@router.get("/detect", response_model=List[DetectedSubscription])
async def detect_subscriptions(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Najdi v historii transakcí opakované platby, které vypadají jako předplatné."""
    # Patterny už sledovaných předplatných — ty z návrhů vynecháme
    existing_result = await db.execute(
        select(SubscriptionModel.merchant_pattern).where(
            SubscriptionModel.user_id == current_user.id
        )
    )
    existing_patterns = [row[0] for row in existing_result.all()]

    tx_result = await db.execute(
        select(
            TransactionModel.date,
            TransactionModel.description,
            TransactionModel.amount,
            TransactionModel.category,
            TransactionModel.raw_json,
        ).where(
            and_(
                TransactionModel.user_id == current_user.id,
                TransactionModel.account_type == "bank",
                TransactionModel.amount < 0,
                TransactionModel.is_excluded == False,  # noqa: E712
                TransactionModel.transaction_type == "normal",
            )
        )
    )
    rows = tx_result.all()

    # Seskupení podle protistrany
    groups: dict[str, dict] = {}
    for tx_date, description, amount, category, raw_json in rows:
        creditor = ""
        if raw_json:
            try:
                creditor = (json.loads(raw_json).get("creditorName") or "").strip()
            except Exception:
                pass
        source = creditor if len(creditor) >= 3 else (description or "")
        # Anchor grouping on the same primary token as _load_charges uses, so
        # rotating-descriptor merchants (city one month, phone number the
        # next) form one group instead of being split into weak, under-the-
        # threshold groups that never reach the occurrence minimum.
        key = _primary_token(_normalize_merchant(source))
        if len(key) < 3:
            continue
        g = groups.setdefault(key, {"display": source.strip(), "charges": [], "categories": {}})
        d = _parse_date(tx_date)
        if not d:
            continue
        g["charges"].append((d, round(abs(amount), 2)))
        if category:
            g["categories"][category] = g["categories"].get(category, 0) + 1

    suggestions: list[DetectedSubscription] = []
    for key, g in groups.items():
        # Už sledované patterny přeskoč (substring v obou směrech)
        if any(p in key or key in p for p in existing_patterns):
            continue

        charges = sorted(set(g["charges"]))  # dedupe + chronologicky
        if len(charges) < 2:
            continue

        intervals = [
            (charges[i + 1][0] - charges[i][0]).days
            for i in range(len(charges) - 1)
        ]
        intervals = [i for i in intervals if i > 0]
        if not intervals:
            continue
        med_interval = median(intervals)

        period = None
        for band_period, lo, hi, min_count in DETECTION_BANDS:
            if lo <= med_interval <= hi and len(charges) >= min_count:
                in_band = sum(1 for i in intervals if lo <= i <= hi)
                if in_band >= max(1, round(INTERVAL_CONSISTENCY * len(intervals))):
                    period = band_period
                    break
        if not period:
            continue

        # Konzistence částek — předplatné má (skoro) stálou cenu
        amounts = [a for _, a in charges]
        med_amount = median(amounts)
        if med_amount <= 0:
            continue
        close = sum(1 for a in amounts if abs(a - med_amount) <= AMOUNT_TOLERANCE * med_amount)
        if close < AMOUNT_CONSISTENCY * len(amounts):
            continue

        last_date, last_amount = charges[-1]
        # Dávno mrtvé vzory nenavrhuj (nic > 2 periody zpátky)
        if (date.today() - last_date).days > 2 * PERIOD_MONTHS[period] * 31:
            continue

        top_category = max(g["categories"], key=g["categories"].get) if g["categories"] else None
        suggestions.append(DetectedSubscription(
            name=g["display"][:60] or key,
            merchant_pattern=key,
            amount=last_amount,
            period=period,
            category=top_category,
            occurrences=len(charges),
            avg_interval_days=int(med_interval),
            first_seen_date=charges[0][0].strftime("%Y-%m-%d"),
            last_charged_date=last_date.strftime("%Y-%m-%d"),
            next_due_estimate=_add_months(last_date, PERIOD_MONTHS[period]).strftime("%Y-%m-%d"),
        ))

    suggestions.sort(key=lambda s: _monthly_equivalent(s.amount, s.period), reverse=True)
    return suggestions


@router.post("/", response_model=SubscriptionResponse)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vytvořit předplatné (ručně nebo potvrzením návrhu z /detect)."""
    if data.period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"period must be one of {VALID_PERIODS}")
    if data.amount <= 0 or not data.name.strip() or not data.merchant_pattern.strip():
        raise HTTPException(status_code=400, detail="name, merchant_pattern and positive amount are required")
    if data.my_percentage is not None and not (0 <= data.my_percentage <= 100):
        raise HTTPException(status_code=400, detail="my_percentage must be between 0 and 100")
    if data.my_amount_override is not None and data.my_amount_override < 0:
        raise HTTPException(status_code=400, detail="my_amount_override must not be negative")

    sub = SubscriptionModel(
        user_id=current_user.id,
        name=data.name.strip(),
        merchant_pattern=data.merchant_pattern.lower().strip(),
        amount=data.amount,
        currency=data.currency,
        period=data.period,
        category=data.category,
        first_seen_date=data.first_seen_date,
        note=data.note,
        my_percentage=data.my_percentage if data.my_percentage is not None else 100,
        my_amount_override=data.my_amount_override,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    charges = await _load_charges(db, current_user.id, sub.merchant_pattern)
    return _build_response(sub, charges)


@router.patch("/{sub_id}", response_model=SubscriptionResponse)
async def update_subscription(
    sub_id: int,
    data: SubscriptionUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upravit předplatné (název, částku, periodu, aktivní/zrušené…)."""
    sub = await _get_user_subscription(db, current_user.id, sub_id)

    if data.period is not None and data.period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"period must be one of {VALID_PERIODS}")
    if data.amount is not None and data.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    if data.my_percentage is not None and not (0 <= data.my_percentage <= 100):
        raise HTTPException(status_code=400, detail="my_percentage must be between 0 and 100")
    if data.my_amount_override is not None and data.my_amount_override < 0:
        raise HTTPException(status_code=400, detail="my_amount_override must not be negative")

    updates = data.model_dump(exclude_unset=True)
    if "merchant_pattern" in updates and updates["merchant_pattern"]:
        updates["merchant_pattern"] = updates["merchant_pattern"].lower().strip()
    for field, value in updates.items():
        setattr(sub, field, value)

    await db.commit()
    await db.refresh(sub)

    charges = await _load_charges(db, current_user.id, sub.merchant_pattern)
    return _build_response(sub, charges)


@router.delete("/{sub_id}")
async def delete_subscription(
    sub_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Smazat předplatné."""
    sub = await _get_user_subscription(db, current_user.id, sub_id)
    await db.delete(sub)
    await db.commit()
    return {"status": "deleted", "id": sub_id}
