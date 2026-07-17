from fastapi import APIRouter, Query, Depends
from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from auth import get_current_user
from database import get_db
from models import AccountModel, TransactionModel, ManualAccountModel, ContactModel, ManualInvestmentAccountModel, CategoryModel, UserModel, TagModel, TransactionTagModel, SettingsModel
from services.exchange_rates import get_exchange_rate
from services.timefmt import utc_iso, utcnow
from routers.contacts import normalize_iban
import json

router = APIRouter()


def _my_expense_amount(tx) -> float:
    """Expense amount that counts as MINE (VYLEPSENI.md 3.1). A shared expense
    with `my_share_amount` set counts only my part — the rest is owed by wife.
    Clamped to the full amount so a stale split can never inflate expenses."""
    full = abs(tx.amount)
    if tx.my_share_amount is not None:
        return min(tx.my_share_amount, full)
    return full


def _build_recent_tx(parsed, contacts_by_iban):
    result = []
    for tx, account_name, creditor_name, debtor_name, creditor_iban, debtor_iban in parsed:
        name_source = None
        if (tx.amount or 0) < 0:
            if creditor_name:
                name_source = "bank"
            elif creditor_iban and creditor_iban in contacts_by_iban:
                c = contacts_by_iban[creditor_iban]
                creditor_name = c.name
                name_source = f"contact_{c.source}"
        else:
            if debtor_name:
                name_source = "bank"
            elif debtor_iban and debtor_iban in contacts_by_iban:
                c = contacts_by_iban[debtor_iban]
                debtor_name = c.name
                name_source = f"contact_{c.source}"
        result.append({
            "id": tx.id,
            "date": tx.date,
            "description": tx.description,
            "amount": tx.amount,
            "currency": tx.currency,
            "category": tx.category,
            "account_id": tx.account_id,
            "account_type": tx.account_type or "bank",
            "account_name": account_name,
            "transaction_type": tx.transaction_type or "normal",
            "is_excluded": tx.is_excluded or False,
            "my_share_amount": tx.my_share_amount,
            "settlement_flag": tx.settlement_flag or False,
            "settlement_note": tx.settlement_note,
            "share_counterparty": tx.share_counterparty,
            "creditor_name": creditor_name,
            "debtor_name": debtor_name,
            "creditor_iban": creditor_iban,
            "debtor_iban": debtor_iban,
            "counterparty_name_source": name_source,
        })
    return result


@router.get("/")
async def get_dashboard(
    include_hidden: bool = False,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get main dashboard data from database (instant response).

    `include_hidden=true` returns hidden accounts too (each with `is_visible`) so
    the settings account manager can list and un-hide them. The summary/totals are
    only meaningful for the default (visible-only) call — the settings manager
    reads just the `accounts` list.
    """

    acc_q = select(AccountModel).where(AccountModel.user_id == current_user.id)
    man_q = select(ManualAccountModel).options(selectinload(ManualAccountModel.items)).where(ManualAccountModel.user_id == current_user.id)
    inv_q = select(ManualInvestmentAccountModel).options(selectinload(ManualInvestmentAccountModel.positions)).where(ManualInvestmentAccountModel.user_id == current_user.id)
    if not include_hidden:
        acc_q = acc_q.where(AccountModel.is_visible == True)
        man_q = man_q.where(ManualAccountModel.is_visible == True)
        inv_q = inv_q.where(ManualInvestmentAccountModel.is_visible == True)

    accounts = (await db.execute(acc_q)).scalars().all()
    manual_accounts = (await db.execute(man_q)).scalars().all()
    manual_investment_accounts = (await db.execute(inv_q)).scalars().all()

    # Calculate investment balance — re-convert if sync stored wrong rate (fallback 1.0)
    investment_balance = 0
    for acc in accounts:
        if acc.type != "investment":
            continue
        balance = acc.balance
        details = json.loads(acc.details_json) if acc.details_json else {}
        original_currency = details.get("original_currency", acc.currency)
        stored_rate = details.get("exchange_rate", 1.0)
        original_balance = details.get("original_balance")
        if (
            original_currency != "CZK"
            and original_balance is not None
            and abs(stored_rate - 1.0) < 0.001
        ):
            live_rate = await get_exchange_rate(original_currency, "CZK")
            balance = original_balance * live_rate
        investment_balance += balance

    # Calculate totals (for manual accounts, only count my_balance)
    bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank")
    total_balance = bank_balance + investment_balance
    
    # Calculate manual account balances (only my money)
    manual_balance = 0
    for macc in manual_accounts:
        # my_balance = total - cizí obálky
        borrowed = sum(item.amount for item in macc.items if not getattr(item, 'is_mine', True))
        manual_balance += macc.balance - borrowed
    
    total_balance += manual_balance

    # Add manual investment account values to total
    manual_investment_balance = sum(
        sum(p.current_value for p in acc.positions)
        for acc in manual_investment_accounts
    )
    total_balance += manual_investment_balance
    investment_balance += manual_investment_balance
    
    # Get recent transactions from DB with account name — hidden accounts'
    # transactions stay out of the dashboard overview.
    tx_q = (
        select(TransactionModel, AccountModel.name)
        .join(AccountModel, TransactionModel.account_id == AccountModel.id)
        .where(TransactionModel.user_id == current_user.id)
    )
    if not include_hidden:
        tx_q = tx_q.where(AccountModel.is_visible == True)
    tx_result = await db.execute(
        tx_q.order_by(TransactionModel.date.desc()).limit(5)
    )
    recent_tx_rows = tx_result.all()

    # Parse raw_json for counterparty fields and bulk-lookup missing names in contacts
    recent_tx_parsed = []
    needed_ibans: set[str] = set()
    for tx, account_name in recent_tx_rows:
        raw: dict = {}
        if tx.raw_json:
            try:
                raw = json.loads(tx.raw_json) or {}
            except Exception:
                pass
        creditor_name = raw.get("creditorName")
        debtor_name = raw.get("debtorName")
        creditor_iban = normalize_iban((raw.get("creditorAccount") or {}).get("iban") or (raw.get("creditorAccount") or {}).get("bban"))
        debtor_iban = normalize_iban((raw.get("debtorAccount") or {}).get("iban") or (raw.get("debtorAccount") or {}).get("bban"))
        if not creditor_name and creditor_iban:
            needed_ibans.add(creditor_iban)
        if not debtor_name and debtor_iban:
            needed_ibans.add(debtor_iban)
        recent_tx_parsed.append((tx, account_name, creditor_name, debtor_name, creditor_iban, debtor_iban))

    contacts_by_iban: dict[str, ContactModel] = {}
    if needed_ibans:
        contact_rows = await db.execute(
            select(ContactModel).where(
                ContactModel.user_id == current_user.id,
                ContactModel.iban.in_(list(needed_ibans)),
            )
        )
        contacts_by_iban = {c.iban: c for c in contact_rows.scalars().all()}
    
    # Get transactions for the CURRENT CALENDAR MONTH (not last 30 days — UI labels these
    # as "tento měsíc" so they must match what the user sees on a calendar).
    today = datetime.now()
    month_start = today.replace(day=1).strftime("%Y-%m-%d")
    all_tx_q = select(TransactionModel).where(
        TransactionModel.user_id == current_user.id,
        TransactionModel.date >= month_start,
    )
    if not include_hidden:
        all_tx_q = all_tx_q.where(
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.is_visible == True,
                )
            )
        )
    all_tx_result = await db.execute(all_tx_q.limit(1000))
    all_tx = all_tx_result.scalars().all()
    
    # Calculate income vs expenses (excluding internal/family transfers;
    # settlement transfers from wife are not income, shared expenses count only my part)
    income = sum(tx.amount for tx in all_tx if tx.amount > 0 and tx.account_type == "bank" and not tx.is_excluded and not tx.settlement_flag)
    expenses = sum(_my_expense_amount(tx) for tx in all_tx if tx.amount < 0 and tx.account_type == "bank" and not tx.is_excluded)
    
    # Calculate categories (only true expense categories — exclude income categories
    # like Salary/Dividend even if a misclassified negative tx slips through)
    income_cat_result = await db.execute(
        select(CategoryModel.name).where(
            CategoryModel.user_id == current_user.id,
            CategoryModel.is_income == True,
        )
    )
    income_category_names = {row[0] for row in income_cat_result.all()}

    categories = {}
    for tx in all_tx:
        if tx.amount < 0 and not tx.is_excluded:
            cat = tx.category or "Other"
            if cat in income_category_names:
                continue
            if cat not in categories:
                categories[cat] = 0
            categories[cat] += _my_expense_amount(tx)
    
    # Build accounts list including manual accounts
    # For investment accounts, re-convert balance if sync stored wrong rate (fallback 1.0)
    accounts_list = []
    for acc in accounts:
        balance = acc.balance
        currency = acc.currency
        if acc.type == "investment":
            details = json.loads(acc.details_json) if acc.details_json else {}
            original_currency = details.get("original_currency", acc.currency)
            stored_rate = details.get("exchange_rate", 1.0)
            original_balance = details.get("original_balance")
            if (
                original_currency != "CZK"
                and original_balance is not None
                and abs(stored_rate - 1.0) < 0.001
            ):
                live_rate = await get_exchange_rate(original_currency, "CZK")
                balance = round(original_balance * live_rate, 2)
                currency = "CZK"
        accounts_list.append({
            "id": acc.id,
            "name": acc.name,
            "type": acc.type,
            "balance": balance,
            "currency": currency,
            "institution": acc.institution,
            "is_visible": acc.is_visible,
            # consent_expires_at se ztratil při merge fix/fe_bugs — bez něj
            # UI nemá jak varovat před vypršelým souhlasem banky
            "consent_expires_at": acc.consent_expires_at.isoformat() if acc.consent_expires_at else None,
            "last_synced": utc_iso(acc.last_synced),
            "last_sync_error": acc.last_sync_error,
        })

    # Add manual accounts to the list
    for macc in manual_accounts:
        borrowed = sum(item.amount for item in macc.items if not getattr(item, 'is_mine', True))
        accounts_list.append({
            "id": f"manual-{macc.id}",
            "name": macc.name,
            "type": "manual",
            "balance": macc.balance - borrowed,
            "currency": macc.currency,
            "institution": "Manuální",
            "is_visible": macc.is_visible,
        })

    # Add manual investment accounts to the list
    for macc in manual_investment_accounts:
        total = sum(p.current_value for p in macc.positions)
        accounts_list.append({
            "id": f"manual-inv-{macc.id}",
            "name": macc.name,
            "type": "manual_investment",
            "balance": total,
            "currency": macc.currency,
            "institution": "Manuální investice",
            "is_visible": macc.is_visible,
        })

    return {
        "summary": {
            "total_balance": total_balance,
            "bank_balance": bank_balance,
            "investment_balance": investment_balance,
            "manual_balance": manual_balance,
            "currency": "CZK",
            "accounts_count": len(accounts) + len(manual_accounts) + len(manual_investment_accounts)
        },
        "monthly": {
            "income": income,
            "expenses": expenses,
            "savings": income - expenses
        },
        "categories": categories,
        "recent_transactions": _build_recent_tx(recent_tx_parsed, contacts_by_iban),
        "accounts": accounts_list
    }


@router.get("/net-worth-history")
async def get_net_worth_history(
    days: int = Query(30, ge=7, le=365),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get net worth history (bank + investments + manual accounts) for chart"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    acc_result = await db.execute(
        select(AccountModel).where(
            AccountModel.user_id == current_user.id,
            AccountModel.is_visible == True,
        )
    )
    accounts = acc_result.scalars().all()

    # Manuální účty nemají transakce, takže se nedají rekonstruovat zpětně —
    # jejich aktuální zůstatek (jen moje peníze, bez cizích obálek) se přičítá
    # jako konstanta, aby Banka a Celkem seděly s hlavním dashboardem.
    man_result = await db.execute(
        select(ManualAccountModel)
        .options(selectinload(ManualAccountModel.items))
        .where(
            ManualAccountModel.user_id == current_user.id,
            ManualAccountModel.is_visible == True,
        )
    )
    manual_balance = 0
    for macc in man_result.scalars().all():
        borrowed = sum(item.amount for item in macc.items if not getattr(item, 'is_mine', True))
        manual_balance += macc.balance - borrowed

    # Totéž pro manuální investiční účty — dashboard je počítá do investic.
    inv_result = await db.execute(
        select(ManualInvestmentAccountModel)
        .options(selectinload(ManualInvestmentAccountModel.positions))
        .where(
            ManualInvestmentAccountModel.user_id == current_user.id,
            ManualInvestmentAccountModel.is_visible == True,
        )
    )
    manual_investment_balance = sum(
        sum(p.current_value for p in acc.positions)
        for acc in inv_result.scalars().all()
    )

    current_bank_balance = sum(acc.balance for acc in accounts if acc.type == "bank") + manual_balance
    current_investment_balance = sum(acc.balance for acc in accounts if acc.type == "investment") + manual_investment_balance

    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.date >= start_date.strftime("%Y-%m-%d"),
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.is_visible == True,
                )
            ),
        ).limit(2000)
    )
    transactions = result.scalars().all()
    
    # Group transactions by date and type
    bank_daily = {}
    investment_daily = {}
    
    for tx in transactions:
        date = tx.date[:10]
        if tx.account_type == "bank":
            bank_daily[date] = bank_daily.get(date, 0) + tx.amount
        elif tx.account_type == "investment":
            investment_daily[date] = investment_daily.get(date, 0) + tx.amount
    
    # Generate daily points (working BACKWARDS from today to oldest)
    # Start with current balances and subtract transactions to get historical values
    history = []
    bank_balance = current_bank_balance
    investment_balance = current_investment_balance
    
    # First, record today's balance
    today = end_date.strftime("%Y-%m-%d")
    history.append({
        "date": today,
        "bank": round(bank_balance, 2),
        "investment": round(investment_balance, 2),
        "total": round(bank_balance + investment_balance, 2)
    })
    
    # Work backwards from today
    for i in range(1, days + 1):
        date = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        next_date = (end_date - timedelta(days=i-1)).strftime("%Y-%m-%d")
        
        # Subtract the NEXT day's transactions to get this day's ending balance
        # (because next_date transactions caused the change FROM this day TO next_date)
        if next_date in bank_daily:
            bank_balance -= bank_daily[next_date]
        if next_date in investment_daily:
            investment_balance -= investment_daily[next_date]
        
        history.append({
            "date": date,
            "bank": round(bank_balance, 2),
            "investment": round(investment_balance, 2),
            "total": round(bank_balance + investment_balance, 2)
        })
    
    # Reverse to get chronological order (oldest first, newest last)
    history.reverse()
    
    return {
        "history": history,
        "currency": "CZK"
    }


def _name_tokens(value: str | None) -> frozenset[str]:
    """Slova ve jméně bez diakritiky, lowercase — pro porovnání jmen nezávisle
    na pořadí („Bureš Nicolas" == „Nicolas Bureš")."""
    import re, unicodedata
    if not value:
        return frozenset()
    stripped = "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    )
    return frozenset(t for t in re.split(r"[^a-z0-9]+", stripped.lower()) if t)


def _counterparty_name(tx) -> Optional[str]:
    """Jméno protistrany z banky: creditor u odchozích, debtor u příchozích."""
    if not tx.raw_json:
        return None
    try:
        raw = json.loads(tx.raw_json)
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None
    return raw.get("creditorName") if tx.amount < 0 else raw.get("debtorName")


def _account_identifiers(value: str) -> set[str]:
    """Normalizované tvary čísla účtu (IBAN/BBAN/číslo). Zrcadlí
    extract_account_number ze services/sync.py, aby se čísla shodovala napříč
    zápisy (CZ IBAN ↔ prefix/kód banky)."""
    result: set[str] = set()
    if not value:
        return result
    value = value.upper().strip()
    result.add(value)
    if value.startswith("CZ") and len(value) == 24:
        bank_code = value[4:8]
        account_num = value[8:].lstrip("0")
        result.add(account_num)
        result.add(f"{account_num}/{bank_code}")
    if "/" in value:
        parts = value.split("/")
        account_num = parts[0].lstrip("0")
        result.add(account_num)
        result.add(parts[0])
    result.discard("")
    return result


def _counterparty_account_ids(tx) -> set[str]:
    """Identifikátory protistranového účtu (creditor u odchozích, debtor u příchozích)."""
    if not tx.raw_json:
        return set()
    try:
        raw = json.loads(tx.raw_json)
    except Exception:
        return set()
    if not isinstance(raw, dict):
        return set()
    acc = raw.get("creditorAccount" if tx.amount < 0 else "debtorAccount") or {}
    ids = _account_identifiers(acc.get("iban", "") or "")
    ids |= _account_identifiers(acc.get("bban", "") or "")
    return ids


def build_wrapped(
    transactions,
    income_category_names: set[str],
    year: int,
    own_name_tokens: "frozenset[frozenset[str]]" = frozenset(),
    keep_account_ids: "frozenset[str]" = frozenset(),
) -> dict:
    """Roční „Spending Wrapped" z načtených bankovních transakcí.

    Stejné konvence jako monthly-report: přeskočit is_excluded, výdaje počítat
    přes _my_expense_amount, vypořádání není příjem, příjmové kategorie nejsou
    v žebříčku výdajových kategorií. Navíc se přeskakují převody na vlastní účty
    (protistrana = majitel některého tvého účtu) — jsou to převody, ne útrata,
    i když je detekce transferů nechytila (cílový účet není v appce připojený).

    `keep_account_ids` (z nastavení transfer_excluded_accounts) je výjimka —
    typicky kreditka: převod na tenhle účet je reálný výdaj (splátka), takže se
    nevyřazuje, i když jméno protistrany odpovídá majiteli. Čistá funkce.
    """
    def is_self_transfer(tx, name: str | None) -> bool:
        # Kreditka (transfer_excluded_accounts) je výjimka → reálný výdaj
        if keep_account_ids and (_counterparty_account_ids(tx) & keep_account_ids):
            return False
        toks = _name_tokens(name)
        if not toks:
            return False
        return any(own and own <= toks for own in own_name_tokens)

    monthly = {f"{year}-{m:02d}": {"income": 0.0, "expenses": 0.0} for m in range(1, 13)}
    merchants: dict[str, dict] = {}
    categories: dict[str, dict] = {}
    spending_days: set[str] = set()
    biggest = None
    income_total = expenses_total = 0.0
    expense_count = 0

    for tx in transactions:
        if not tx.date or tx.is_excluded:
            continue
        month = tx.date[:7]
        if month not in monthly:
            continue

        # Protistrana = jméno z banky, fallback popis transakce. Stejný název
        # slouží pro detekci vlastního převodu i pro žebříček obchodníků, aby
        # se chytily i převody, kde je jméno jen v popisu (creditorName chybí).
        party_name = _counterparty_name(tx) or tx.description
        if is_self_transfer(tx, party_name):
            continue

        if tx.amount >= 0:
            if not tx.settlement_flag:
                monthly[month]["income"] += tx.amount
                income_total += tx.amount
            continue

        spent = _my_expense_amount(tx)
        monthly[month]["expenses"] += spent
        expenses_total += spent
        expense_count += 1
        spending_days.add(tx.date)

        if biggest is None or spent > biggest["amount"]:
            biggest = {
                "description": tx.description,
                "amount": spent,
                "date": tx.date,
                "category": tx.category or "Other",
            }

        key = (party_name or "?").strip()
        m = merchants.setdefault(key, {"name": key, "total": 0.0, "count": 0})
        m["total"] += spent
        m["count"] += 1

        cat = tx.category or "Other"
        if cat not in income_category_names:
            c = categories.setdefault(cat, {"category": cat, "total": 0.0, "count": 0})
            c["total"] += spent
            c["count"] += 1

    monthly_list = [
        {"month": month, "income": round(v["income"], 2), "expenses": round(v["expenses"], 2)}
        for month, v in sorted(monthly.items())
    ]
    top_month = max(monthly_list, key=lambda m: m["expenses"]) if expenses_total > 0 else None

    # Dny bez utrácení jen za už proběhlou část roku
    now = utcnow()
    year_start = datetime(year, 1, 1)
    year_end = min(datetime(year, 12, 31), now) if year == now.year else datetime(year, 12, 31)
    days_elapsed = max(0, (year_end - year_start).days + 1)

    return {
        "totals": {
            "income": round(income_total, 2),
            "expenses": round(expenses_total, 2),
            "saved": round(income_total - expenses_total, 2),
            "expense_count": expense_count,
            "no_spend_days": max(0, days_elapsed - len(spending_days)),
            "days_elapsed": days_elapsed,
        },
        "monthly": monthly_list,
        "top_month": top_month,
        "top_merchants": sorted(merchants.values(), key=lambda m: m["total"], reverse=True)[:5],
        "top_categories": sorted(categories.values(), key=lambda c: c["total"], reverse=True)[:5],
        "biggest_expense": biggest,
    }


@router.get("/wrapped")
async def get_spending_wrapped(
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Roční přehled („Spending Wrapped"): top obchodníci, nejdražší měsíc,
    žebříček kategorií, největší výdaj a součty za tagy/projekty."""
    visible_accounts = select(AccountModel.id).where(
        AccountModel.user_id == current_user.id,
        AccountModel.is_visible == True,
    )

    years_result = await db.execute(
        select(func.distinct(func.substr(TransactionModel.date, 1, 4)))
        .where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.account_type == "bank",
            TransactionModel.date != "",
            TransactionModel.account_id.in_(visible_accounts),
        )
    )
    available_years = sorted(
        (int(y) for (y,) in years_result.all() if y and y.isdigit()), reverse=True
    )
    if year is None:
        year = available_years[0] if available_years else utcnow().year

    income_cat_result = await db.execute(
        select(CategoryModel.name).where(
            CategoryModel.user_id == current_user.id,
            CategoryModel.is_income == True,
        )
    )
    income_category_names = {row[0] for row in income_cat_result.all()}

    # Jména majitelů vlastních účtů (z detailu banky) → protistrana s tímhle
    # jménem je převod na vlastní účet, ne útrata. Jen víceslovná jména, ať
    # jedno křestní neshodí legitimního obchodníka.
    accounts = (await db.execute(
        select(AccountModel).where(
            AccountModel.user_id == current_user.id,
            AccountModel.type == "bank",
        )
    )).scalars().all()
    own_name_tokens: set[frozenset[str]] = set()
    if current_user.name:
        toks = _name_tokens(current_user.name)
        if len(toks) >= 2:
            own_name_tokens.add(toks)
    for acc in accounts:
        if not acc.details_json:
            continue
        try:
            detail = json.loads(acc.details_json)
        except Exception:
            continue
        acc_info = detail.get("account", {}) if isinstance(detail, dict) else {}
        for key in ("ownerName", "name"):
            toks = _name_tokens(acc_info.get(key))
            if len(toks) >= 2:
                own_name_tokens.add(toks)

    # Kreditka jako výjimka — převod na účet z transfer_excluded_accounts je
    # reálný výdaj (splátka), ne převod mezi vlastními účty. Stejné nastavení
    # jako používá detekce transferů (services/sync.py).
    excluded_setting = (await db.execute(
        select(SettingsModel.value).where(
            SettingsModel.user_id == current_user.id,
            SettingsModel.key == "transfer_excluded_accounts",
        )
    )).scalar_one_or_none()
    keep_account_ids: set[str] = set()
    if excluded_setting:
        try:
            for acc_no in json.loads(excluded_setting):
                keep_account_ids |= _account_identifiers(acc_no)
        except Exception:
            pass

    start, end = f"{year}-01-01", f"{year + 1}-01-01"
    tx_result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.account_type == "bank",
            TransactionModel.date >= start,
            TransactionModel.date < end,
            TransactionModel.account_id.in_(visible_accounts),
        )
    )
    transactions = tx_result.scalars().all()

    wrapped = build_wrapped(
        transactions, income_category_names, year,
        frozenset(own_name_tokens), frozenset(keep_account_ids),
    )

    # Součty za tagy/projekty — stejná sémantika jako tag summary (moje část,
    # bez převodů a vypořádání)
    tag_rows = await db.execute(
        select(TagModel.id, TagModel.name, TagModel.color, TransactionModel)
        .join(TransactionTagModel, TransactionTagModel.tag_id == TagModel.id)
        .join(TransactionModel, TransactionModel.id == TransactionTagModel.transaction_id)
        .where(
            TagModel.user_id == current_user.id,
            TransactionModel.date >= start,
            TransactionModel.date < end,
        )
    )
    tags: dict[int, dict] = {}
    for tag_id, tag_name, tag_color, tx in tag_rows.all():
        if tx.is_excluded or (tx.transaction_type or "normal") != "normal" or tx.settlement_flag:
            continue
        if tx.amount >= 0:
            continue
        t = tags.setdefault(tag_id, {"name": tag_name, "color": tag_color, "total": 0.0, "count": 0})
        t["total"] += _my_expense_amount(tx)
        t["count"] += 1
    for t in tags.values():
        t["total"] = round(t["total"], 2)

    return {
        "year": year,
        "available_years": available_years,
        "currency": "CZK",
        **wrapped,
        "tags": sorted(tags.values(), key=lambda t: t["total"], reverse=True),
    }


@router.get("/monthly-report")
async def get_monthly_report(
    months: int = Query(6, ge=1, le=24),
    full_amounts: bool = Query(False, description="True = bank-statement view: full amounts, settlements count as income"),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get monthly report with income/expenses and category breakdown.

    Default counts only MY part of shared expenses and drops settlements from
    income; `full_amounts=true` shows raw bank amounts (matches the statement).
    """

    income_cat_result = await db.execute(
        select(CategoryModel.name).where(
            CategoryModel.user_id == current_user.id,
            CategoryModel.is_income == True,
        )
    )
    income_category_names = {row[0] for row in income_cat_result.all()}

    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.account_type == "bank",
            TransactionModel.account_id.in_(
                select(AccountModel.id).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.is_visible == True,
                )
            ),
        )
    )
    transactions = result.scalars().all()

    # Group by month
    monthly_data = {}
    category_data = {}

    for tx in transactions:
        if not tx.date:
            continue

        # Skip excluded transactions (internal/family transfers) from totals
        if tx.is_excluded:
            continue

        month = tx.date[:7]  # YYYY-MM

        if month not in monthly_data:
            monthly_data[month] = {"income": 0, "expenses": 0}

        if tx.amount >= 0:
            # Settlement transfers are repayments, not income (unless full view)
            if full_amounts or not tx.settlement_flag:
                monthly_data[month]["income"] += tx.amount
        else:
            monthly_data[month]["expenses"] += abs(tx.amount) if full_amounts else _my_expense_amount(tx)

        # Category breakdown — only true expense categories
        if tx.amount < 0:
            cat = tx.category or "Other"
            if cat in income_category_names:
                continue
            if month not in category_data:
                category_data[month] = {}
            if cat not in category_data[month]:
                category_data[month][cat] = 0
            category_data[month][cat] += abs(tx.amount) if full_amounts else _my_expense_amount(tx)
    
    # Sort by month and limit to requested months
    sorted_months = sorted(monthly_data.keys(), reverse=True)[:months]
    sorted_months.reverse()  # Oldest first for chart
    
    # Build response
    monthly_totals = []
    for month in sorted_months:
        data = monthly_data[month]
        monthly_totals.append({
            "month": month,
            "income": round(data["income"], 2),
            "expenses": round(data["expenses"], 2),
            "balance": round(data["income"] - data["expenses"], 2)
        })
    
    # Category breakdown per month
    category_breakdown = []
    for month in sorted_months:
        if month in category_data:
            for cat, amount in category_data[month].items():
                category_breakdown.append({
                    "month": month,
                    "category": cat,
                    "amount": round(amount, 2)
                })
    
    # Categories that actually appear in the displayed window (avoid phantom legend entries)
    all_categories = set()
    for month in sorted_months:
        if month in category_data:
            all_categories.update(category_data[month].keys())
    
    return {
        "monthly_totals": monthly_totals,
        "category_breakdown": category_breakdown,
        "categories": sorted(list(all_categories)),
        "currency": "CZK"
    }
