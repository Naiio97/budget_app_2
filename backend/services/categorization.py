"""Kategorizace transakcí — jediné místo, kde se rozhoduje výsledná kategorie.

Priorita: uživatelská pravidla > purposeCode > MCC > naučená/built-in
pravidla (klíčová slova, viz default_rules.py) > metadata fallback ("Other").

Matching je case/diakritika-insensitive substring s ochranou hranice slova:
shoda se odmítne, pokud je znak těsně před/za ní alfabetický (aby krátký
pattern jako "dm" nechytal substring uprostřed jiného slova, např. "odměna").
Číslice/mezera/interpunkce hranici neruší, takže dál funguje např. "lidl"
proti merchantu slepenému s referenčním kódem ("5465LIDL").
"""
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import CategoryRuleModel

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

# Specifičtější (delší) pattern vyhrává vždy — match_count je jen tiebreak
# mezi stejně dlouhými patterny. Dřív se řadilo primárně podle match_count,
# takže krátký často používaný pattern mohl systematicky přebít delší a
# přesnější (u uživatelských pravidel se dokonce délka vůbec neřešila).
RULE_ORDER = (func.length(CategoryRuleModel.pattern).desc(), CategoryRuleModel.match_count.desc())


def fold(text: str | None) -> str:
    """Lowercase + strip diakritiky (NFKD), ať pattern "kavarna" matchne popis
    "Kavárna Fra" a naopak — bez nutnosti mít v pravidlech obě varianty."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text).lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def pattern_matches(desc_folded: str, pattern_folded: str) -> bool:
    """Substring match s ochranou hranice slova — viz docstring modulu."""
    if not pattern_folded:
        return False
    start = 0
    while True:
        idx = desc_folded.find(pattern_folded, start)
        if idx == -1:
            return False
        before = desc_folded[idx - 1] if idx > 0 else ""
        after_idx = idx + len(pattern_folded)
        after = desc_folded[after_idx] if after_idx < len(desc_folded) else ""
        if not before.isalpha() and not after.isalpha():
            return True
        start = idx + 1


def combined_text(tx: dict) -> str:
    """Spojí všechna pole, kde může sedět merchant/protistrana.

    Dřív se bralo jen první neprázdné z (unstructured, creditorName,
    debtorName) — pravidlo naučené z creditorName tak přestalo sedět, jakmile
    banka poslala i (jiný) remittance text u další platby od stejné firmy.

    Obsahuje i čísla účtů protistran (IBAN/BBAN), takže jde založit pravidlo
    na konkrétní protiúčet — např. splátky kreditky podle jejího čísla, když
    popis nese jen jméno majitele.
    """
    parts = [
        tx.get("remittanceInformationUnstructured"),
        tx.get("remittanceInformationStructured"),
        tx.get("additionalInformation"),
        tx.get("creditorName"),
        tx.get("debtorName"),
    ]
    for side in ("creditorAccount", "debtorAccount"):
        acc = tx.get(side)
        if isinstance(acc, dict):
            parts.append(acc.get("iban"))
            parts.append(acc.get("bban"))
    return " ".join(str(p) for p in parts if p)


def categorize_by_purpose_code(tx: dict) -> str | None:
    """Return category based on ISO 20022 purposeCode, or None if not applicable"""
    purpose = tx.get("purposeCode") or tx.get("purpose_code") or ""
    if not purpose:
        return None
    return PURPOSE_CODE_MAP.get(purpose.upper())  # may be None


def categorize_by_mcc(tx: dict) -> str | None:
    """Return category based on MCC code, or None if no MCC present"""
    mcc = tx.get("merchantCategoryCode") or tx.get("mcc") or ""
    if not mcc:
        return None
    return MCC_CATEGORY_MAP.get(str(mcc).strip())


def categorize_transaction(tx: dict) -> str:
    """Category detection from transaction metadata only: purposeCode → MCC.

    Keyword matching lives in category_rules in the DB (is_builtin=True, see
    default_rules.py) — merchant keywords are the learned-rules bucket now,
    so callers that want them must go through the rule-based variants below.
    """
    by_purpose = categorize_by_purpose_code(tx)
    if by_purpose:
        return by_purpose

    by_mcc = categorize_by_mcc(tx)
    if by_mcc:
        return by_mcc

    return "Other"


def _match_rules(desc_folded: str, rules: list[CategoryRuleModel]) -> str | None:
    for rule in rules:
        if pattern_matches(desc_folded, fold(rule.pattern)):
            rule.match_count += 1
            return rule.category
    return None


async def _load_rules(db: AsyncSession, user_id: int, is_user_defined: bool) -> list[CategoryRuleModel]:
    result = await db.execute(
        select(CategoryRuleModel)
        .where(
            CategoryRuleModel.user_id == user_id,
            CategoryRuleModel.is_user_defined == is_user_defined,
        )
        .order_by(*RULE_ORDER)
    )
    return list(result.scalars())


async def categorize_transaction_with_rules(tx: dict, db: AsyncSession, user_id: int) -> str:
    """Smart category detection with priority: user rules > purposeCode > MCC > keywords"""
    desc = fold(combined_text(tx))

    # 1. User-defined rules (highest priority — explicit user preference)
    matched = _match_rules(desc, await _load_rules(db, user_id, is_user_defined=True))
    if matched:
        return matched

    # 2. purposeCode (ISO 20022 — very reliable for salary, insurance, tax, rent)
    by_purpose = categorize_by_purpose_code(tx)
    if by_purpose:
        return by_purpose

    # 3. MCC code (merchant category — reliable for card payments)
    by_mcc = categorize_by_mcc(tx)
    if by_mcc:
        return by_mcc

    # 4. Learned + builtin rules (more specific pattern wins first — see RULE_ORDER)
    if desc:
        matched = _match_rules(desc, await _load_rules(db, user_id, is_user_defined=False))
        if matched:
            return matched

    # 5. Metadata fallback (purposeCode / MCC)
    return categorize_transaction(tx)


def categorize_with_preloaded_rules(
    tx: dict,
    user_rules: list[CategoryRuleModel],
    learned_rules: list[CategoryRuleModel],
) -> str:
    """In-memory variant of categorize_transaction_with_rules — avoids N+1 DB
    queries during sync. Caller must preload both lists ordered by RULE_ORDER.
    Priority: user rules > purposeCode > MCC > learned rules > keyword fallback."""
    desc = fold(combined_text(tx))

    matched = _match_rules(desc, user_rules)
    if matched:
        return matched

    by_purpose = categorize_by_purpose_code(tx)
    if by_purpose:
        return by_purpose

    by_mcc = categorize_by_mcc(tx)
    if by_mcc:
        return by_mcc

    if desc:
        matched = _match_rules(desc, learned_rules)
        if matched:
            return matched

    return categorize_transaction(tx)
