"""Výchozí (builtin) pravidla kategorizace.

Dřív žila jako natvrdo zadrátovaný slovník klíčových slov v routers/sync.py —
teď se seedují do `category_rules` (is_builtin=True), takže je uživatel může
prohlížet, mazat a přebíjet vlastními pravidly z UI. Engine je načítá společně
s naučenými pravidly (is_user_defined=False).

Pozor: pořadí má význam jen při seedování — duplicitní pattern si nechá první
kategorii (např. "tesco" je Food, ne Shopping), stejně jako se dřív vyhodnocoval
slovník shora dolů.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import CategoryRuleModel

_KEYWORDS_BY_CATEGORY: dict[str, list[str]] = {
    "Food": [
        "lidl", "albert", "tesco", "billa", "kaufland", "penny", "globus", "makro", "coop", "norma", "žabka",
        "restaurant", "restaurace", "bistro", "food", "wolt", "dáme jídlo", "dame jidlo", "damejidlo", "bolt food", "foodora",
        "jídelna", "jidelna", "mcdonalds", "mcdonald", "kfc", "burger king", "subway", "starbucks", "costa",
        "pizza", "sushi", "kebab", "banh mi", "thai", "vietnam", "čína", "china", "asia", "grill",
        "kavárna", "kavarna", "café", "cafe", "pekárna", "pekarna", "cukrárna", "cukrarna", "bakery",
        "hospoda", "pub", "pivnice", "bar", "pivovar", "brewery",
        "bageterie", "qerko", "rohlik", "rohlík", "košík", "kosik",
        "řeznictví", "reznictvi", "uzeniny", "maso",
        "luxor", "miners", "cinestar bar",
    ],
    "Transport": [
        "uber", "bolt", "liftago", "taxi",
        "benzina", "orlen", "omv", "shell", "mol", "eni", "cng", "euro oil", "pap oil",
        "mhd", "jízdenka", "jizdenka", "prague transport", "dpp", "pid", "litacka", "lítačka",
        "parking", "parkovani", "parkoviště", "parkování",
        "dálnice", "dalnice", "mýto", "myto",
        "autoservis", "pneuservis", "autopůjčovna",
    ],
    "Utilities": [
        "čez", "cez", "pražské vodovody", "innogy", "eon", "pre", "pražská energetika",
        "vodafone", "t-mobile", "o2", "nordic telecom", "nej.cz",
        "upc", "skylink", "digi",
        "pojištění", "pojisteni", "allianz", "generali", "kooperativa", "čpp", "cpp",
        "nájem", "najem", "rent", "svj", "bytové",
        "plyn", "elektřina", "elektrina", "voda", "teplo",
    ],
    "Entertainment": [
        "netflix", "spotify", "hbo", "disney", "apple tv", "youtube", "deezer", "tidal",
        "cinema", "kino", "cinestar", "cinema city", "divadlo", "theatre",
        "steam", "playstation", "xbox", "nintendo", "epic games", "tipsport", "fortuna", "sazka",
        "fitness", "gym", "posilovna", "bazén", "bazen", "wellness", "sauna", "squash", "tenis",
        "ticketmaster", "ticketportal", "goout", "eventim",
        "audioteka", "bookbeat",
    ],
    "Shopping": [
        "amazon", "alza", "mall.cz", "czc", "datart", "electro world", "planeo", "okay",
        "zara", "h&m", "reserved", "about you", "zalando", "answear", "bata", "deichmann",
        "ikea", "obi", "hornbach", "bauhaus", "baumax", "jysk", "sconto", "xxxlutz", "asko", "möbelix",
        "dm", "rossmann", "douglas", "sephora",
        "heureka", "aliexpress", "wish", "shein", "temu",
        "decathlon", "sportisimo", "hervis",
    ],
    # Pozor: "plat" tu záměrně není — je to substring slova "platba", takže by
    # chytal každou nezařazenou platbu (starý kód to jen maskoval pořadím slovníku).
    "Salary": [
        "mzda", "salary", "výplata", "vyplata", "odměna", "odmena", "bonus", "prémie", "premie",
    ],
    "Health": [
        "lékárna", "lekarna", "pharmacy", "doktor", "doctor", "nemocnice", "hospital", "klinika", "clinic",
        "zubař", "zubar", "dentist", "optika", "optician", "zdravotní", "zdravotni",
    ],
}


def default_category_rules() -> list[tuple[str, str]]:
    """(pattern, category) bez duplicit — první kategorie v pořadí slovníku vyhrává."""
    seen: set[str] = set()
    rules: list[tuple[str, str]] = []
    for category, keywords in _KEYWORDS_BY_CATEGORY.items():
        for kw in keywords:
            if kw in seen:
                continue
            seen.add(kw)
            rules.append((kw, category))
    return rules


async def seed_default_rules(db: AsyncSession, user_id: int) -> int:
    """Založí uživateli výchozí pravidla; přeskočí patterny, které už má.

    Volá se při vzniku uživatele (a jednorázově migrací pro stávající).
    Vrací počet vložených pravidel. Necommituje — commit řídí volající.
    """
    existing = await db.execute(
        select(CategoryRuleModel.pattern).where(CategoryRuleModel.user_id == user_id)
    )
    existing_patterns = {p for (p,) in existing.all()}

    inserted = 0
    for pattern, category in default_category_rules():
        if pattern in existing_patterns:
            continue
        db.add(CategoryRuleModel(
            user_id=user_id,
            pattern=pattern,
            category=category,
            is_user_defined=False,
            is_builtin=True,
            match_count=0,
        ))
        inserted += 1
    return inserted
