"""Výplatní období — hranice rozpočtového období odvozené ode dne výplaty.

Rozpočtové období neběží od 1. dne měsíce, ale ode dne, kdy dorazí výplata, do
dne před příchodem další výplaty. Hranice se bere ze **skutečné** transakce
kategorie ``Salary`` v daném měsíci; pro měsíce, kde výplata ještě nedorazila, se
**odhaduje** z mediánu dne minulých výplat s posunem na předchozí pracovní den
(výplata chodí „do 8." — dřív, když 8. padne na víkend).

Jediný zdroj pravdy pro okno období — sdílí ho monthly_budget, dashboard i cashflow.
"""
import calendar
from datetime import date, timedelta
from statistics import median
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import TransactionModel

# Cílový den výplaty bez historie (než se objeví první transakce Salary).
DEFAULT_PAY_DAY = 8


def _parse_ym(year_month: str) -> tuple[int, int]:
    year, month = (int(x) for x in year_month.split("-"))
    return year, month


def next_month(year_month: str) -> str:
    year, month = _parse_ym(year_month)
    if month == 12:
        return f"{year + 1}-01"
    return f"{year}-{month + 1:02d}"


def prev_month(year_month: str) -> str:
    year, month = _parse_ym(year_month)
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def _easter_sunday(year: int) -> date:
    """Velikonoční neděle (anonymní gregoriánský algoritmus)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def czech_holidays(year: int) -> set[date]:
    """České státní svátky (dny pracovního klidu) v daném roce."""
    easter = _easter_sunday(year)
    fixed = [
        (1, 1), (5, 1), (5, 8), (7, 5), (7, 6), (9, 28),
        (10, 28), (11, 17), (12, 24), (12, 25), (12, 26),
    ]
    return {date(year, m, d) for m, d in fixed} | {
        easter - timedelta(days=2),  # Velký pátek
        easter + timedelta(days=1),  # Velikonoční pondělí
    }


def _to_business_day(d: date) -> date:
    """Posun na předchozí pracovní den, když datum padne na víkend nebo státní
    svátek (výplata chodí „do 8." — dřív, ne později)."""
    while d.weekday() >= 5 or d in czech_holidays(d.year):  # 5 = sobota, 6 = neděle
        d -= timedelta(days=1)
    return d


def _parse_iso(d: str) -> Optional[date]:
    if not d or len(d) < 10:
        return None
    return date(int(d[:4]), int(d[5:7]), int(d[8:10]))


async def _past_salary_days(db: AsyncSession, user_id: int) -> list[int]:
    """Dny v měsíci z posledních ~8 skutečných výplat — pro medián cílového dne."""
    rows = (await db.execute(
        select(TransactionModel.date)
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.account_type == "bank",
            TransactionModel.category == "Salary",
            TransactionModel.amount > 0,
        )
        .order_by(TransactionModel.date.desc())
        .limit(8)
    )).scalars().all()
    return [int(d[8:10]) for d in rows if len(d) >= 10]


async def _actual_arrival(db: AsyncSession, user_id: int, year_month: str) -> Optional[date]:
    """Datum skutečné výplaty v kalendářním měsíci M (nejvyšší částka, kdyby jich
    bylo víc). None, když v tom měsíci žádná výplata není."""
    row = (await db.execute(
        select(TransactionModel.date)
        .where(
            TransactionModel.user_id == user_id,
            TransactionModel.account_type == "bank",
            TransactionModel.category == "Salary",
            TransactionModel.amount > 0,
            TransactionModel.date.like(f"{year_month}-%"),
        )
        .order_by(TransactionModel.amount.desc())
        .limit(1)
    )).scalar_one_or_none()
    return _parse_iso(row) if row else None


async def salary_arrival_date(
    db: AsyncSession,
    user_id: int,
    year_month: str,
    past_days: Optional[list[int]] = None,
) -> date:
    """Den, kdy výplata za období M dorazila (skutečnost) nebo dorazí (predikce).

    ``past_days`` lze předat, aby se medián dne nedotazoval opakovaně (viz
    ``period_bounds``, které řeší M i M+1)."""
    actual = await _actual_arrival(db, user_id, year_month)
    if actual is not None:
        return actual
    if past_days is None:
        past_days = await _past_salary_days(db, user_id)
    target_day = int(median(past_days)) if past_days else DEFAULT_PAY_DAY
    year, month = _parse_ym(year_month)
    days_in_month = calendar.monthrange(year, month)[1]
    return _to_business_day(date(year, month, min(target_day, days_in_month)))


async def period_bounds(db: AsyncSession, user_id: int, year_month: str) -> tuple[str, str]:
    """(start, end) výplatního období M jako YYYY-MM-DD; ``end`` je exkluzivní
    den příchodu výplaty měsíce M+1."""
    past_days = await _past_salary_days(db, user_id)
    start = await salary_arrival_date(db, user_id, year_month, past_days)
    end = await salary_arrival_date(db, user_id, next_month(year_month), past_days)
    return start.isoformat(), end.isoformat()


async def current_period_year_month(db: AsyncSession, user_id: int, today: date) -> str:
    """``year_month`` výplatního období, ve kterém leží ``today``. Před příchodem
    výplaty tohoto měsíce financuje útratu ještě minulá výplata → minulý měsíc."""
    ym = today.strftime("%Y-%m")
    arrival = await salary_arrival_date(db, user_id, ym)
    return ym if today >= arrival else prev_month(ym)
