from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime
import json
import logging

from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel, CategoryRuleModel, SettingsModel
from services.gocardless import gocardless_service
from services.trading212 import trading212_service
from services.exchange_rates import get_exchange_rate

router = APIRouter()

logger = logging.getLogger(__name__)


async def get_family_account_pattern(db: AsyncSession) -> str | None:
    """Get the configured family account pattern from settings"""
    result = await db.execute(select(SettingsModel).where(SettingsModel.key == "family_account_pattern"))
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def get_my_account_patterns(db: AsyncSession) -> list[str]:
    """Get configured patterns for user's own accounts (for internal transfer detection)"""
    import json
    result = await db.execute(select(SettingsModel).where(SettingsModel.key == "my_account_patterns"))
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        return json.loads(setting.value)
    return []


async def detect_and_mark_transfers(db: AsyncSession):
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
    
    result = await db.execute(select(AccountModel).where(AccountModel.type == "bank"))
    bank_accounts = result.scalars().all()
    for acc in bank_accounts:
        if acc.details_json:
            try:
                details = json.loads(acc.details_json)
                account_info = details.get("account", {})
                if account_info.get("iban"):
                    my_account_identifiers.update(extract_account_number(account_info["iban"]))
                if account_info.get("bban"):
                    my_account_identifiers.update(extract_account_number(account_info["bban"]))
            except:
                pass
    
    # Build mapping: account identifier -> ManualAccountModel for balance tracking
    manual_account_map: dict[str, 'ManualAccountModel'] = {}  # identifier -> model
    result = await db.execute(select(ManualAccountModel))
    manual_accounts = result.scalars().all()
    for acc in manual_accounts:
        if acc.account_number:
            ids = extract_account_number(acc.account_number)
            my_account_identifiers.update(ids)
            for identifier in ids:
                manual_account_map[identifier] = acc
    
    # Load text-based patterns from settings (e.g. "spořící", "savings", etc.)
    my_account_patterns = await get_my_account_patterns(db)
    
    logger.debug(f"My account identifiers for transfer detection: {my_account_identifiers}")
    logger.debug(f"My account text patterns: {my_account_patterns}")
    logger.debug(f"Manual accounts with numbers: {[(a.name, a.account_number) for a in manual_accounts if a.account_number]}")
    
    family_pattern = await get_family_account_pattern(db)
    
    tx_result = await db.execute(select(TransactionModel).where(TransactionModel.account_type == "bank"))
    transactions = tx_result.scalars().all()
    
    marked_internal = 0
    marked_family = 0
    marked_my_account = 0
    manual_balance_updates: dict[int, float] = {}  # manual_account_id -> balance delta
    
    for tx in transactions:
        if tx.is_excluded and tx.transaction_type != "normal":
            continue
        
        desc_lower = str(tx.description or "").lower()
        
        # Check family pattern first
        if family_pattern and family_pattern in desc_lower:
            tx.transaction_type = "family_transfer"
            tx.is_excluded = True
            tx.category = "Family Transfer"
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
                
                if not creditor_ids or not debtor_ids:
                    continue
                
                creditor_is_mine = bool(creditor_ids & my_account_identifiers)
                debtor_is_mine = bool(debtor_ids & my_account_identifiers)
                
                if creditor_is_mine and debtor_is_mine:
                    tx.transaction_type = "internal_transfer"
                    tx.is_excluded = True
                    tx.category = "Internal Transfer"
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
    
    # Apply manual account balance updates
    for acc_id, delta in manual_balance_updates.items():
        for acc in manual_accounts:
            if acc.id == acc_id:
                old_balance = acc.balance or 0
                acc.balance = old_balance + delta
                logger.info(f"Updated manual account '{acc.name}' balance: {old_balance} -> {acc.balance} (delta: {delta:+.2f})")
                break
    
    await db.commit()
    return {"marked_internal": marked_internal, "marked_family": marked_family, "marked_my_account": marked_my_account}


def categorize_transaction(tx: dict) -> str:
    """Smart category detection based on description with Czech merchants"""
    # DEFENZIVNÍ OPRAVA ZDE:
    raw_desc = (tx.get("remittanceInformationUnstructured") or 
                tx.get("creditorName") or 
                tx.get("debtorName") or 
                "")
    desc = str(raw_desc).lower()
    
    categories = {
        "food": [
            "lidl", "albert", "tesco", "billa", "kaufland", "penny", "globus", "makro", "coop", "norma", "žabka",
            "restaurant", "restaurace", "bistro", "food", "wolt", "dáme jídlo", "damejidlo", "bolt food", "foodora",
            "jídelna", "jidelna", "mcdonalds", "mcdonald", "kfc", "burger king", "subway", "starbucks", "costa", 
            "pizza", "sushi", "kebab", "banh mi", "thai", "vietnam", "čína", "china", "asia", "grill",
            "kavárna", "kavarna", "café", "cafe", "pekárna", "pekarna", "cukrárna", "cukrarna", "bakery",
            "hospoda", "pub", "pivnice", "bar", "pivovar", "brewery",
            "bageterie", "qerko", "rohlik", "rohlík", "košík", "kosik",
            "řeznictví", "reznictvi", "uzeniny", "maso",
            "luxor", "miners", "cinestar bar"
        ],
        "transport": [
            "uber", "bolt", "liftago", "taxi",
            "benzina", "orlen", "omv", "shell", "mol", "eni", "cng", "euro oil", "pap oil",
            "mhd", "jízdenka", "jizdenka", "prague transport", "dpp", "pid", "litacka", "lítačka",
            "parking", "parkovani", "parkoviště", "parkování",
            "dálnice", "dalnice", "mýto", "myto",
            "autoservis", "pneuservis", "autopůjčovna"
        ],
        "utilities": [
            "čez", "cez", "pražské vodovody", "innogy", "eon", "pre", "pražská energetika",
            "vodafone", "t-mobile", "o2", "nordic telecom", "nej.cz",
            "upc", "skylink", "digi",
            "pojištění", "pojisteni", "allianz", "generali", "kooperativa", "čpp", "cpp",
            "nájem", "najem", "rent", "svj", "bytové",
            "plyn", "elektřina", "elektrina", "voda", "teplo"
        ],
        "entertainment": [
            "netflix", "spotify", "hbo", "disney", "apple tv", "youtube", "deezer", "tidal",
            "cinema", "kino", "cinestar", "cinema city", "divadlo", "theatre",
            "steam", "playstation", "xbox", "nintendo", "epic games", "tipsport", "fortuna", "sazka",
            "fitness", "gym", "posilovna", "bazén", "bazen", "wellness", "sauna", "squash", "tenis",
            "ticketmaster", "ticketportal", "goout", "eventim",
            "audioteka", "bookbeat"
        ],
        "shopping": [
            "amazon", "alza", "mall.cz", "czc", "datart", "electro world", "planeo", "okay",
            "zara", "h&m", "reserved", "about you", "zalando", "answear", "bata", "deichmann",
            "ikea", "obi", "hornbach", "bauhaus", "baumax", "jysk", "sconto", "xxxlutz", "asko", "möbelix",
            "tesco", "dm", "rossmann", "douglas", "sephora",
            "heureka", "aliexpress", "wish", "shein", "temu",
            "decathlon", "sportisimo", "hervis"
        ],
        "salary": [
            "mzda", "plat", "salary", "výplata", "vyplata", "odměna", "odmena", "bonus", "prémie", "premie"
        ],
        "health": [
            "lékárna", "lekarna", "pharmacy", "doktor", "doctor", "nemocnice", "hospital", "klinika", "clinic",
            "zubař", "zubar", "dentist", "optika", "optician", "zdravotní", "zdravotni"
        ],
    }
    
    for category, keywords in categories.items():
        if any(kw in desc for kw in keywords):
            return category.capitalize()
    
    return "Other"


async def categorize_transaction_with_rules(tx: dict, db: AsyncSession) -> str:
    """Smart category detection with priority: user rules > learned rules > built-in keywords"""
    # DEFENZIVNÍ OPRAVA ZDE:
    raw_desc = (tx.get("remittanceInformationUnstructured") or 
                tx.get("creditorName") or 
                tx.get("debtorName") or 
                "")
    desc = str(raw_desc).lower()
    
    if not desc:
        return "Other"
    
    user_rules = await db.execute(
        select(CategoryRuleModel)
        .where(CategoryRuleModel.is_user_defined == True)
        .order_by(CategoryRuleModel.match_count.desc())
    )
    for rule in user_rules.scalars():
        if rule.pattern.lower() in desc:
            rule.match_count += 1
            return rule.category
    
    learned_rules = await db.execute(
        select(CategoryRuleModel)
        .where(CategoryRuleModel.is_user_defined == False)
        .order_by(CategoryRuleModel.match_count.desc())
    )
    for rule in learned_rules.scalars():
        if rule.pattern.lower() in desc:
            rule.match_count += 1
            return rule.category
    
    return categorize_transaction(tx)


@router.post("/recategorize")
async def recategorize_transactions(db: AsyncSession = Depends(get_db)):
    """Recategorize all existing transactions using improved category detection with rules"""
    import json
    
    result = await db.execute(select(TransactionModel))
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
        
        new_category = await categorize_transaction_with_rules(raw_data, db)
        
        if tx.category != new_category:
            tx.category = new_category
            updated += 1
        
        categories_count[new_category] = categories_count.get(new_category, 0) + 1
    
    await db.commit()
    
    return {
        "updated": updated,
        "categories": categories_count
    }



@router.post("/")
async def sync_all_data(db: AsyncSession = Depends(get_db)):
    """Synchronize all data from external APIs to local database"""
    
    sync_status = SyncStatusModel(
        started_at=datetime.utcnow(),
        status="running"
    )
    db.add(sync_status)
    await db.commit()
    await db.refresh(sync_status)
    
    accounts_synced = 0
    transactions_synced = 0
    
    try:
        # Sync bank accounts from GoCardless
        try:
            result = await db.execute(select(AccountModel).where(AccountModel.type == "bank"))
            bank_accounts = result.scalars().all()
            
            for account in bank_accounts:
                try:
                    balances = await gocardless_service.get_account_balances(account.id)
                    balance_list = balances.balances or []
                    
                    if balance_list:
                        balance_types = [b.balanceType for b in balance_list]
                        logger.debug(f"Account {account.id} has balance types: {balance_types}")
                        
                        selected_balance = None
                        selected_balance = next((b for b in balance_list if b.balanceType == "interimAvailable"), None)
                        
                        if not selected_balance:
                            selected_balance = next((b for b in balance_list if b.balanceType == "closingBooked"), None)
                            
                        if not selected_balance:
                            selected_balance = next((b for b in balance_list if b.balanceType == "interimBooked"), None)
                            
                        if not selected_balance:
                             selected_balance = next((b for b in balance_list if b.balanceType == "openingBooked"), None)
                             
                        if not selected_balance:
                            selected_balance = balance_list[0]
                            
                        if selected_balance:
                            amount = float(selected_balance.balanceAmount.amount)
                            currency = selected_balance.balanceAmount.currency
                            logger.info(f"Selected balance for {account.id}: {amount} {currency} ({selected_balance.balanceType})")
                            
                            account.balance = amount
                            account.currency = currency
                            account.last_synced = datetime.utcnow()
                        
                    clean_transactions = await gocardless_service.get_account_transactions(account.id)
                    
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
                        
                        rows_to_upsert.append({
                            "id": tx_id,
                            "account_id": account.id,
                            "date": str(tx_data.bookingDate) if tx_data.bookingDate else "",
                            "description": description,
                            "amount": float(tx_data.transactionAmount.amount),
                            "currency": tx_data.transactionAmount.currency,
                            "category": categorize_transaction(tx_dict),
                            "account_type": "bank",
                            "transaction_type": "normal",
                            "is_excluded": False,
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
                    
                except Exception as inner_e:
                    error_msg = f"Failed to sync account {account.id}: {str(inner_e)}"
                    logger.error(error_msg)
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
            
            logger.info(f"Trading 212: {eur_total_value} {base_currency} -> {czk_total_value} {target_currency} (Rate: {exchange_rate})")
            
            t212_account = await db.get(AccountModel, "trading212")
            if t212_account:
                t212_account.balance = float(czk_total_value)
                t212_account.currency = target_currency
                t212_account.last_synced = datetime.utcnow()
                t212_account.details_json = json.dumps({
                    "cash": cash, 
                    "positions": len(portfolio),
                    "original_currency": base_currency,
                    "original_balance": eur_total_value,
                    "exchange_rate": exchange_rate
                })
            else:
                t212_account = AccountModel(
                    id="trading212",
                    name="Trading 212",
                    type="investment",
                    balance=float(czk_total_value),
                    currency=target_currency,
                    institution="Trading 212",
                    details_json=json.dumps({
                        "cash": cash,
                        "original_currency": base_currency,
                        "original_balance": eur_total_value,
                        "exchange_rate": exchange_rate
                    }),
                    last_synced=datetime.utcnow()
                )
                db.add(t212_account)
            
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
                    "account_id": "trading212",
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
                    "account_id": "trading212",
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
        
        transfer_result = await detect_and_mark_transfers(db)
        
        return {
            "status": "completed",
            "accounts_synced": accounts_synced,
            "transactions_synced": transactions_synced,
            "marked_internal_transfers": transfer_result["marked_internal"],
            "marked_family_transfers": transfer_result["marked_family"],
            "marked_my_account_transfers": transfer_result["marked_my_account"]
        }
        
    except Exception as e:
        await db.rollback()
        
        result = await db.execute(
            select(SyncStatusModel).order_by(SyncStatusModel.id.desc()).limit(1)
        )
        sync_status = result.scalar_one_or_none()
        
        if sync_status:
            sync_status.status = "failed"
            sync_status.error_message = str(e)
            sync_status.completed_at = datetime.utcnow()
            await db.commit()
        
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    """Get the status of the last synchronization"""
    result = await db.execute(
        select(SyncStatusModel).order_by(SyncStatusModel.id.desc()).limit(1)
    )
    sync_status = result.scalar_one_or_none()
    
    if not sync_status:
        return {
            "status": "never",
            "last_sync": None,
            "accounts_synced": 0,
            "transactions_synced": 0
        }
    
    return {
        "status": sync_status.status,
        "last_sync": sync_status.completed_at.isoformat() if sync_status.completed_at else sync_status.started_at.isoformat(),
        "accounts_synced": sync_status.accounts_synced,
        "transactions_synced": sync_status.transactions_synced,
        "error": sync_status.error_message
    }


@router.post("/detect-transfers")
async def detect_transfers(db: AsyncSession = Depends(get_db)):
    """Manually detect and mark internal transfers and family transfers"""
    result = await detect_and_mark_transfers(db)
    return {
        "status": "completed",
        "marked_internal_transfers": result["marked_internal"],
        "marked_family_transfers": result["marked_family"],
        "marked_my_account_transfers": result["marked_my_account"]
    }