"""Serializace časů do API odpovědí.

DB ukládá naivní datetime v UTC (datetime.utcnow). Když se pošle klientovi
bez označení zóny, prohlížeč ho vyloží jako lokální čas a ukáže ho posunutý
(v ČR o 1–2 h méně). Proto se před isoformat() doplní tzinfo=UTC — klient
si pak čas převede do své zóny sám.
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naivní UTC now — stejná sémantika jako deprecated datetime.utcnow().

    DB sloupce jsou naivní (bez tzinfo), takže aware datetime by rozbil
    porovnávání i ukládání. Až se sloupce zmigrují na timezone-aware,
    stačí smazat .replace() tady."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
