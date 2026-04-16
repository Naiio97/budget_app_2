from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime
import asyncio
import json
import logging

from database import get_db
from models import AccountModel, TransactionModel, SyncStatusModel, CategoryRuleModel, SettingsModel, PortfolioSnapshotModel
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


# ISO 20022 purpose codes → category
PURPOSE_CODE_MAP: dict[str, str] = {
    "SALA": "Salary",   # Salary payment
    "PAYR": "Salary",   # Payroll
    "BONU": "Salary",   # Bonus payment
    "PENS": "Salary",   # Pension payment
    "SSBE": "Salary",   # Social security benefit
    "BENE": "Salary",   # Unemployment benefit
    "TAXS": "Utilities",  # Tax payment
    "VATX": "Utilities",  # VAT tax
    "INSR": "Utilities",  # Insurance premium
    "RENT": "Utilities",  # Rent
    "OTHR": None,         # Other — don't auto-assign
}

# MCC (Merchant Category Code) → category
MCC_CATEGORY_MAP: dict[str, str] = {
    # Food & Grocery
    "5411": "Food",  # Grocery stores
    "5412": "Food",  # Convenience stores
    "5422": "Food",  # Meat shops
    "5441": "Food",  # Candy/nut/confectionery
    "5451": "Food",  # Dairies
    "5461": "Food",  # Bakeries
    "5499": "Food",  # Misc food stores
    "5811": "Food",  # Caterers
    "5812": "Food",  # Eating places / restaurants
    "5813": "Food",  # Bars / taverns
    "5814": "Food",  # Fast food
    "5912": "Health",  # Drug stores / pharmacies
    # Transport
    "4111": "Transport",  # Local commuter transport
    "4112": "Transport",  # Passenger railways
    "4121": "Transport",  # Taxicabs / limousines
    "4131": "Transport",  # Bus lines
    "4411": "Transport",  # Cruise lines
    "4511": "Transport",  # Airlines
    "4814": "Utilities",  # Telecom
    "4816": "Utilities",  # Computer network services (internet)
    "4899": "Utilities",  # Cable / satellite TV
    "4900": "Utilities",  # Utilities (electric, gas, water)
    "5541": "Transport",  # Service stations / gas stations
    "5542": "Transport",  # Automated fuel dispensers
    "7523": "Transport",  # Parking lots
    "7531": "Transport",  # Auto repair
    "7534": "Transport",  # Tyre retreading
    "7538": "Transport",  # Auto service shops
    # Shopping
    "5045": "Shopping",  # Computers / peripherals
    "5065": "Shopping",  # Electrical parts
    "5200": "Shopping",  # Home supply / hardware
    "5211": "Shopping",  # Lumber / building materials
    "5251": "Shopping",  # Hardware stores
    "5310": "Shopping",  # Discount stores
    "5311": "Shopping",  # Department stores
    "5331": "Shopping",  # Variety stores
    "5399": "Shopping",  # Misc general merchandise
    "5621": "Shopping",  # Women's clothing
    "5631": "Shopping",  # Accessories / lingerie
    "5641": "Shopping",  # Children's clothing
    "5651": "Shopping",  # Family clothing
    "5661": "Shopping",  # Shoe stores
    "5691": "Shopping",  # Men's clothing
    "5699": "Shopping",  # Misc clothing
    "5712": "Shopping",  # Furniture
    "5719": "Shopping",  # Misc home furnishings
    "5732": "Shopping",  # Electronics
    "5733": "Shopping",  # Music stores
    "5734": "Shopping",  # Computer software
    "5912": "Health",    # Pharmacies
    "5940": "Shopping",  # Sporting goods
    "5941": "Shopping",  # Sporting goods
    "5945": "Shopping",  # Hobby / toy / game shops
    "5977": "Shopping",  # Cosmetics
    "5999": "Shopping",  # Misc retail
    # Health
    "5047": "Health",    # Medical / dental supplies
    "5122": "Health",    # Drugs / proprietaries
    "8011": "Health",    # Doctors / physicians
    "8021": "Health",    # Dentists
    "8031": "Health",    # Osteopaths
    "8041": "Health",    # Chiropractors
    "8042": "Health",    # Optometrists
    "8049": "Health",    # Podiatrists
    "8050": "Health",    # Nursing / personal care
    "8062": "Health",    # Hospitals
    "8071": "Health",    # Medical lab
    "8099": "Health",    # Health practitioners
    # Entertainment
    "5815": "Entertainment",  # Digital content (streaming)
    "5816": "Entertainment",  # Digital games
    "5817": "Entertainment",  # Digital apps
    "5818": "Entertainment",  # Digital media
    "7011": "Entertainment",  # Hotels / lodging
    "7832": "Entertainment",  # Motion picture theatres
    "7922": "Entertainment",  # Theatrical producers
    "7929": "Entertainment",  # Bands / orchestras
    "7941": "Entertainment",  # Sports clubs / fields
    "7991": "Entertainment",  # Tourist attractions
    "7993": "Entertainment",  # Video game arcades
    "7996": "Entertainment",  # Amusement parks
    "7997": "Entertainment",  # Membership clubs (fitness etc.)
    "7999": "Entertainment",  # Recreation services
}


def categorize_by_purpose_code(tx: dict) -> str | None:
    """Return category based on ISO 20022 purposeCode, or None if not applicable"""
    purpose = tx.get("purposeCode") or tx.get("purpose_code") or ""
    if not purpose:
        return None
    mapped = PURPOSE_CODE_MAP.get(purpose.upper())
    return mapped  # may be None


def categorize_by_mcc(tx: dict) -> str | None:
    """Return category based on MCC code, or None if no MCC present"""
    mcc = tx.get("merchantCategoryCode") or tx.get("mcc") or ""
    if not mcc:
        return None
    return MCC_CATEGORY_MAP.get(str(mcc).strip())


def categorize_transaction(tx: dict) -> str:
    """Smart category detection: purposeCode → MCC → keyword matching"""
    # 1. purposeCode
    by_purpose = categorize_by_purpose_code(tx)
    if by_purpose:
        return by_purpose

    # 2. MCC
    by_mcc = categorize_by_mcc(tx)
    if by_mcc:
        return by_mcc

    # 3. Keyword matching
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
            "luxor", "miners", "cinestar bar",
        ],
        "transport": [
            "uber", "bolt", "liftago", "taxi",
            "benzina", "orlen", "omv", "shell", "mol", "eni", "cng", "euro oil", "pap oil",
            "mhd", "jízdenka", "jizdenka", "prague transport", "dpp", "pid", "litacka", "lítačka",
            "parking", "parkovani", "parkoviště", "parkování",
            "dálnice", "dalnice", "mýto", "myto",
            "autoservis", "pneuservis", "autopůjčovna",
        ],
        "utilities": [
            "čez", "cez", "pražské vodovody", "innogy", "eon", "pre", "pražská energetika",
            "vodafone", "t-mobile", "o2", "nordic telecom", "nej.cz",
            "upc", "skylink", "digi",
            "pojištění", "pojisteni", "allianz", "generali", "kooperativa", "čpp", "cpp",
            "nájem", "najem", "rent", "svj", "bytové",
            "plyn", "elektřina", "elektrina", "voda", "teplo",
        ],
        "entertainment": [
            "netflix", "spotify", "hbo", "disney", "apple tv", "youtube", "deezer", "tidal",
            "cinema", "kino", "cinestar", "cinema city", "divadlo", "theatre",
            "steam", "playstation", "xbox", "nintendo", "epic games", "tipsport", "fortuna", "sazka",
            "fitness", "gym", "posilovna", "bazén", "bazen", "wellness", "sauna", "squash", "tenis",
            "ticketmaster", "ticketportal", "goout", "eventim",
            "audioteka", "bookbeat",
        ],
        "shopping": [
            "amazon", "alza", "mall.cz", "czc", "datart", "electro world", "planeo", "okay",
            "zara", "h&m", "reserved", "about you", "zalando", "answear", "bata", "deichmann",
            "ikea", "obi", "hornbach", "bauhaus", "baumax", "jysk", "sconto", "xxxlutz", "asko", "möbelix",
            "tesco", "dm", "rossmann", "douglas", "sephora",
            "heureka", "aliexpress", "wish", "shein", "temu",
            "decathlon", "sportisimo", "hervis",
        ],
        "salary": [
            "mzda", "plat", "salary", "výplata", "vyplata", "odměna", "odmena", "bonus", "prémie", "premie",
        ],
        "health": [
            "lékárna", "lekarna", "pharmacy", "doktor", "doctor", "nemocnice", "hospital", "klinika", "clinic",
            "zubař", "zubar", "dentist", "optika", "optician", "zdravotní", "zdravotni",
        ],
    }

    for category, keywords in categories.items():
        if any(kw in desc for kw in keywords):
            return category.capitalize()

    return "Other"


async def categorize_transaction_with_rules(tx: dict, db: AsyncSession) -> str:
    """Smart category detection with priority: user rules > purposeCode > MCC > keywords"""
    raw_desc = (tx.get("remittanceInformationUnstructured") or
                tx.get("creditorName") or
                tx.get("debtorName") or
                "")
    desc = str(raw_desc).lower()

    # 1. User-defined rules (highest priority — explicit user preference)
    user_rules = await db.execute(
        select(CategoryRuleModel)
        .where(CategoryRuleModel.is_user_defined == True)
        .order_by(CategoryRuleModel.match_count.desc())
    )
    for rule in user_rules.scalars():
        if rule.pattern.lower() in desc:
            rule.match_count += 1
            return rule.category

    # 2. purposeCode (ISO 20022 — very reliable for salary, insurance, tax, rent)
    by_purpose = categorize_by_purpose_code(tx)
    if by_purpose:
        return by_purpose

    # 3. MCC code (merchant category — reliable for card payments)
    by_mcc = categorize_by_mcc(tx)
    if by_mcc:
        return by_mcc

    # 4. Learned rules (from previous categorizations)
    if desc:
        learned_rules = await db.execute(
            select(CategoryRuleModel)
            .where(CategoryRuleModel.is_user_defined == False)
            .order_by(CategoryRuleModel.match_count.desc())
        )
        for rule in learned_rules.scalars():
            if rule.pattern.lower() in desc:
                rule.match_count += 1
                return rule.category

    # 5. Keyword matching fallback
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
                    balances, clean_transactions = await asyncio.gather(
                        gocardless_service.get_account_balances(account.id),
                        gocardless_service.get_account_transactions(account.id),
                    )
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
                                        "value_eur": float((inst.get("result") or {}).get("value", 0) or 0),
                                        "result_eur": float((inst.get("result") or {}).get("result", 0) or 0),
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

            t212_account = await db.get(AccountModel, "trading212")
            if t212_account:
                t212_account.balance = float(czk_total_value)
                t212_account.currency = target_currency
                t212_account.last_synced = datetime.utcnow()
                t212_account.details_json = details_payload
            else:
                t212_account = AccountModel(
                    id="trading212",
                    name="Trading 212",
                    type="investment",
                    balance=float(czk_total_value),
                    currency=target_currency,
                    institution="Trading 212",
                    details_json=details_payload,
                    last_synced=datetime.utcnow()
                )
                db.add(t212_account)

            # Save daily portfolio snapshot (upsert by date)
            try:
                today = datetime.utcnow().strftime("%Y-%m-%d")
                snapshot_stmt = pg_insert(PortfolioSnapshotModel).values({
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
                    index_elements=["snapshot_date"],
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
    from sqlalchemy import func

    result = await db.execute(
        select(SyncStatusModel).order_by(SyncStatusModel.id.desc()).limit(1)
    )
    sync_status = result.scalar_one_or_none()

    # Count successful syncs today (UTC date)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await db.execute(
        select(func.count()).select_from(SyncStatusModel).where(
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
        "last_sync": sync_status.completed_at.isoformat() if sync_status.completed_at else sync_status.started_at.isoformat(),
        "accounts_synced": sync_status.accounts_synced,
        "transactions_synced": sync_status.transactions_synced,
        "error": sync_status.error_message,
        "syncs_today": syncs_today,
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