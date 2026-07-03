"""Auto-split rules (VYLEPSENI.md 3.1): automatické dělení společných výdajů.

Pravidlo = pattern (podřetězec popisu / protistrany / IBANu) + moje část
(procentem nebo pevnou částkou). Sync jím při INSERTu nové transakce rovnou
vyplní `my_share_amount`, takže nájem/energie se dělí samy. Ruční hodnoty se
nikdy nepřepisují — pravidla se aplikují jen tam, kde `my_share_amount` chybí.
"""
from typing import Optional

from models import ShareRuleModel


def haystack_from_tx_dict(tx: dict) -> str:
    """Text, proti kterému se matchují patterny — popis + protistrany + IBANy."""
    parts = [
        tx.get("remittanceInformationUnstructured") or "",
        tx.get("remittanceInformationStructured") or "",
        tx.get("creditorName") or "",
        tx.get("debtorName") or "",
        ((tx.get("creditorAccount") or {}).get("iban") or ""),
        ((tx.get("debtorAccount") or {}).get("iban") or ""),
    ]
    return " ".join(str(p) for p in parts).lower()


def compute_my_share(amount: float, rule: ShareRuleModel) -> Optional[float]:
    """Moje část výdaje podle pravidla; nikdy víc než plná částka."""
    full = abs(amount)
    if rule.my_amount_override is not None:
        return round(min(rule.my_amount_override, full), 2)
    if rule.my_percentage is not None:
        return round(full * rule.my_percentage / 100.0, 2)
    return None


def match_share_rule(tx_dict: dict, amount: float, rules) -> Optional[ShareRuleModel]:
    """První aktivní pravidlo odpovídající transakci — jen pro výdaje."""
    if amount >= 0 or not rules:
        return None
    haystack = haystack_from_tx_dict(tx_dict)
    for rule in rules:
        if rule.is_active and rule.pattern and rule.pattern in haystack:
            return rule
    return None
