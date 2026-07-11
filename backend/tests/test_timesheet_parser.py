"""Tests for services.timesheet_parser — pure functions, no DB.

Syntetické .xlsx sešity stavěné přímo v testu přes openpyxl (žádná reálná
data). Layout dle parseru: sloupce A–E = DEN, DOBA, PŘESTÁVKY, STAV, DÉLKA;
nový den = "N. denname" ve sloupci A, pokračovací řádky mají A prázdné,
řádek "Celkem…" ukončuje data.
"""
import io

import pytest
from openpyxl import Workbook

from services.timesheet_parser import (
    compute_fond_days,
    night_overlap,
    parse_hours,
    parse_range,
    parse_timesheet,
    range_overlap,
)

HEADER = ("DEN", "DOBA", "PŘESTÁVKY", "STAV", "DÉLKA")


def build_timesheet(rows) -> bytes:
    """Postaví .xlsx z pětic (DEN, DOBA, PŘESTÁVKY, STAV, DÉLKA)."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# --- parse_hours -------------------------------------------------------------

def test_parse_hours_time_format():
    assert parse_hours("8:00") == pytest.approx(8.0)
    assert parse_hours("7:30") == pytest.approx(7.5)
    assert parse_hours("0:15") == pytest.approx(0.25)


def test_parse_hours_day_format_multiplies_by_eight():
    assert parse_hours("1 d") == pytest.approx(8.0)
    assert parse_hours("0,5 d") == pytest.approx(4.0)
    assert parse_hours("1,5 d") == pytest.approx(12.0)


def test_parse_hours_garbage_and_none_give_zero():
    assert parse_hours(None) == 0.0
    assert parse_hours("") == 0.0
    assert parse_hours("nesmysl") == 0.0


# --- parse_range -------------------------------------------------------------

def test_parse_range_plain():
    assert parse_range("8:00 - 16:30") == (8.0, 16.5)
    assert parse_range("22:00-6:00") == (22.0, 30.0)  # i bez mezer


def test_parse_range_midnight_crossing_adds_24_to_end():
    assert parse_range("20:00 - 02:00") == (20.0, 26.0)


def test_parse_range_garbage_and_none_give_none():
    assert parse_range(None) is None
    assert parse_range("") is None
    assert parse_range("nesmysl") is None
    assert parse_range("8:00") is None  # samotný čas není rozsah


# --- night_overlap -----------------------------------------------------------

def test_night_overlap_none_and_daytime_zero():
    assert night_overlap(None) == 0.0
    assert night_overlap((8.0, 16.5)) == 0.0


def test_night_overlap_evening_window():
    # 20:00–02:00 (normalizováno na [20, 26]) → noční část 22:00–02:00
    assert night_overlap((20.0, 26.0)) == pytest.approx(4.0)


def test_night_overlap_early_morning_window():
    # 0:00–4:00 chytá okno (-2, 6) — pojistka proti "zjednodušení" na jedno okno
    assert night_overlap((0.0, 4.0)) == pytest.approx(4.0)


def test_night_overlap_full_night_band():
    assert night_overlap((22.0, 30.0)) == pytest.approx(8.0)
    assert night_overlap((5.0, 7.0)) == pytest.approx(1.0)  # jen 5:00–6:00


# --- range_overlap -----------------------------------------------------------

def test_range_overlap_basic():
    assert range_overlap((8.0, 16.0), (12.0, 20.0)) == pytest.approx(4.0)
    assert range_overlap((8.0, 12.0), (14.0, 16.0)) == 0.0


def test_range_overlap_none_gives_zero():
    assert range_overlap(None, (8.0, 16.0)) == 0.0
    assert range_overlap((8.0, 16.0), None) == 0.0


# --- compute_fond_days -------------------------------------------------------

def test_compute_fond_days_known_months():
    assert compute_fond_days("2025-01") == 23
    assert compute_fond_days("2025-02") == 20


# --- parse_timesheet: klasifikační větve -------------------------------------

def test_plain_worked_day_flexi():
    data = build_timesheet([
        ("3. pondělí", "8:00 - 16:30", "0:30", "Flexi pracovní doba", "8:00"),
    ])
    r = parse_timesheet(data)
    assert r.worked_days == 1
    assert r.fond_days == 1
    assert r.total_hours == pytest.approx(8.0)
    assert r.pres_wd == 0.0
    assert r.pres_we == 0.0
    assert r.dov_h == 0.0


def test_weekday_overtime_on_continuation_row():
    data = build_timesheet([
        ("3. pondělí", "8:00 - 16:30", None, "Flexi pracovní doba", "8:00"),
        (None, "17:00 - 19:00", None, "Přesčas", "2:00"),
    ])
    r = parse_timesheet(data)
    assert r.pres_wd == pytest.approx(2.0)
    assert r.pres_we == 0.0
    assert r.noc_h == 0.0
    assert r.worked_days == 1
    assert r.fond_days == 1  # pokračovací řádek (A prázdné) nesmí přičíst den
    assert r.total_hours == pytest.approx(10.0)


def test_weekend_overtime_saturday():
    data = build_timesheet([
        ("14. sobota", "10:00 - 14:00", None, "Přesčas", "4:00"),
    ])
    r = parse_timesheet(data)
    assert r.pres_we == pytest.approx(4.0)
    assert r.pres_wd == 0.0
    assert r.fond_days == 0  # sobota se do fondu nepočítá
    assert r.worked_days == 0  # přesčas bez směny nedává stravenku


def test_night_overtime_midnight_crossing():
    data = build_timesheet([
        ("5. středa", "20:00 - 02:00", None, "Přesčas", "6:00"),
    ])
    r = parse_timesheet(data)
    assert r.pres_wd == pytest.approx(6.0)
    assert r.noc_h == pytest.approx(4.0)  # jen část 22:00–02:00


def test_night_overtime_early_morning_window():
    # pojistka na druhé noční okno (-2, 6) — směna začínající po půlnoci
    data = build_timesheet([
        ("6. čtvrtek", "0:00 - 4:00", None, "Přesčas", "4:00"),
    ])
    r = parse_timesheet(data)
    assert r.pres_wd == pytest.approx(4.0)
    assert r.noc_h == pytest.approx(4.0)


def test_pohotovost_overlapping_same_day_overtime():
    data = build_timesheet([
        ("7. pátek", "8:00 - 16:30", None, "Flexi pracovní doba", "8:00"),
        (None, "17:00 - 20:00", None, "Pohotovost", "3:00"),
        (None, "18:00 - 20:00", None, "Přesčas", "2:00"),
    ])
    r = parse_timesheet(data)
    assert r.pohot_h == pytest.approx(3.0)
    assert r.pres_wd == pytest.approx(2.0)
    assert r.pohot_overlap_h == pytest.approx(2.0)  # 18–20 uvnitř 17–20


def test_dovolena_one_day_is_eight_hours():
    data = build_timesheet([
        ("8. pondělí", None, None, "Dovolená", "1 d"),
    ])
    r = parse_timesheet(data)
    assert r.dov_h == pytest.approx(8.0)
    assert r.worked_days == 0
    assert r.total_hours == pytest.approx(8.0)


def test_nominal_svatek_is_calendar_holiday_not_work():
    # Samotný řádek „Svátek" = kalendářní volno; u měsíční mzdy zůstává
    # v základu a neplatí se nic navíc (ověřeno proti pásce 2026-04)
    data = build_timesheet([
        ("9. úterý", "8:00 - 16:00", None, "Svátek", "8:00"),
    ])
    r = parse_timesheet(data)
    assert r.svatek_h == 0.0
    assert r.dov_h == 0.0
    assert r.pres_wd == 0.0
    assert r.worked_days == 0


def test_overtime_on_holiday_reclassified_to_svatek():
    # Přesčas v den se řádkem „Svátek" = práce ve svátek: 100% příplatek,
    # nejde do přesčasových sazeb; noční průnik platí dál (páska 2026-05)
    data = build_timesheet([
        ("9. pátek", "8:30 - 17:00", None, "Svátek", "8:00"),
        (None, "18:00 - 24:00", None, "Pohotovost - Víkend / Svátek", "6:00"),
        (None, "22:00 - 23:00", None, "Přesčas", "1:00"),
    ])
    r = parse_timesheet(data)
    assert r.svatek_h == pytest.approx(1.0)
    assert r.pres_wd == 0.0
    assert r.pres_we == 0.0
    assert r.noc_h == pytest.approx(1.0)
    assert r.pohot_h == pytest.approx(6.0)
    assert r.pohot_overlap_h == pytest.approx(1.0)


def test_pohotovost_vikend_svatek_category_does_not_mark_holiday():
    # Regresní pojistka: „Svátek" v názvu kategorie pohotovosti
    # („Pohotovost - Víkend / Svátek") NEznačí svátek — víkendový přesčas
    # musí zůstat klasifikovaný jako pres_we
    data = build_timesheet([
        ("10. sobota", "0:00 - 24:00", None, "Pohotovost - Víkend / Svátek", "24:00"),
        (None, "10:00 - 12:00", None, "Přesčas", "2:00"),
    ])
    r = parse_timesheet(data)
    assert r.svatek_h == 0.0
    assert r.pres_we == pytest.approx(2.0)


def test_prekazky_via_navsteva_lekare():
    data = build_timesheet([
        ("10. středa", "9:00 - 11:00", None, "Návštěva lékaře", "2:00"),
    ])
    r = parse_timesheet(data)
    assert r.prek_h == pytest.approx(2.0)
    assert r.worked_days == 0


def test_pracovni_volno():
    data = build_timesheet([
        ("11. čtvrtek", None, None, "Pracovní volno", "4:00"),
    ])
    r = parse_timesheet(data)
    assert r.volno_h == pytest.approx(4.0)
    assert r.worked_days == 0


def test_two_worked_rows_same_day_count_once_and_cap_at_eight():
    # Flexi + 8h řádek popisují tutéž směnu — den se počítá jednou
    # a do total_hours jde max 8 h, i když řádky v součtu dávají 16
    data = build_timesheet([
        ("12. pátek", "8:00 - 16:30", None, "Flexi pracovní doba", "8:00"),
        (None, "8:00 - 16:30", None, "8h pracovní doba", "8:00"),
    ])
    r = parse_timesheet(data)
    assert r.worked_days == 1
    assert r.total_hours == pytest.approx(8.0)


def test_celkem_row_terminates_parsing():
    data = build_timesheet([
        ("3. pondělí", "8:00 - 16:30", None, "Flexi pracovní doba", "8:00"),
        ("Celkem", None, None, None, "8:00"),
        ("4. úterý", "17:00 - 19:00", None, "Přesčas", "2:00"),
    ])
    r = parse_timesheet(data)
    assert r.pres_wd == 0.0  # řádky za "Celkem" se ignorují
    assert r.fond_days == 1
    assert r.worked_days == 1
    assert r.total_hours == pytest.approx(8.0)


def test_multi_day_sheet_accumulates_across_days():
    data = build_timesheet([
        ("1. pondělí", "8:00 - 16:30", None, "Flexi pracovní doba", "8:00"),
        (None, "17:00 - 19:00", None, "Přesčas", "2:00"),
        ("2. úterý", None, None, "Dovolená", "1 d"),
        ("6. sobota", "10:00 - 14:00", None, "Přesčas", "4:00"),
        ("Celkem", None, None, None, None),
    ])
    r = parse_timesheet(data)
    assert r.fond_days == 2  # pondělí + úterý, sobota ne
    assert r.worked_days == 1
    assert r.pres_wd == pytest.approx(2.0)
    assert r.pres_we == pytest.approx(4.0)
    assert r.dov_h == pytest.approx(8.0)
    assert r.total_hours == pytest.approx(8.0 + 2.0 + 8.0 + 4.0)
