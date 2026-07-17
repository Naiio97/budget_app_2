"""
Detekce převodů mezi vlastními/rodinnými účty.

Vytažené z routers/sync.py — čistá servisní logika bez FastAPI závislostí.
Volá se po každém syncu a z endpointu POST /sync/detect-transfers.
"""
import json
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AccountModel, ManualAccountModel, SettingsModel, TransactionModel
from services.categorization import categorize_transaction, categorize_transaction_with_rules

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
            except Exception:
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
