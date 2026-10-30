"""Testy hranic výplatního období (services/salary_period).

Async funkce čtou transakce Salary — testujeme je přes lehký fake session, který
podle tvaru dotazu vrátí buď skutečnou výplatu daného měsíce (dotaz s LIKE
"YYYY-MM-%"), nebo seznam dnů minulých výplat (dotaz bez LIKE).
"""
from datetime import date

from services.salary_period import (
    _to_business_day,
    czech_holidays,
    next_month,
    prev_month,
    salary_arrival_date,
    period_bounds,
    current_period_year_month,
)


# ── pure helpers ──────────────────────────────────────────────────────────

def test_to_business_day_shifts_weekend_back_to_friday():
    # 2022-01-01 je sobota, 2022-01-02 neděle → oboje na pátek 2021-12-31.
    assert _to_business_day(date(2022, 1, 1)) == date(2021, 12, 31)
    assert _to_business_day(date(2022, 1, 2)) == date(2021, 12, 31)
    # 2022-01-03 je pondělí → beze změny.
    assert _to_business_day(date(2022, 1, 3)) == date(2022, 1, 3)


def test_to_business_day_shifts_holiday_back():
    # 2025-05-08 (Den vítězství) je čtvrtek → středa 7. 5.
    assert _to_business_day(date(2025, 5, 8)) == date(2025, 5, 7)
    # 2026-01-01 je čtvrtek (svátek) → středa 31. 12. 2025.
    assert _to_business_day(date(2026, 1, 1)) == date(2025, 12, 31)
    # Víkend + svátek za sebou: 2027-12-26 je neděle, 25. sobota, 24. pátek (svátek) → čtvrtek 23. 12.
    assert _to_business_day(date(2027, 12, 26)) == date(2027, 12, 23)


def test_czech_holidays_include_easter():
    # Velikonoce 2026: neděle 5. 4. → Velký pátek 3. 4., pondělí 6. 4.
    h = czech_holidays(2026)
    assert date(2026, 4, 3) in h and date(2026, 4, 6) in h
    # Velikonoce 2025: neděle 20. 4.
    h = czech_holidays(2025)
    assert date(2025, 4, 18) in h and date(2025, 4, 21) in h


def test_next_prev_month_cross_year():
    assert next_month("2026-12") == "2027-01"
    assert prev_month("2026-01") == "2025-12"
    assert next_month("2026-07") == "2026-08"
    assert prev_month("2026-08") == "2026-07"


# ── fake DB session ───────────────────────────────────────────────────────

class _FakeScalars:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class _FakeResult:
    def __init__(self, scalar_value=None, scalars_values=None):
        self._scalar = scalar_value
        self._scalars = scalars_values or []

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return _FakeScalars(self._scalars)

    def all(self):
        # dotaz na minulé výplaty vrací řádky (date, amount)
        return [v if isinstance(v, tuple) else (v, 60000) for v in self._scalars]


class FakeSession:
    """Rozliší dotaz na skutečnou výplatu (LIKE "YYYY-MM-%") od dotazu na dny
    minulých výplat podle bind parametrů zkompilovaného SELECTu."""

    def __init__(self, actual_by_month=None, past_dates=None):
        self.actual_by_month = actual_by_month or {}
        self.past_dates = past_dates or []

    async def execute(self, stmt):
        params = stmt.compile().params
        like = next((v for v in params.values()
                     if isinstance(v, str) and v.endswith("-%")), None)
        if like is not None:
            month = like[:-2]  # "2026-08-%" → "2026-08"
            return _FakeResult(scalar_value=self.actual_by_month.get(month))
        return _FakeResult(scalars_values=self.past_dates)


# ── salary_arrival_date ───────────────────────────────────────────────────

async def test_actual_salary_wins_over_prediction():
    db = FakeSession(actual_by_month={"2026-08": "2026-08-05"},
                     past_dates=["2020-05-08"])
    assert await salary_arrival_date(db, 1, "2026-08") == date(2026, 8, 5)


async def test_prediction_uses_median_day_and_weekend_shift():
    # Žádná skutečná výplata; medián dne = 1. Cíl 2022-01-01 je sobota → 2021-12-31.
    db = FakeSession(past_dates=["2020-05-01"])
    assert await salary_arrival_date(db, 1, "2022-01") == date(2021, 12, 31)


async def test_prediction_default_day_without_history():
    # Bez historie fallback na den 8; 2026-09-08 je úterý → beze změny.
    db = FakeSession()
    assert await salary_arrival_date(db, 1, "2026-09") == date(2026, 9, 8)


# ── period_bounds ─────────────────────────────────────────────────────────

async def test_period_bounds_from_actual_salaries():
    db = FakeSession(actual_by_month={
        "2026-08": "2026-08-07",
        "2026-09": "2026-09-08",
    })
    assert await period_bounds(db, 1, "2026-08") == ("2026-08-07", "2026-09-08")


# ── current_period_year_month ─────────────────────────────────────────────

async def test_current_period_after_salary_arrived():
    db = FakeSession(actual_by_month={"2026-08": "2026-08-05"})
    assert await current_period_year_month(db, 1, date(2026, 8, 10)) == "2026-08"


async def test_current_period_before_salary_is_previous_month():
    # Výplata za srpen ještě nedorazila (jen predikce ~15.), dnes 3. 8. → období červenec.
    db = FakeSession(past_dates=["2020-05-15"])
    assert await current_period_year_month(db, 1, date(2026, 8, 3)) == "2026-07"


# ── odhad dne výplaty ignoruje vedlejší drobné platby ────────────────────

async def test_past_days_use_largest_payment_per_month():
    from services.salary_period import _past_salary_days
    # V září dorazila výplata 7., ale i testovací 1 Kč platby 14. — počítá se 7.
    db = FakeSession(past_dates=[
        ("2026-09-14", 1), ("2026-09-14", 1), ("2026-09-07", 61270),
        ("2026-08-07", 59075),
    ])
    assert await _past_salary_days(db, 1) == [7, 7]
