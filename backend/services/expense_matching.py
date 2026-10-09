"""Párování výdajů rozpočtu s bankovními transakcemi.

Čistá funkce bez DB — router jí předá načtené výdaje a transakce. Důvody
párování podle spolehlivosti:

* ``pattern``  — vzor šablony (název protistrany) je v popisu / raw_json,
* ``label``    — štítek, který uživatel platbě sám dal: jméno kontaktu příjemce
  (např. „SK - Notebook" k IBANu) nebo tag („Půjčka na kolo"); sedí, když se
  shoduje s názvem výdaje nebo sdílí jeho výrazné slovo (≥ 4 znaky),
* ``name``     — celý název výdaje je v popisu platby (typicky zpráva příjemci:
  „Posilovna", „Energie 10", „Kapesné"). Když se částka liší o víc než
  25 %, shoda váží míň než přesná částka jinde; nad 60 % se nepáruje vůbec,
* ``schedule`` — splátka úvěru: přesná částka do 3 dnů od data splatnosti
  (platby dál než 10 dní od splatnosti se k ní nepárují vůbec),
* ``amount``   — přesná částka (±0,5 Kč, u velkých částek ±0,05 %), jen když je jednoznačná,
* ``category`` — kategorie šablony + částka do 10 %, jen když je jednoznačná.

Samotná přibližná částka (±5 %) už nestačí: lepila „zaplaceno" na nesouvisející
platby (drobný poplatek 55 Kč ↔ nákup 56,70 Kč).
"""
import re
from collections import Counter
from datetime import date
from typing import Iterable, Optional

from services.categorization import fold

SCORE = {"pattern": 100, "label": 90, "name": 80, "schedule": 70, "amount": 50, "category": 30}
AMOUNT_TOLERANCE_CZK = 0.5
AMOUNT_TOLERANCE_REL = 0.0005  # u velkých částek (5001 vs 5000) stačí 0,05 %
NAME_AMOUNT_OFF = 0.25      # nad tímhle rozdílem shoda názvu ztrácí váhu
NAME_AMOUNT_REJECT = 0.60   # nad tímhle rozdílem se shoda názvu zahazuje
NAME_OFF_SCORE = 40
CATEGORY_TOLERANCE = 0.10
MIN_NAME_LEN = 3
MIN_TOKEN_LEN = 4  # výrazné slovo názvu pro shodu se štítkem
# Důvody, které samy o sobě nerozliší dvě stejné platby → vyžadují jednoznačnost.
AMBIGUOUS_REASONS = ("amount", "category", "schedule")
# Splátky úvěrů (výdaj s ``due_date``): platba musí padnout k datu splatnosti.
SCHEDULE_DAYS = 3
MAX_DUE_GAP_DAYS = 10


def _day_gap(a: str, b: str) -> Optional[int]:
    try:
        return abs((date.fromisoformat(a[:10]) - date.fromisoformat(b[:10])).days)
    except (TypeError, ValueError):
        return None



def _label_hit(name: str, labels: list) -> bool:
    """Štítek (kontakt/tag) sedí na název výdaje: shoda celku, vložení jednoho do
    druhého, nebo společné výrazné slovo („Notebook Pro" ↔ „SK - Notebook")."""
    tokens = {t for t in re.split(r"\W+", name) if len(t) >= MIN_TOKEN_LEN}
    for label in labels:
        f = fold(label).strip()
        if len(f) < MIN_NAME_LEN:
            continue
        if f == name or (len(name) >= MIN_NAME_LEN and (name in f or f in name)):
            return True
        if tokens & {t for t in re.split(r"\W+", f) if len(t) >= MIN_TOKEN_LEN}:
            return True
    return False


def _reason(expense, tx, pattern: Optional[str], category: Optional[str], labels: list = ()) -> Optional[tuple]:
    """(důvod, skóre) nebo None."""
    desc = tx.description or ""
    if pattern and (pattern in desc.lower() or pattern in (tx.raw_json or "").lower()):
        return "pattern", SCORE["pattern"]
    diff = abs(abs(tx.amount) - abs(expense.amount))
    expected = abs(expense.amount) or 1.0
    due = getattr(expense, "due_date", None)
    gap = _day_gap(tx.date, due) if due else None
    if due and (gap is None or gap > MAX_DUE_GAP_DAYS):
        return None
    name = fold(expense.name or "").strip()
    if labels and diff / expected <= NAME_AMOUNT_REJECT and _label_hit(name, labels):
        return "label", SCORE["label"] if diff / expected <= NAME_AMOUNT_OFF else NAME_OFF_SCORE
    if len(name) >= MIN_NAME_LEN and name in fold(desc) and diff / expected <= NAME_AMOUNT_REJECT:
        return "name", SCORE["name"] if diff / expected <= NAME_AMOUNT_OFF else NAME_OFF_SCORE
    if diff <= max(AMOUNT_TOLERANCE_CZK, expected * AMOUNT_TOLERANCE_REL):
        if gap is not None and gap <= SCHEDULE_DAYS:
            return "schedule", SCORE["schedule"]
        return "amount", SCORE["amount"]
    if category and tx.category == category and diff <= expected * CATEGORY_TOLERANCE:
        return "category", SCORE["category"]
    return None


def match_expenses(
    expenses: Iterable,
    transactions: list,
    patterns: dict,
    categories: dict,
    used_tx_ids: set,
    labels: Optional[dict] = None,
) -> list[tuple]:
    """Vrátí [(expense, tx, reason)]. ``patterns`` / ``categories`` mapují
    ``expense.id`` → vzor / kategorie šablony. Žádný výdaj ani transakce se
    nepoužije dvakrát; ``used_tx_ids`` se doplní o nově spárované. ``labels``
    mapuje ``tx.id`` → seznam štítků (jména kontaktů, tagy)."""
    labels = labels or {}
    pairs = []
    for expense in expenses:
        for tx in transactions:
            if tx.id in used_tx_ids:
                continue
            found = _reason(expense, tx, patterns.get(expense.id), categories.get(expense.id), labels.get(tx.id, ()))
            if found:
                reason, score = found
                diff = abs(abs(tx.amount) - abs(expense.amount))
                pairs.append((expense, tx, reason, diff, score))

    # Splátka: z kandidátů v okně vyhrává platba nejblíž datu splatnosti
    # (v den splatnosti > o den dřív); při shodě vzdálenosti zůstává nejednoznačná.
    best_gap: dict = {}
    for expense, tx, reason, _, _ in pairs:
        if reason == "schedule":
            g = _day_gap(tx.date, expense.due_date)
            best_gap[expense.id] = min(g, best_gap.get(expense.id, g))
    pairs = [
        p for p in pairs
        if (p[2] == "schedule" and _day_gap(p[1].date, p[0].due_date) == best_gap[p[0].id])
        or p[2] in ("pattern", "label", "name")
        or (p[2] in ("amount", "category") and p[0].id not in best_gap)  # kalendář má přednost před částkou
    ]

    # Nejednoznačné důvody: transakce nebo výdaj má víc stejně dobrých kandidátů.
    per_tx = Counter(p[1].id for p in pairs if p[2] in AMBIGUOUS_REASONS)
    per_expense = Counter(p[0].id for p in pairs if p[2] in AMBIGUOUS_REASONS)
    pairs = [
        p for p in pairs
        if p[2] not in AMBIGUOUS_REASONS or (per_tx[p[1].id] == 1 and per_expense[p[0].id] == 1)
    ]

    pairs.sort(key=lambda p: (-p[4], p[3]))
    done_expenses: set = set()
    result = []
    for expense, tx, reason, _, _ in pairs:
        if expense.id in done_expenses or tx.id in used_tx_ids:
            continue
        done_expenses.add(expense.id)
        used_tx_ids.add(tx.id)
        result.append((expense, tx, reason))
    return result
