"""Tests for services.salary_calculator — pure functions, no DB.

Všechna čísla jsou vymyšlená kulatá čísla (salary 40000, prumer 200),
žádná reálná data z pásek. Baseline: fond_days=20 → fond 160 h → sazba 250.
"""
import pytest

from services.salary_calculator import calculate_salary
from services.timesheet_parser import TimesheetHours

SALARY = 40000.0   # → sazba 250 Kč/h při fondu 160 h
PRUMER = 200.0
FOND_DAYS = 20
STRAVENKA_DEN = 105.75


def test_baseline_month_every_field_hand_computed():
    # kombinovaný měsíc: dovolená, lékař, volno, přesčasy, svátek, noc, pohotovost
    hours = TimesheetHours(
        dov_h=8.0,
        prek_h=4.0,
        volno_h=2.0,
        pres_wd=3.0,
        pres_we=2.0,
        svatek_h=8.0,
        noc_h=2.0,
        pohot_h=10.0,
        pohot_overlap_h=4.0,
        worked_days=18,
    )
    r = calculate_salary(hours, fond_days=FOND_DAYS, salary=SALARY, prumer=PRUMER)

    assert r.fond_hodin == pytest.approx(160.0)
    assert r.hodinova_sazba == pytest.approx(250.0)
    # 160 - 8 - 4 - 2 + 3 + 2
    assert r.zakladni_hodiny == pytest.approx(151.0)
    assert r.zakladni_mzda == pytest.approx(37750.0)
    assert r.priplatek_prescas_vsedni == pytest.approx(3 * 200 * 0.25)   # 150
    assert r.priplatek_prescas_vikend == pytest.approx(2 * 200 * 0.50)   # 200
    assert r.priplatek_so_ne == pytest.approx(2 * 200 * 0.50)            # 200
    assert r.priplatek_svatek == pytest.approx(8 * 200 * 1.00)           # 1600
    assert r.priplatek_noc == pytest.approx(2 * 200 * 0.10)              # 40
    assert r.pohotovost_placena_h == pytest.approx(6.0)                  # 10 - 4
    assert r.priplatek_pohotovost == pytest.approx(6 * 200 * 0.10)       # 120
    assert r.nahrada_dovolena == pytest.approx(8 * 200)                  # 1600
    assert r.nahrada_prekazky == pytest.approx(4 * 200)                  # 800
    assert r.nahrada_prac_volno == pytest.approx(2 * 250)                # 500
    assert r.bonus == pytest.approx(0.0)
    # 37750+150+200+200+1600+40+120+1600+800+500
    assert r.hruba_mzda == pytest.approx(42960.0)
    assert r.zaklad_dane == pytest.approx(43000.0)                       # ceil na stovky
    assert r.socialni == pytest.approx(42960 * 0.071)                    # 3050.16
    assert r.zdravotni == pytest.approx(42960 * 0.045)                   # 1933.20
    assert r.dan == pytest.approx(43000 * 0.15 - 2570)                   # 3880
    assert r.cista_mzda == pytest.approx(42960 - 3050.16 - 1933.20 - 3880)  # 34096.64
    assert r.stravenky == pytest.approx(18 * STRAVENKA_DEN)              # 1903.50
    assert r.na_ucet == pytest.approx(34096.64 - 1903.50)                # 32193.14


def test_bonus_flows_into_hruba_and_downstream():
    hours = TimesheetHours(worked_days=20)
    base = calculate_salary(hours, fond_days=FOND_DAYS, salary=SALARY, prumer=PRUMER)
    r = calculate_salary(hours, fond_days=FOND_DAYS, salary=SALARY, prumer=PRUMER, bonus=5000.0)

    assert r.bonus == pytest.approx(5000.0)
    assert r.hruba_mzda == pytest.approx(base.hruba_mzda + 5000.0)       # 45000
    assert r.socialni == pytest.approx(45000 * 0.071)                    # 3195
    assert r.zdravotni == pytest.approx(45000 * 0.045)                   # 2025
    assert r.zaklad_dane == pytest.approx(45000.0)
    assert r.dan == pytest.approx(45000 * 0.15 - 2570)                   # 4180
    assert r.cista_mzda == pytest.approx(45000 - 3195 - 2025 - 4180)     # 35600
    assert r.na_ucet == pytest.approx(35600 - 20 * STRAVENKA_DEN)        # 33485


def test_zero_extras_month_only_base_salary():
    hours = TimesheetHours(worked_days=20)
    r = calculate_salary(hours, fond_days=FOND_DAYS, salary=SALARY, prumer=PRUMER)

    assert r.zakladni_hodiny == pytest.approx(160.0)
    assert r.zakladni_mzda == pytest.approx(40000.0)
    assert r.priplatek_prescas_vsedni == 0.0
    assert r.priplatek_prescas_vikend == 0.0
    assert r.priplatek_so_ne == 0.0
    assert r.priplatek_svatek == 0.0
    assert r.priplatek_noc == 0.0
    assert r.priplatek_pohotovost == 0.0
    assert r.nahrada_dovolena == 0.0
    assert r.nahrada_prekazky == 0.0
    assert r.nahrada_prac_volno == 0.0
    assert r.hruba_mzda == pytest.approx(40000.0)
    assert r.cista_mzda == pytest.approx(40000 - 2840 - 1800 - 3430)     # 31930
    assert r.stravenky == pytest.approx(20 * STRAVENKA_DEN)              # 2115
    assert r.na_ucet == pytest.approx(31930 - 2115)                      # 29815


def test_zaklad_dane_exact_multiple_of_100_not_rounded_up():
    # hruba přesně 40000 (160 h × 250) — ceil nesmí přeskočit na 40100
    hours = TimesheetHours(worked_days=20)
    r = calculate_salary(hours, fond_days=FOND_DAYS, salary=SALARY, prumer=PRUMER)
    assert r.hruba_mzda == pytest.approx(40000.0)
    assert r.zaklad_dane == 40000.0
    assert r.dan == pytest.approx(40000 * 0.15 - 2570)                   # 3430


def test_zaklad_dane_just_above_multiple_rounds_to_next_hundred():
    # bonus 1 Kč → hruba 40001 → základ daně 40100
    hours = TimesheetHours(worked_days=20)
    r = calculate_salary(hours, fond_days=FOND_DAYS, salary=SALARY, prumer=PRUMER, bonus=1.0)
    assert r.hruba_mzda == pytest.approx(40001.0)
    assert r.zaklad_dane == 40100.0
    assert r.dan == pytest.approx(40100 * 0.15 - 2570)                   # 3445


def test_weekend_overtime_stacks_both_priplatky_from_same_hours():
    # regresní pojistka: víkendový přesčas dostává přesčasový (0.50) I víkendový
    # (0.50) příplatek z týchž hodin — záměrné dublování, nesmí se "opravit"
    hours = TimesheetHours(pres_we=4.0, worked_days=20)
    r = calculate_salary(hours, fond_days=FOND_DAYS, salary=SALARY, prumer=PRUMER)

    assert r.priplatek_prescas_vikend > 0.0
    assert r.priplatek_so_ne > 0.0
    assert r.priplatek_prescas_vikend == pytest.approx(r.priplatek_so_ne)
    assert r.priplatek_prescas_vikend == pytest.approx(4 * 200 * 0.50)   # 400
    # oba příplatky musí být v hrubé mzdě: (160+4)×250 + 400 + 400
    assert r.zakladni_mzda == pytest.approx(164 * 250.0)                 # 41000
    assert r.hruba_mzda == pytest.approx(41000 + 400 + 400)              # 41800


def test_fond_days_zero_no_zero_division():
    r = calculate_salary(TimesheetHours(), fond_days=0, salary=SALARY, prumer=PRUMER)
    assert r.fond_hodin == 0.0
    assert r.hodinova_sazba == 0.0
    assert r.zakladni_mzda == 0.0
    assert r.hruba_mzda == pytest.approx(0.0)
