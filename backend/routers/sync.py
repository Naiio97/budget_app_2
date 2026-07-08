from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime, timedelta
import asyncio
import json
import logging

from auth import get_current_user
from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel, CategoryRuleModel, SettingsModel, PortfolioSnapshotModel, UserModel, ShareRuleModel
from services.share_rules import match_share_rule, compute_my_share
from services.gocardless import gocardless_service, select_balance
from services.push import send_push_to_user
from services.timefmt import utc_iso
from services.trading212 import trading212_service
from services.exchange_rates import get_exchange_rate
from services.categorization import (
    RULE_ORDER,
    categorize_transaction,
    categorize_transaction_with_rules,
    categorize_with_preloaded_rules,
)

router = APIRouter()

logger = logging.getLogger(__name__)


async def get_family_account_pattern(db: AsyncSession, user_id: int) -> str | None:
    """Get the configured family account pattern from settings"""
    result = await db.execute(
        select(SettingsModel).where(
            SettingsModel.user_id == user_id,
            SettingsModel.key == "family_account_pattern",
        )
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def get_my_account_patterns(db: AsyncSession, user_id: int) -> list[str]:
    """Get configured patterns for user's own accounts (for internal transfer detection)"""
    import json
    result = await db.execute(
        select(SettingsModel).where(
            SettingsModel.user_id == user_id,
            SettingsModel.key == "my_account_patterns",
        )
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        return json.loads(setting.value)
    return []


async def get_transfer_excluded_accounts(db: AsyncSession, user_id: int) -> list[str]:
    """Accounts (numbers/IBANs) that must NOT count as 'mine' in internal transfer
    detection — e.g. a credit card: repaying it is a real expense, not a transfer."""
    result = await db.execute(
        select(SettingsModel).where(
            SettingsModel.user_id == user_id,
            SettingsModel.key == "transfer_excluded_accounts",
        )
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        return json.loads(setting.value)
    return []


async def detect_and_mark_transfers(db: AsyncSession, user_id: int):
    """Detect and mark internal transfers based on creditor/debtor account matching.
    Also updates manual account balances when transfers to/from manual accounts are detected."""
    from models import ManualAccountModel
    import re

    def extract_account_number(value: str) -> set:
        """Extract account number from IBAN, BBAN or plain account number"""
        result = set()
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
        
        return result
    
    # Build set of all my account identifiers (bank + manual)
    my_account_identifiers = set()
    # Identifikátory VLASTNÍHO účtu každé transakce — banka často pošle jen
    # jednu stranu převodu, a ta druhá je z definice účet, na kterém záznam
    # leží. Odečtením vlastního účtu z (creditor ∪ debtor) zbyde protiúčet.
    own_ids_by_account: dict[str, set] = {}

    result = await db.execute(
        select(AccountModel).where(
            AccountModel.user_id == user_id,
            AccountModel.type == "bank",
        )
    )
    bank_accounts = result.scalars().all()
    for acc in bank_accounts:
        if acc.details_json:
            try:
                details = json.loads(acc.details_json)
                account_info = details.get("account", {})
                acc_ids: set = set()
                if account_info.get("iban"):
                    acc_ids.update(extract_account_number(account_info["iban"]))
                if account_info.get("bban"):
                    acc_ids.update(extract_account_number(account_info["bban"]))
                my_account_identifiers.update(acc_ids)
                own_ids_by_account[acc.id] = acc_ids
            except:
                pass
    
    # Build mapping: account identifier -> ManualAccountModel for balance tracking
    manual_account_map: dict[str, 'ManualAccountModel'] = {}  # identifier -> model
    result = await db.execute(
        select(ManualAccountModel).where(ManualAccountModel.user_id == user_id)
    )
    manual_accounts = result.scalars().all()
    for acc in manual_accounts:
        if acc.account_number:
            ids = extract_account_number(acc.account_number)
            my_account_identifiers.update(ids)
            for identifier in ids:
                manual_account_map[identifier] = acc
    
    # Load text-based patterns from settings (e.g. "spořící", "savings", etc.)
    my_account_patterns = await get_my_account_patterns(db, user_id)

    # Accounts excluded from detection (e.g. credit card — its repayment is a real
    # expense). Their identifiers never count as "mine".
    excluded_identifiers: set = set()
    for acc_no in await get_transfer_excluded_accounts(db, user_id):
        excluded_identifiers.update(extract_account_number(acc_no))
    excluded_identifiers.discard("")
    my_account_identifiers -= excluded_identifiers

    def tx_counterparty_ids(tx) -> set:
        """All account identifiers (creditor + debtor) of a transaction."""
        ids: set = set()
        try:
            raw = json.loads(tx.raw_json) if tx.raw_json else {}
            if isinstance(raw, dict):
                for side in ("creditorAccount", "debtorAccount"):
                    acc = raw.get(side) or {}
                    ids.update(extract_account_number(acc.get("iban", "") or ""))
                    ids.update(extract_account_number(acc.get("bban", "") or ""))
        except Exception:
            pass
        ids.discard("")
        return ids

    logger.debug(f"My account identifiers for transfer detection: {my_account_identifiers}")
    logger.debug(f"My account text patterns: {my_account_patterns}")
    logger.debug(f"Manual accounts with numbers: {[(a.name, a.account_number) for a in manual_accounts if a.account_number]}")

    family_pattern = await get_family_account_pattern(db, user_id)

    tx_result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == user_id,
            TransactionModel.account_type == "bank",
        )
    )
    transactions = tx_result.scalars().all()
    
    marked_internal = 0
    marked_family = 0
    marked_my_account = 0
    unmarked_excluded = 0
    manual_balance_updates: dict[int, float] = {}  # manual_account_id -> balance delta

    # Cleanup pass: transfers previously auto-marked to/from an excluded account
    # (or categorized as transfer by a learned rule) go back to being normal
    # expenses. Runs every detection, so the exclusion is self-healing even if a
    # category rule keeps re-labelling new payments on insert.
    if excluded_identifiers:
        for tx in transactions:
            if tx.user_excluded:
                continue  # ruční vyřazení uživatele detekce nikdy nemění
            is_marked = tx.transaction_type in ("internal_transfer", "my_account_transfer")
            has_transfer_category = tx.category in ("Internal Transfer", "Family Transfer")
            if not is_marked and not has_transfer_category:
                continue
            if not (tx_counterparty_ids(tx) & excluded_identifiers):
                continue
            tx.transaction_type = "normal"
            tx.is_excluded = False
            tx.category_locked = False
            if has_transfer_category:
                try:
                    raw = json.loads(tx.raw_json) if tx.raw_json else {}
                except Exception:
                    raw = {}
                new_category = await categorize_transaction_with_rules(
                    raw if isinstance(raw, dict) else {}, db, user_id
                )
                # The whole point of this pass is to strip the transfer label —
                # never let a rule re-apply it here.
                if new_category in ("Internal Transfer", "Family Transfer"):
                    new_category = categorize_transaction(raw if isinstance(raw, dict) else {})
                tx.category = new_category
            unmarked_excluded += 1
            logger.info(f"Un-marked transfer to excluded account: {tx.date} {tx.description[:50]} ({tx.amount})")

    for tx in transactions:
        if tx.user_excluded:
            continue  # ruční vyřazení uživatele detekce nechává být
        if tx.is_excluded and tx.transaction_type != "normal":
            continue

        desc_lower = str(tx.description or "").lower()
        
        # Check family pattern first
        if family_pattern and family_pattern in desc_lower:
            tx.transaction_type = "family_transfer"
            tx.is_excluded = True
            tx.category = "Family Transfer"
            tx.category_locked = True
            marked_family += 1
            continue

        # Check text-based patterns for my accounts (description matching)
        if my_account_patterns:
            matched_pattern = False
            for pattern in my_account_patterns:
                if pattern in desc_lower:
                    tx.transaction_type = "my_account_transfer"
                    tx.is_excluded = True
                    tx.category = "Internal Transfer"
                    tx.category_locked = True
                    marked_my_account += 1
                    matched_pattern = True
                    break
            if matched_pattern:
                continue
        
        # Check account number matching (creditor/debtor)
        try:
                raw_data = json.loads(tx.raw_json)
                
                if not isinstance(raw_data, dict):
                    continue
                
                creditor_acc = raw_data.get("creditorAccount") or {}
                creditor_ids = set()
                creditor_ids.update(extract_account_number(creditor_acc.get("iban", "")))
                creditor_ids.update(extract_account_number(creditor_acc.get("bban", "")))
                
                debtor_acc = raw_data.get("debtorAccount") or {}
                debtor_ids = set()
                debtor_ids.update(extract_account_number(debtor_acc.get("iban", "")))
                debtor_ids.update(extract_account_number(debtor_acc.get("bban", "")))

                creditor_ids.discard("")
                debtor_ids.discard("")

                if not creditor_ids and not debtor_ids:
                    continue

                # Banka často pošle jen jednu stranu převodu — druhá strana je
                # ale vždy účet, na kterém záznam leží. Převod mezi mými účty:
                # každá UVEDENÁ strana je moje (vlastní účet transakce se
                # počítá) a protiúčet (strany minus vlastní účet) je taky můj.
                own_ids = own_ids_by_account.get(tx.account_id, set())
                mine_or_own = my_account_identifiers | own_ids
                creditor_ok = not creditor_ids or bool(creditor_ids & mine_or_own)
                debtor_ok = not debtor_ids or bool(debtor_ids & mine_or_own)
                counterparty_is_mine = bool(
                    ((creditor_ids | debtor_ids) - own_ids) & my_account_identifiers
                )

                if creditor_ok and debtor_ok and counterparty_is_mine:
                    tx.transaction_type = "internal_transfer"
                    tx.is_excluded = True
                    tx.category = "Internal Transfer"
                    tx.category_locked = True
                    marked_internal += 1
                    
                    # Track balance changes for manual accounts
                    tx_amount = abs(float(tx.amount))
                    
                    # Find if creditor is a manual account (money goes TO creditor)
                    for cid in creditor_ids:
                        if cid in manual_account_map:
                            acc = manual_account_map[cid]
                            manual_balance_updates[acc.id] = manual_balance_updates.get(acc.id, 0) + tx_amount
                            logger.info(f"Manual account '{acc.name}' receives +{tx_amount} from internal transfer: {tx.description[:50]}")
                            break
                    
                    # Find if debtor is a manual account (money goes FROM debtor)
                    for did in debtor_ids:
                        if did in manual_account_map:
                            acc = manual_account_map[did]
                            manual_balance_updates[acc.id] = manual_balance_updates.get(acc.id, 0) - tx_amount
                            logger.info(f"Manual account '{acc.name}' sends -{tx_amount} from internal transfer: {tx.description[:50]}")
                            break
                    
                    logger.debug(f"Internal transfer: {tx.description[:50]} (creditor: {creditor_ids & my_account_identifiers}, debtor: {debtor_ids & my_account_identifiers})")
                    
        except Exception as e:
            logger.error(f"Error parsing raw_json for tx {tx.id}: {e}")

    # Dopárování jednostranných záznamů: druhá noha převodu mezi mými účty
    # často přijde úplně bez protiúčtu (banka pošle jen vlastní stranu).
    # Spáruje se s už označenou nohou na jiném účtu: stejná částka s opačným
    # znaménkem, stejná měna, datum ±2 dny — a pokud označená noha protiúčet
    # zná, musí mířit na účet kandidáta. Každá noha se spotřebuje nejvýš jednou.
    def _tx_date(t):
        try:
            return datetime.strptime(t.date, "%Y-%m-%d")
        except Exception:
            return None

    pair_legs = [
        t for t in transactions
        if t.transaction_type == "internal_transfer" and not t.user_excluded
    ]
    used_leg_ids: set = set()
    for tx in transactions:
        if tx.user_excluded or tx.is_excluded or tx.transaction_type != "normal":
            continue
        own_ids = own_ids_by_account.get(tx.account_id, set())
        if tx_counterparty_ids(tx) - own_ids:
            continue  # protiúčet známe → řešila ho hlavní smyčka
        tx_dt = _tx_date(tx)
        if tx_dt is None:
            continue
        for leg in pair_legs:
            if leg.id in used_leg_ids or leg.account_id == tx.account_id:
                continue
            if (leg.currency or "CZK") != (tx.currency or "CZK"):
                continue
            if abs(float(leg.amount) + float(tx.amount)) > 0.01:
                continue
            leg_dt = _tx_date(leg)
            if leg_dt is None or abs((leg_dt - tx_dt).days) > 2:
                continue
            leg_counterparty = tx_counterparty_ids(leg) - own_ids_by_account.get(leg.account_id, set())
            if leg_counterparty and not (leg_counterparty & own_ids):
                continue
            tx.transaction_type = "internal_transfer"
            tx.is_excluded = True
            tx.category = "Internal Transfer"
            tx.category_locked = True
            used_leg_ids.add(leg.id)
            marked_internal += 1
            logger.info(f"Paired one-sided transfer: {tx.date} {tx.description[:40]} ({tx.amount}) <-> leg {leg.date}")
            break

    # Apply manual account balance updates
    for acc_id, delta in manual_balance_updates.items():
        for acc in manual_accounts:
            if acc.id == acc_id:
                old_balance = acc.balance or 0
                acc.balance = old_balance + delta
                logger.info(f"Updated manual account '{acc.name}' balance: {old_balance} -> {acc.balance} (delta: {delta:+.2f})")
                break
    
    await db.commit()
    return {"marked_internal": marked_internal, "marked_family": marked_family, "marked_my_account": marked_my_account, "unmarked_excluded": unmarked_excluded}


@router.post("/recategorize")
async def recategorize_transactions(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recategorize all existing transactions using improved category detection with rules.

    Skips locked transactions (category_locked=True) — manual corrections and
    transfers detected by IBAN matching must survive a bulk recategorize."""
    import json

    result = await db.execute(
        select(TransactionModel).where(
            TransactionModel.user_id == current_user.id,
            TransactionModel.category_locked == False,
        )
    )
    transactions = result.scalars().all()

    updated = 0
    categories_count = {}

    for tx in transactions:
        if tx.account_type == "investment":
            continue

        raw_data = {}
        if tx.raw_json:
            try:
                raw_data = json.loads(tx.raw_json)
            except:
                raw_data = {"remittanceInformationUnstructured": tx.description}
        else:
            raw_data = {"remittanceInformationUnstructured": tx.description}

        new_category = await categorize_transaction_with_rules(raw_data, db, current_user.id)

        if tx.category != new_category:
            tx.category = new_category
            updated += 1

        categories_count[new_category] = categories_count.get(new_category, 0) + 1

    await db.commit()

    return {
        "updated": updated,
        "categories": categories_count
    }



async def notify_after_sync(db: AsyncSession, user_id: int, failed_accounts: list[str]) -> None:
    """Push notifikace po syncu: selhané účty a souhlasy před vypršením.

    Volá se z ručního syncu i (v budoucnu) z automatického — je to jediné
    místo, kde se vyhodnocují 'po syncu' podmínky.
    """
    if failed_accounts:
        names = ", ".join(failed_accounts)
        await send_push_to_user(
            db, user_id,
            title="Sync selhal",
            body=f"Nepodařilo se synchronizovat: {names}. Zkontroluj připojení banky.",
            url="/settings",
        )

    # Souhlasy končící do 7 dnů (nebo už vypršelé) — jednou denně by stačilo,
    # ale sync běží max 4×/den, takže duplicity jsou snesitelné.
    week_ahead = datetime.utcnow() + timedelta(days=7)
    result = await db.execute(
        select(AccountModel).where(
            AccountModel.user_id == user_id,
            AccountModel.type == "bank",
            AccountModel.consent_expires_at != None,
            AccountModel.consent_expires_at <= week_ahead,
        )
    )
    for account in result.scalars():
        expired = account.consent_expires_at <= datetime.utcnow()
        days_left = max(0, (account.consent_expires_at - datetime.utcnow()).days)
        await send_push_to_user(
            db, user_id,
            title="Souhlas banky " + ("vypršel" if expired else "brzy vyprší"),
            body=(
                f"{account.name}: souhlas vypršel — obnov připojení v Nastavení."
                if expired else
                f"{account.name}: souhlas vyprší za {days_left} dní. Obnov ho v Nastavení."
            ),
            url="/settings",
        )


@router.post("/")
async def sync_all_data(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Synchronize all data from external APIs to local database"""

    sync_status = SyncStatusModel(
        user_id=current_user.id,
        started_at=datetime.utcnow(),
        status="running"
    )
    db.add(sync_status)
    await db.commit()
    await db.refresh(sync_status)

    accounts_synced = 0
    transactions_synced = 0
    failed_accounts: list[str] = []

    # Preload all category rules ONCE so categorization during the sync respects user choices
    # (e.g. "billa → Supermarkets") without N+1 DB roundtrips.
    user_rules_result = await db.execute(
        select(CategoryRuleModel)
        .where(
            CategoryRuleModel.user_id == current_user.id,
            CategoryRuleModel.is_user_defined == True,
        )
        .order_by(*RULE_ORDER)
    )
    preloaded_user_rules = list(user_rules_result.scalars())
    learned_rules_result = await db.execute(
        select(CategoryRuleModel)
        .where(
            CategoryRuleModel.user_id == current_user.id,
            CategoryRuleModel.is_user_defined == False,
        )
        .order_by(*RULE_ORDER)
    )
    preloaded_learned_rules = list(learned_rules_result.scalars())

    # Auto-split rules — new expenses matching a rule get my_share_amount at insert
    share_rules_result = await db.execute(
        select(ShareRuleModel).where(
            ShareRuleModel.user_id == current_user.id,
            ShareRuleModel.is_active == True,
        )
    )
    preloaded_share_rules = list(share_rules_result.scalars())

    try:
        # Sync bank accounts from GoCardless
        try:
            result = await db.execute(
                select(AccountModel).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.type == "bank",
                )
            )
            bank_accounts = result.scalars().all()

            # Refresh EUA consent expiry before the balance loop — an expired
            # consent 401s the account below, and that is exactly when the UI
            # needs the expiry date to say "reconnect".
            if bank_accounts:
                try:
                    consent_map = await gocardless_service.get_consent_expirations()
                    for account in bank_accounts:
                        if account.id in consent_map:
                            account.consent_expires_at = consent_map[account.id]
                except Exception as e:
                    logger.warning(f"Failed to refresh consent expirations: {e}")

            for account in bank_accounts:
                try:
                    balances, clean_transactions = await asyncio.gather(
                        gocardless_service.get_account_balances(account.id),
                        gocardless_service.get_account_transactions(account.id),
                    )
                    balance_list = balances.balances or []

                    if balance_list:
                        balance_types = [b.balanceType for b in balance_list]
                        logger.debug(f"Account {account.id} has balance types: {balance_types}")
                        
                        selected_balance = select_balance(balance_list)

                        if selected_balance:
                            amount = float(selected_balance.balanceAmount.amount)
                            currency = selected_balance.balanceAmount.currency
                            logger.info(f"Selected balance for {account.id}: {amount} {currency} ({selected_balance.balanceType})")
                            
                            account.balance = amount
                            account.currency = currency
                            account.last_synced = datetime.utcnow()
                        
                    rows_to_upsert = []
                    for tx_data in clean_transactions:
                        tx_id = (
                            tx_data.transactionId or 
                            tx_data.internalTransactionId or 
                            tx_data.entryReference or ""
                        )
                        if not tx_id:
                            continue
                        
                        description = (
                            tx_data.remittanceInformationUnstructured or 
                            tx_data.remittanceInformationStructured or
                            tx_data.creditorName or 
                            tx_data.debtorName or 
                            "Transaction"
                        )
                        
                        tx_dict = tx_data.model_dump(mode="json")

                        tx_amount = float(tx_data.transactionAmount.amount)
                        # Auto-split: a new shared expense (rent, utilities…) gets my
                        # share set right away per the user's share rules.
                        my_share = share_counterparty = share_note = None
                        share_rule = match_share_rule(tx_dict, tx_amount, preloaded_share_rules)
                        if share_rule:
                            my_share = compute_my_share(tx_amount, share_rule)
                            share_counterparty = share_rule.counterparty
                            share_note = share_rule.note
                            share_rule.match_count += 1

                        rows_to_upsert.append({
                            "id": tx_id,
                            "user_id": current_user.id,
                            "account_id": account.id,
                            "date": str(tx_data.bookingDate) if tx_data.bookingDate else "",
                            "description": description,
                            "amount": tx_amount,
                            "currency": tx_data.transactionAmount.currency,
                            "category": categorize_with_preloaded_rules(tx_dict, preloaded_user_rules, preloaded_learned_rules),
                            "account_type": "bank",
                            "transaction_type": "normal",
                            "is_excluded": False,
                            "my_share_amount": my_share,
                            "share_counterparty": share_counterparty,
                            "settlement_note": share_note,
                            "raw_json": json.dumps(tx_dict),
                        })
                    
                    if rows_to_upsert:
                        stmt = pg_insert(TransactionModel).values(rows_to_upsert)
                        stmt = stmt.on_conflict_do_update(
                            index_elements=["id"],
                            set_={
                                "description": stmt.excluded.description,
                                "raw_json": stmt.excluded.raw_json,
                            }
                        )
                        await db.execute(stmt)
                        transactions_synced += len(rows_to_upsert)
                    
                    accounts_synced += 1
                    account.last_sync_error = None

                except Exception as inner_e:
                    error_msg = f"Failed to sync account {account.id}: {str(inner_e)}"
                    logger.error(error_msg)
                    account.last_sync_error = str(inner_e)[:500]
                    failed_accounts.append(account.name)
                    sync_status.error_message = (sync_status.error_message or "") + error_msg + "; "
                    continue
                    
        except Exception as e:
            logger.warning(f"GoCardless sync skipped: {e}")
            sync_status.error_message = (sync_status.error_message or "") + f"GoCardless Error: {str(e)}; "
            if "429" in str(e):
                 raise e
        
        # Sync Trading 212
        try:
            cash = await trading212_service.get_account_info()
            portfolio = await trading212_service.get_portfolio()

            eur_total_value = cash.get("free", 0) + sum(
                p.get("currentPrice", 0) * p.get("quantity", 0) for p in portfolio
            )
            base_currency = cash.get("currency", "EUR")

            exchange_rate = 1.0
            target_currency = "CZK"

            if base_currency != target_currency:
                exchange_rate = await get_exchange_rate(base_currency, target_currency)

            czk_total_value = eur_total_value * exchange_rate

            # Extract P&L fields from cash endpoint
            # T212 API uses "ppl" for unrealized P&L; "result" may also be present
            invested_eur = float(cash.get("invested", 0) or 0)
            result_eur = float(cash.get("ppl", 0) or cash.get("result", 0) or 0)
            cash_free_eur = float(cash.get("free", 0) or 0)

            logger.info(f"Trading 212: {eur_total_value} {base_currency} -> {czk_total_value} {target_currency} (Rate: {exchange_rate}), invested={invested_eur}, result={result_eur}")

            # Store simplified positions (only fields we need for display)
            simplified_positions = [
                {
                    "ticker": p.get("ticker", ""),
                    "quantity": p.get("quantity", 0),
                    "averagePrice": p.get("averagePrice", 0),
                    "currentPrice": p.get("currentPrice", 0),
                    "ppl": p.get("ppl", 0),
                    "fxPpl": p.get("fxPpl", 0),
                }
                for p in portfolio
            ]

            # Fetch pies with names (detail endpoint needed for name field)
            pies_data = []
            try:
                pies_list = await trading212_service.get_pies()
                if isinstance(pies_list, list):
                    for pie_basic in pies_list:
                        pie_id = pie_basic.get("id")
                        if not pie_id:
                            continue
                        try:
                            detail = await trading212_service.get_pie_detail(pie_id)
                            settings_block = detail.get("settings", {})
                            result_block = pie_basic.get("result", {})
                            pies_data.append({
                                "id": pie_id,
                                "name": settings_block.get("name", f"Pie {pie_id}"),
                                "icon": settings_block.get("icon", ""),
                                "goal": settings_block.get("goal"),
                                "invested_eur": float(result_block.get("priceAvgInvestedValue", 0) or 0),
                                "value_eur": float(result_block.get("priceAvgValue", 0) or 0),
                                "result_eur": float(result_block.get("priceAvgResult", 0) or 0),
                                "result_pct": float(result_block.get("priceAvgResultCoef", 0) or 0) * 100,
                                "instruments": [
                                    {
                                        "ticker": inst.get("ticker", ""),
                                        "current_share": float(inst.get("currentShare", 0) or 0),
                                        "expected_share": float(inst.get("expectedShare", 0) or 0),
                                        "owned_quantity": float(inst.get("ownedQuantity", 0) or 0),
                                        "value_eur": float((inst.get("result") or {}).get("priceAvgValue", 0) or 0),
                                        "result_eur": float((inst.get("result") or {}).get("priceAvgResult", 0) or 0),
                                    }
                                    for inst in detail.get("instruments", [])
                                ],
                            })
                        except Exception as pie_err:
                            logger.warning(f"Could not fetch detail for pie {pie_id}: {pie_err}")
            except Exception as pies_err:
                logger.warning(f"Pies sync skipped: {pies_err}")

            details_payload = json.dumps({
                "cash": cash,
                "positions": simplified_positions,
                "positions_count": len(portfolio),
                "original_currency": base_currency,
                "original_balance": eur_total_value,
                "exchange_rate": exchange_rate,
                "pies": pies_data,
            })

            # Look up by (user, type='investment') so existing user-1 row with
            # id="trading212" keeps working. New users get a user-scoped id.
            t212_result = await db.execute(
                select(AccountModel).where(
                    AccountModel.user_id == current_user.id,
                    AccountModel.type == "investment",
                    AccountModel.institution == "Trading 212",
                )
            )
            t212_account = t212_result.scalar_one_or_none()
            if t212_account:
                t212_account.balance = float(czk_total_value)
                t212_account.currency = target_currency
                t212_account.last_synced = datetime.utcnow()
                t212_account.details_json = details_payload
            else:
                t212_account = AccountModel(
                    id=f"trading212-{current_user.id}",
                    user_id=current_user.id,
                    name="Trading 212",
                    type="investment",
                    balance=float(czk_total_value),
                    currency=target_currency,
                    institution="Trading 212",
                    details_json=details_payload,
                    last_synced=datetime.utcnow()
                )
                db.add(t212_account)
            t212_account_id = t212_account.id

            # Save daily portfolio snapshot (upsert by user + date)
            try:
                today = datetime.utcnow().strftime("%Y-%m-%d")
                snapshot_stmt = pg_insert(PortfolioSnapshotModel).values({
                    "user_id": current_user.id,
                    "snapshot_date": today,
                    "total_value_czk": float(czk_total_value),
                    "invested_czk": invested_eur * exchange_rate,
                    "result_czk": result_eur * exchange_rate,
                    "cash_free_czk": cash_free_eur * exchange_rate,
                    "total_value_eur": eur_total_value,
                    "exchange_rate": exchange_rate,
                    "positions_count": len(portfolio),
                })
                snapshot_stmt = snapshot_stmt.on_conflict_do_update(
                    index_elements=["user_id", "snapshot_date"],
                    set_={
                        "total_value_czk": snapshot_stmt.excluded.total_value_czk,
                        "invested_czk": snapshot_stmt.excluded.invested_czk,
                        "result_czk": snapshot_stmt.excluded.result_czk,
                        "cash_free_czk": snapshot_stmt.excluded.cash_free_czk,
                        "total_value_eur": snapshot_stmt.excluded.total_value_eur,
                        "exchange_rate": snapshot_stmt.excluded.exchange_rate,
                        "positions_count": snapshot_stmt.excluded.positions_count,
                    }
                )
                await db.execute(snapshot_stmt)
                logger.info(f"Portfolio snapshot saved for {today}: {czk_total_value:.0f} CZK")
            except Exception as snap_err:
                logger.warning(f"Portfolio snapshot skipped (table may not exist yet — run migrations): {snap_err}")

            accounts_synced += 1
            
            # Sync orders
            orders = await trading212_service.get_orders(limit=50)
            order_rows = []
            for order in orders.get("items", []):
                # DEFENZIVNÍ OPRAVA ZDE:
                if not order:
                    continue
                    
                order_id = order.get("id", "")
                if not order_id:
                    continue
                
                eur_amount = -float(order.get("fillPrice", 0)) * float(order.get("filledQuantity", 0))
                czk_amount = eur_amount * exchange_rate
                
                order_rows.append({
                    "id": order_id,
                    "user_id": current_user.id,
                    "account_id": t212_account_id,
                    "date": order.get("dateExecuted", order.get("dateCreated", ""))[:10],
                    "description": f"{order.get('type', 'ORDER')} {order.get('ticker', '')} ({eur_amount:.2f} {base_currency})",
                    "amount": czk_amount,
                    "currency": target_currency,
                    "category": "Investment",
                    "account_type": "investment",
                    "transaction_type": "normal",
                    "is_excluded": False,
                    "raw_json": json.dumps(order),
                })
            
            if order_rows:
                stmt = pg_insert(TransactionModel).values(order_rows)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "description": stmt.excluded.description,
                        "raw_json": stmt.excluded.raw_json,
                    }
                )
                await db.execute(stmt)
                transactions_synced += len(order_rows)
            
            # Sync dividends
            dividends = await trading212_service.get_dividends(limit=50)
            div_rows = []
            for div in dividends.get("items", []):
                # DEFENZIVNÍ OPRAVA ZDE:
                if not div:
                    continue
                    
                div_amount = float(div.get("amount", 0))
                div_currency = div.get("currency", "EUR")
                
                div_rate = exchange_rate
                if div_currency != base_currency and div_currency != target_currency:
                     div_rate = await get_exchange_rate(div_currency, target_currency)
                
                czk_div_amount = div_amount * div_rate
                div_id = f"div_{div.get('reference', '')}"
                
                div_rows.append({
                    "id": div_id,
                    "user_id": current_user.id,
                    "account_id": t212_account_id,
                    "date": div.get("paidOn", "")[:10] if div.get("paidOn") else "",
                    "description": f"Dividend: {div.get('ticker', '')} ({div_amount:.2f} {div_currency})",
                    "amount": czk_div_amount,
                    "currency": target_currency,
                    "category": "Dividend",
                    "account_type": "investment",
                    "transaction_type": "normal",
                    "is_excluded": False,
                    "raw_json": json.dumps(div),
                })
            
            if div_rows:
                stmt = pg_insert(TransactionModel).values(div_rows)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "description": stmt.excluded.description,
                        "raw_json": stmt.excluded.raw_json,
                    }
                )
                await db.execute(stmt)
                transactions_synced += len(div_rows)
                
        except Exception as e:
            logger.error(f"Trading 212 sync error: {e}")
            sync_status.error_message = (sync_status.error_message or "") + f"Trading 212 Error: {str(e)}; "
        
        sync_status.status = "completed"
        sync_status.completed_at = datetime.utcnow()
        sync_status.accounts_synced = accounts_synced
        sync_status.transactions_synced = transactions_synced
        
        await db.commit()

        transfer_result = await detect_and_mark_transfers(db, current_user.id)

        # Post-sync notifikace (selhané účty, končící souhlasy) — nesmí shodit sync
        try:
            await notify_after_sync(db, current_user.id, failed_accounts)
        except Exception as notify_e:
            logger.warning(f"Post-sync notifications failed: {notify_e}")

        return {
            "status": "completed",
            "accounts_synced": accounts_synced,
            "transactions_synced": transactions_synced,
            "failed_accounts": failed_accounts,
            "error": sync_status.error_message,
            "marked_internal_transfers": transfer_result["marked_internal"],
            "marked_family_transfers": transfer_result["marked_family"],
            "marked_my_account_transfers": transfer_result["marked_my_account"]
        }

    except Exception as e:
        await db.rollback()

        result = await db.execute(
            select(SyncStatusModel)
            .where(SyncStatusModel.user_id == current_user.id)
            .order_by(SyncStatusModel.id.desc()).limit(1)
        )
        sync_status = result.scalar_one_or_none()

        if sync_status:
            sync_status.status = "failed"
            sync_status.error_message = str(e)
            sync_status.completed_at = datetime.utcnow()
            await db.commit()

        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_sync_status(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the status of the last synchronization"""
    from sqlalchemy import func

    result = await db.execute(
        select(SyncStatusModel)
        .where(SyncStatusModel.user_id == current_user.id)
        .order_by(SyncStatusModel.id.desc()).limit(1)
    )
    sync_status = result.scalar_one_or_none()

    # Count successful syncs today (UTC date)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await db.execute(
        select(func.count()).select_from(SyncStatusModel).where(
            SyncStatusModel.user_id == current_user.id,
            SyncStatusModel.status == "completed",
            SyncStatusModel.started_at >= today_start,
        )
    )
    syncs_today = count_result.scalar() or 0

    if not sync_status:
        return {
            "status": "never",
            "last_sync": None,
            "accounts_synced": 0,
            "transactions_synced": 0,
            "syncs_today": syncs_today,
        }

    return {
        "status": sync_status.status,
        "last_sync": utc_iso(sync_status.completed_at or sync_status.started_at),
        "accounts_synced": sync_status.accounts_synced,
        "transactions_synced": sync_status.transactions_synced,
        "error": sync_status.error_message,
        "syncs_today": syncs_today,
    }


@router.post("/detect-transfers")
async def detect_transfers(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually detect and mark internal transfers and family transfers"""
    result = await detect_and_mark_transfers(db, current_user.id)
    return {
        "status": "completed",
        "marked_internal_transfers": result["marked_internal"],
        "marked_family_transfers": result["marked_family"],
        "marked_my_account_transfers": result["marked_my_account"],
        "unmarked_excluded_accounts": result["unmarked_excluded"],
    }