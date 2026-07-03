import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from auth import get_current_user
from database import get_db
from models import TransactionModel, AccountModel, CategoryRuleModel, ContactModel, UserModel, TagModel, TransactionTagModel
from routers.contacts import normalize_iban

router = APIRouter()


class TransactionTag(BaseModel):
    id: int
    name: str
    color: Optional[str] = None


class Transaction(BaseModel):
    id: str
    date: str
    description: str
    amount: float
    currency: str
    category: Optional[str] = None
    account_id: str
    account_type: str  # "bank" or "investment"
    account_name: Optional[str] = None
    transaction_type: str = "normal"  # "normal", "internal_transfer", "family_transfer"
    is_excluded: bool = False
    my_share_amount: Optional[float] = None  # my part of a shared expense; aggregations use it instead of amount
    settlement_flag: bool = False  # incoming settlement transfer (repayment) — excluded from income
    settlement_note: Optional[str] = None
    share_counterparty: Optional[str] = None  # who owes / repaid ("Žena", "Sestra"…)
    creditor_name: Optional[str] = None  # From raw_json creditorName (or contacts fallback)
    debtor_name: Optional[str] = None  # From raw_json debtorName (or contacts fallback)
    creditor_iban: Optional[str] = None  # Normalized IBAN, used for inline rename in UI
    debtor_iban: Optional[str] = None
    counterparty_name_source: Optional[str] = None  # "bank" | "contact_auto" | "contact_manual" | None
    tags: List[TransactionTag] = []


class PaginatedTransactions(BaseModel):
    items: List[Transaction]
    total: int
    page: int
    size: int
    pages: int


@router.get("/", response_model=PaginatedTransactions)
async def get_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    search: Optional[str] = None,
    category: Optional[str] = None,
    account_id: Optional[str] = None,
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    amount_type: Optional[str] = Query(None, description="income, expense, or all"),
    tag_id: Optional[int] = Query(None, description="only transactions carrying this tag"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get paginated transactions with filtering"""

    query = select(TransactionModel, AccountModel.name).join(AccountModel, TransactionModel.account_id == AccountModel.id)

    # Hidden accounts are excluded from the financial picture entirely — their
    # transactions must not surface anywhere.
    conditions = [TransactionModel.user_id == current_user.id, AccountModel.is_visible == True]
    if date_from:
        conditions.append(TransactionModel.date >= date_from)
    if date_to:
        conditions.append(TransactionModel.date <= date_to)
    if account_id:
        conditions.append(TransactionModel.account_id == account_id)
    if category:
        conditions.append(TransactionModel.category == category)
    if search:
        search_term = f"%{search}%"
        # Match against description, raw_json (covers counterparty name/IBAN from bank),
        # and account name. Lets users find e.g. "PPF" by counterparty rather than only description.
        conditions.append(or_(
            TransactionModel.description.ilike(search_term),
            TransactionModel.raw_json.ilike(search_term),
            AccountModel.name.ilike(search_term),
        ))
    if amount_type == "income":
        conditions.append(TransactionModel.amount > 0)
    elif amount_type == "expense":
        conditions.append(TransactionModel.amount < 0)
    if tag_id is not None:
        conditions.append(
            select(TransactionTagModel.tag_id)
            .where(
                TransactionTagModel.transaction_id == TransactionModel.id,
                TransactionTagModel.tag_id == tag_id,
            )
            .exists()
        )

    query = query.where(and_(*conditions))
    
    # Count total
    from sqlalchemy import func
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Pagination
    pages = (total + limit - 1) // limit
    offset = (page - 1) * limit
    
    query = query.order_by(TransactionModel.date.desc()).offset(offset).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()

    # Bulk-load tags for the whole page (one query instead of N)
    tags_by_tx: dict[str, list[TransactionTag]] = {}
    tx_ids = [tx.id for tx, _ in rows]
    if tx_ids:
        tag_rows = await db.execute(
            select(TransactionTagModel.transaction_id, TagModel)
            .join(TagModel, TagModel.id == TransactionTagModel.tag_id)
            .where(TransactionTagModel.transaction_id.in_(tx_ids))
        )
        for tx_id, tag in tag_rows.all():
            tags_by_tx.setdefault(tx_id, []).append(
                TransactionTag(id=tag.id, name=tag.name, color=tag.color)
            )

    # Pre-parse raw_json once per row so we can bulk-lookup missing names in contacts.
    parsed = []
    needed_ibans: set[str] = set()
    for tx, account_name in rows:
        raw: dict = {}
        if tx.raw_json:
            try:
                raw = json.loads(tx.raw_json) or {}
            except Exception:
                raw = {}
        creditor_name = raw.get("creditorName")
        debtor_name = raw.get("debtorName")
        creditor_iban = normalize_iban((raw.get("creditorAccount") or {}).get("iban") or (raw.get("creditorAccount") or {}).get("bban"))
        debtor_iban = normalize_iban((raw.get("debtorAccount") or {}).get("iban") or (raw.get("debtorAccount") or {}).get("bban"))

        if not creditor_name and creditor_iban:
            needed_ibans.add(creditor_iban)
        if not debtor_name and debtor_iban:
            needed_ibans.add(debtor_iban)

        parsed.append((tx, account_name, creditor_name, debtor_name, creditor_iban, debtor_iban))

    contacts_by_iban: dict[str, ContactModel] = {}
    if needed_ibans:
        contact_rows = await db.execute(
            select(ContactModel).where(
                ContactModel.user_id == current_user.id,
                ContactModel.iban.in_(list(needed_ibans)),
            )
        )
        contacts_by_iban = {c.iban: c for c in contact_rows.scalars().all()}

    items = []
    for tx, account_name, creditor_name, debtor_name, creditor_iban, debtor_iban in parsed:
        name_source: Optional[str] = None
        if tx.amount < 0:
            # Outgoing — counterparty is creditor
            if creditor_name:
                name_source = "bank"
            elif creditor_iban and creditor_iban in contacts_by_iban:
                c = contacts_by_iban[creditor_iban]
                creditor_name = c.name
                name_source = f"contact_{c.source}"
        else:
            # Incoming — counterparty is debtor
            if debtor_name:
                name_source = "bank"
            elif debtor_iban and debtor_iban in contacts_by_iban:
                c = contacts_by_iban[debtor_iban]
                debtor_name = c.name
                name_source = f"contact_{c.source}"

        items.append(Transaction(
            id=tx.id,
            date=tx.date,
            description=tx.description,
            amount=tx.amount,
            currency=tx.currency,
            category=tx.category,
            account_id=tx.account_id,
            account_type=tx.account_type,
            account_name=account_name,
            transaction_type=tx.transaction_type or "normal",
            is_excluded=tx.is_excluded or False,
            my_share_amount=tx.my_share_amount,
            settlement_flag=tx.settlement_flag or False,
            settlement_note=tx.settlement_note,
            share_counterparty=tx.share_counterparty,
            creditor_name=creditor_name,
            debtor_name=debtor_name,
            creditor_iban=creditor_iban,
            debtor_iban=debtor_iban,
            counterparty_name_source=name_source,
            tags=tags_by_tx.get(tx.id, []),
        ))

    return PaginatedTransactions(
        items=items,
        total=total,
        page=page,
        size=limit,
        pages=pages
    )


@router.get("/settlement-summary")
async def get_settlement_summary(
    months: int = Query(12, ge=1, le=36),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Saldo vypořádání (VYLEPSENI.md 3.1): kolik mi protistrany dluží
    (jejich podíly na rozdělených výdajích) vs. kolik už poslaly (vypořádání).
    """
    visible_accounts = select(AccountModel.id).where(
        AccountModel.user_id == current_user.id,
        AccountModel.is_visible == True,
    )
    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.account_type == "bank",
            TransactionModel.account_id.in_(visible_accounts),
            or_(
                and_(TransactionModel.my_share_amount.isnot(None), TransactionModel.amount < 0),
                and_(TransactionModel.settlement_flag == True, TransactionModel.amount > 0),  # noqa: E712
            ),
        ).order_by(TransactionModel.date.desc())
    )
    txs = result.scalars().all()

    def tx_snippet(tx, their_amount=None):
        return {
            "id": tx.id,
            "date": tx.date,
            "description": tx.description,
            "amount": tx.amount,
            "currency": tx.currency,
            "category": tx.category,
            "my_share_amount": tx.my_share_amount,
            "their_amount": their_amount,
            "note": tx.settlement_note,
            "counterparty": tx.share_counterparty,
        }

    total_owed = 0.0
    total_received = 0.0
    by_month: dict[str, dict] = {}
    by_cp: dict[str, dict] = {}
    expenses = []
    settlements = []

    for tx in txs:
        month = (tx.date or "")[:7]
        cp = tx.share_counterparty or ""
        month_row = by_month.setdefault(month, {"owed": 0.0, "received": 0.0})
        cp_row = by_cp.setdefault(cp, {"owed": 0.0, "received": 0.0})

        if tx.amount < 0 and tx.my_share_amount is not None:
            their = max(abs(tx.amount) - min(tx.my_share_amount, abs(tx.amount)), 0.0)
            total_owed += their
            month_row["owed"] += their
            cp_row["owed"] += their
            if len(expenses) < 30:
                expenses.append(tx_snippet(tx, their_amount=round(their, 2)))
        else:
            total_received += tx.amount
            month_row["received"] += tx.amount
            cp_row["received"] += tx.amount
            if len(settlements) < 30:
                settlements.append(tx_snippet(tx))

    # Souvislá řada posledních N měsíců (i prázdné), nejstarší první — pro graf
    today = datetime.now()
    month_series = []
    for i in range(months - 1, -1, -1):
        y, m = today.year, today.month - i
        while m <= 0:
            y, m = y - 1, m + 12
        key = f"{y:04d}-{m:02d}"
        row = by_month.get(key, {"owed": 0.0, "received": 0.0})
        month_series.append({
            "month": key,
            "owed": round(row["owed"], 2),
            "received": round(row["received"], 2),
        })

    return {
        "total_owed": round(total_owed, 2),
        "total_received": round(total_received, 2),
        "balance": round(total_owed - total_received, 2),
        "counterparties": [
            {
                "name": name or None,
                "owed": round(row["owed"], 2),
                "received": round(row["received"], 2),
                "balance": round(row["owed"] - row["received"], 2),
            }
            for name, row in sorted(by_cp.items(), key=lambda kv: kv[1]["owed"], reverse=True)
        ],
        "months": month_series,
        "expenses": expenses,
        "settlements": settlements,
        "currency": "CZK",
    }


def categorize_transaction(tx: dict) -> str:
    """Simple category detection based on description"""
    desc = (tx.get("remittanceInformationUnstructured", "") or 
            tx.get("creditorName", "") or 
            tx.get("debtorName", "")).lower()
    
    categories = {
        "food": ["lidl", "albert", "tesco", "billa", "kaufland", "restaurant", "bistro", "food"],
        "transport": ["uber", "bolt", "benzina", "orlen", "mhd", "jízdenka", "prague transport"],
        "utilities": ["čez", "pražské vodovody", "innogy", "vodafone", "t-mobile", "o2"],
        "entertainment": ["netflix", "spotify", "cinema", "hbo", "disney"],
        "shopping": ["amazon", "alza", "mall.cz", "czc", "datart"],
        "salary": ["mzda", "plat", "salary", "výplata"],
    }
    
    for category, keywords in categories.items():
        if any(kw in desc for kw in keywords):
            return category.capitalize()
    
    return "Other"


@router.get("/")
async def get_category_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get spending by category from database.

    Note: shadowed by the paginated `get_transactions` above (same path) — kept
    for legacy reasons but never reached by the router.
    """
    transactions = await get_transactions(date_from, date_to, limit=500, db=db)
    
    categories = {}
    for tx in transactions:
        if tx.amount < 0:  # Only expenses
            cat = tx.category or "Other"
            if cat not in categories:
                categories[cat] = 0
            categories[cat] += abs(tx.amount)
    
    return {"categories": categories}


class CategoryUpdate(BaseModel):
    category: str
    learn: bool = True  # If true, create a rule for this merchant


@router.patch("/{transaction_id}/category")
async def update_transaction_category(
    transaction_id: str,
    data: CategoryUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update transaction category and optionally learn the mapping"""

    tx_result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.id == transaction_id,
            TransactionModel.user_id == current_user.id,
        )
    )
    tx = tx_result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    old_category = tx.category
    tx.category = data.category
    
    # Set is_excluded flag based on category type
    excluded_categories = ["Internal Transfer", "Family Transfer"]
    tx.is_excluded = data.category in excluded_categories
    
    # Also update transaction_type if changing to transfer category
    if data.category == "Internal Transfer":
        tx.transaction_type = "internal_transfer"
    elif data.category == "Family Transfer":
        tx.transaction_type = "family_transfer"
    elif tx.transaction_type in ["internal_transfer", "family_transfer"]:
        # Reset to normal if changing away from transfer
        tx.transaction_type = "normal"
    
    # Extract merchant name for learning.
    # NEVER learn rules for transfer categories: transfers are detected reliably
    # by IBAN matching, while a name pattern (typically the user's OWN name,
    # which every incoming payment without a message gets as description) would
    # retroactively exclude unrelated payments — this exact bug once hid the
    # credit-card repayments and sister's payments (rule "bureš nicolas").
    learnable = data.category not in excluded_categories
    if data.learn and learnable and tx.description:
        # Prefer creditorName from raw_json — it's cleaner than the full description
        # (e.g. "Lidl" instead of "Nákup 5465LIDL CZ S.R.O BRNO ref 12345678")
        pattern = None
        if tx.raw_json:
            try:
                raw = json.loads(tx.raw_json)
                creditor = (raw.get("creditorName") or "").strip()
                if creditor and len(creditor) >= 3:
                    pattern = creditor.lower()
            except Exception:
                pass

        if not pattern:
            pattern = tx.description.lower().strip()

        # Check if rule already exists for this pattern (per-user)
        existing = await db.execute(
            select(CategoryRuleModel).where(
                CategoryRuleModel.user_id == current_user.id,
                CategoryRuleModel.pattern == pattern,
            )
        )
        existing_rule = existing.scalar_one_or_none()

        if existing_rule:
            # Update existing rule — user explicitly chose a category, so promote to user-defined
            existing_rule.category = data.category
            existing_rule.is_user_defined = True
            existing_rule.match_count += 1
        else:
            rule = CategoryRuleModel(
                user_id=current_user.id,
                pattern=pattern,
                category=data.category,
                is_user_defined=True,   # User explicitly set this
                match_count=1,
            )
            db.add(rule)

        # Retroactive: apply the rule to all existing transactions matching this pattern
        # so past Billa transactions become Supermarkets too — not just future ones.
        # Match against description OR raw_json (covers creditorName from bank).
        like_pattern = f"%{pattern}%"
        retro_result = await db.execute(
            select(TransactionModel).where(
                and_(
                    TransactionModel.user_id == current_user.id,
                    TransactionModel.id != transaction_id,
                    or_(
                        TransactionModel.description.ilike(like_pattern),
                        TransactionModel.raw_json.ilike(like_pattern),
                    ),
                )
            )
        )
        for matching_tx in retro_result.scalars():
            matching_tx.category = data.category
            matching_tx.is_excluded = data.category in excluded_categories
            if data.category == "Internal Transfer":
                matching_tx.transaction_type = "internal_transfer"
            elif data.category == "Family Transfer":
                matching_tx.transaction_type = "family_transfer"
            elif matching_tx.transaction_type in ["internal_transfer", "family_transfer"]:
                matching_tx.transaction_type = "normal"

    await db.commit()
    
    return {
        "id": transaction_id,
        "old_category": old_category,
        "new_category": data.category,
        "is_excluded": tx.is_excluded,
        "rule_created": data.learn and learnable
    }


class TagAssignment(BaseModel):
    tag_ids: List[int]


@router.put("/{transaction_id}/tags")
async def set_transaction_tags(
    transaction_id: str,
    data: TagAssignment,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Replace the transaction's tag set with the given tag ids."""
    from sqlalchemy import delete as sa_delete

    tx_result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.id == transaction_id,
            TransactionModel.user_id == current_user.id,
        )
    )
    if not tx_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Transaction not found")

    tags: list[TagModel] = []
    if data.tag_ids:
        tag_result = await db.execute(
            select(TagModel).where(
                TagModel.user_id == current_user.id,
                TagModel.id.in_(data.tag_ids),
            )
        )
        tags = list(tag_result.scalars())
        if len(tags) != len(set(data.tag_ids)):
            raise HTTPException(status_code=400, detail="Unknown tag id")

    await db.execute(
        sa_delete(TransactionTagModel).where(TransactionTagModel.transaction_id == transaction_id)
    )
    for tag in tags:
        db.add(TransactionTagModel(transaction_id=transaction_id, tag_id=tag.id))
    await db.commit()

    return {
        "id": transaction_id,
        "tags": [TransactionTag(id=t.id, name=t.name, color=t.color) for t in tags],
    }


@router.get("/{transaction_id}")
async def get_transaction_detail(
    transaction_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get full transaction detail including raw bank data"""
    result = await db.execute(
        select(TransactionModel, AccountModel.name.label("account_name"))
        .join(AccountModel, TransactionModel.account_id == AccountModel.id, isouter=True)
        .where(
            TransactionModel.id == transaction_id,
            TransactionModel.user_id == current_user.id,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    tx, account_name = row

    raw = {}
    if tx.raw_json:
        try:
            raw = json.loads(tx.raw_json)
        except Exception:
            pass

    # Extract creditor/debtor account numbers
    creditor_acc = raw.get("creditorAccount") or {}
    debtor_acc = raw.get("debtorAccount") or {}
    balance_after = raw.get("balanceAfterTransaction") or {}
    balance_amount = balance_after.get("balanceAmount") or {}

    currency_exchange = raw.get("currencyExchange") or []
    fx = currency_exchange[0] if currency_exchange else {}

    creditor_name = raw.get("creditorName")
    debtor_name = raw.get("debtorName")
    creditor_iban = normalize_iban(creditor_acc.get("iban") or creditor_acc.get("bban"))
    debtor_iban = normalize_iban(debtor_acc.get("iban") or debtor_acc.get("bban"))

    # Fallback: look up missing counterparty names in the contacts table.
    name_source: Optional[str] = None
    is_outgoing = (tx.amount or 0) < 0
    if is_outgoing:
        if creditor_name:
            name_source = "bank"
        elif creditor_iban:
            contact = await db.get(ContactModel, (current_user.id, creditor_iban))
            if contact:
                creditor_name = contact.name
                name_source = f"contact_{contact.source}"
    else:
        if debtor_name:
            name_source = "bank"
        elif debtor_iban:
            contact = await db.get(ContactModel, (current_user.id, debtor_iban))
            if contact:
                debtor_name = contact.name
                name_source = f"contact_{contact.source}"

    return {
        "id": tx.id,
        "date": tx.date,
        "value_date": raw.get("valueDate"),
        "booking_date_time": raw.get("bookingDateTime"),
        "description": tx.description,
        "amount": tx.amount,
        "currency": tx.currency,
        "category": tx.category,
        "account_id": tx.account_id,
        "account_name": account_name,
        "account_type": tx.account_type,
        "transaction_type": tx.transaction_type,
        "is_excluded": tx.is_excluded,
        "my_share_amount": tx.my_share_amount,
        "settlement_flag": tx.settlement_flag or False,
        "settlement_note": tx.settlement_note,
        "share_counterparty": tx.share_counterparty,
        "creditor_name": creditor_name,
        "debtor_name": debtor_name,
        "creditor_iban": creditor_iban,
        "debtor_iban": debtor_iban,
        "counterparty_name_source": name_source,
        "remittance_info": raw.get("remittanceInformationUnstructured") or raw.get("remittanceInformationStructured"),
        "end_to_end_id": raw.get("endToEndId"),
        "bank_tx_code": raw.get("proprietaryBankTransactionCode") or raw.get("bankTransactionCode"),
        "additional_info": raw.get("additionalInformation"),
        "balance_after": float(balance_amount["amount"]) if balance_amount.get("amount") else None,
        "balance_after_currency": balance_amount.get("currency"),
        "fx_rate": fx.get("exchangeRate"),
        "fx_source_currency": fx.get("sourceCurrency"),
        "fx_target_currency": fx.get("targetCurrency"),
    }


@router.get("/available-categories")
async def get_available_categories():
    """Get list of available categories"""
    return {
        "categories": [
            {"value": "Food", "label": "🍔 Jídlo"},
            {"value": "Transport", "label": "🚗 Doprava"},
            {"value": "Utilities", "label": "💡 Energie & Služby"},
            {"value": "Entertainment", "label": "🎬 Zábava"},
            {"value": "Shopping", "label": "🛒 Nákupy"},
            {"value": "Health", "label": "🏥 Zdraví"},
            {"value": "Salary", "label": "💰 Příjem"},
            {"value": "Investment", "label": "📈 Investice"},
            {"value": "Internal Transfer", "label": "🔄 Interní převod"},
            {"value": "Family Transfer", "label": "👨‍👩‍👧 Rodinný převod"},
            {"value": "Other", "label": "📦 Ostatní"},
        ]
    }


class TransactionTypeUpdate(BaseModel):
    transaction_type: str  # "normal", "internal_transfer", "family_transfer"


@router.patch("/{transaction_id}/type")
async def update_transaction_type(
    transaction_id: str,
    data: TransactionTypeUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update transaction type (normal, internal_transfer, family_transfer)"""

    valid_types = ["normal", "internal_transfer", "family_transfer"]
    if data.transaction_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {valid_types}")

    tx_result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.id == transaction_id,
            TransactionModel.user_id == current_user.id,
        )
    )
    tx = tx_result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    old_type = tx.transaction_type
    tx.transaction_type = data.transaction_type
    tx.is_excluded = data.transaction_type != "normal"
    
    # Update category based on type
    if data.transaction_type == "internal_transfer":
        tx.category = "Internal Transfer"
    elif data.transaction_type == "family_transfer":
        tx.category = "Family Transfer"
    
    await db.commit()
    
    return {
        "id": transaction_id,
        "old_type": old_type,
        "new_type": data.transaction_type,
        "is_excluded": tx.is_excluded
    }


class ShareUpdate(BaseModel):
    """Full desired state of the shared-cost fields — not a partial patch.

    - `my_share_amount` set on an EXPENSE = only this part counts as my spending
      (the rest is owed by the counterparty). None clears the split.
    - `settlement_flag` set on an INCOME = the transfer is a settlement (repayment),
      not real income, so it stays out of income aggregations.
    - `share_counterparty` = who owes / repaid ("Žena", "Sestra"…), optional.
    """
    my_share_amount: Optional[float] = None
    settlement_flag: bool = False
    settlement_note: Optional[str] = None
    share_counterparty: Optional[str] = None


@router.patch("/{transaction_id}/share")
async def update_transaction_share(
    transaction_id: str,
    data: ShareUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set shared-cost split / settlement flag on a transaction (VYLEPSENI.md 3.1)"""

    tx_result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.id == transaction_id,
            TransactionModel.user_id == current_user.id,
        )
    )
    tx = tx_result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if data.my_share_amount is not None:
        if tx.amount >= 0:
            raise HTTPException(status_code=400, detail="my_share_amount can only be set on an expense")
        if data.my_share_amount < 0 or data.my_share_amount > abs(tx.amount):
            raise HTTPException(
                status_code=400,
                detail=f"my_share_amount must be between 0 and {abs(tx.amount)}",
            )
    if data.settlement_flag and tx.amount <= 0:
        raise HTTPException(status_code=400, detail="settlement_flag can only be set on an incoming transaction")

    tx.my_share_amount = data.my_share_amount
    tx.settlement_flag = data.settlement_flag
    note = (data.settlement_note or "").strip()
    tx.settlement_note = note or None
    counterparty = (data.share_counterparty or "").strip()
    tx.share_counterparty = counterparty or None

    # An incoming transfer auto-marked as family_transfer (wife's IBAN/pattern)
    # that the user marks as settlement gets normalized back to a normal
    # transaction — settlement_flag alone keeps it out of income, and the
    # settlement summary can count it as "received".
    if data.settlement_flag and tx.transaction_type != "normal":
        tx.transaction_type = "normal"
        tx.is_excluded = False
        if tx.category in ("Internal Transfer", "Family Transfer"):
            tx.category = "Other"

    await db.commit()

    return {
        "id": transaction_id,
        "my_share_amount": tx.my_share_amount,
        "settlement_flag": tx.settlement_flag,
        "settlement_note": tx.settlement_note,
        "share_counterparty": tx.share_counterparty,
        "transaction_type": tx.transaction_type,
        "is_excluded": tx.is_excluded,
        "category": tx.category,
    }


@router.get("/types")
async def get_transaction_types():
    """Get available transaction types"""
    return {
        "types": [
            {"value": "normal", "label": "Běžná transakce", "icon": "💳"},
            {"value": "internal_transfer", "label": "Interní převod", "icon": "🔄"},
            {"value": "family_transfer", "label": "Rodinný převod", "icon": "👨‍👩‍👧"},
        ]
    }
