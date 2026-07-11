"""Deterministický výpočet výplaty z rozpadu hodin — čisté funkce, žádné DB.

Vzorec reverzně odvozený a ověřený proti 18 měsícům reálných výplatních pásek.
Jediná odchylka od validovaného prototypu: základ daně se před 15% sazbou
zaokrouhluje nahoru na celé stovky (tak to dělá reálná mzdová účtárna).
"""
import math
from dataclasses import dataclass

from services.timesheet_parser import TimesheetHours

SZ_ZAMESTNANEC = 0.071
ZP_ZAMESTNANEC = 0.045
DAN_SAZBA = 0.15
SLEVA_POPLATNIK = 2570.0
STRAVENKA_DEN = 235 * 0.45  # 105.75 Kč/den, platí od 2026


def _kc(x: float) -> float:
    """Zaokrouhlení na celé Kč (half-up) — účtárna zaokrouhluje každou
    příjmovou položku pásky zvlášť (ověřeno proti pásce 2026-06)."""
    return math.floor(x + 0.5)

PRIPLATEK_PRESCAS_VSEDNI = 0.25
PRIPLATEK_PRESCAS_VIKEND = 0.50
PRIPLATEK_SO_NE = 0.50
PRIPLATEK_SVATEK = 1.00
PRIPLATEK_NOC = 0.10
SAZBA_POHOTOVOST = 0.10
NAHRADA_DOVOLENA = 1.00


@dataclass
class SalaryBreakdown:
    fond_hodin: float
    hodinova_sazba: float
    zakladni_hodiny: float
    zakladni_mzda: float
    priplatek_prescas_vsedni: float
    priplatek_prescas_vikend: float
    priplatek_so_ne: float
    priplatek_svatek: float
    priplatek_noc: float
    pohotovost_placena_h: float
    priplatek_pohotovost: float
    nahrada_dovolena: float
    nahrada_prekazky: float
    nahrada_prac_volno: float
    bonus: float
    hruba_mzda: float
    zaklad_dane: float
    socialni: float
    zdravotni: float
    dan: float
    cista_mzda: float
    stravenky: float
    na_ucet: float


def calculate_salary(
    hours: TimesheetHours,
    fond_days: int,
    salary: float,
    prumer: float,
    bonus: float = 0.0,
) -> SalaryBreakdown:
    """Spočítá rozpad výplaty.

    salary = základní měsíční mzda, prumer = kvartální průměr náhrady (Kč/h),
    fond_days = počet pracovních dnů měsíce (compute_fond_days, ne z parseru).
    """
    fond_hodin = fond_days * 8.0
    hodinova_sazba = salary / fond_hodin if fond_hodin > 0 else 0.0

    zakladni_hodiny = (
        fond_hodin
        - hours.dov_h
        - hours.prek_h
        - hours.volno_h
        + hours.pres_wd
        + hours.pres_we
    )
    zakladni_mzda = _kc(zakladni_hodiny * hodinova_sazba)

    p_pres_wd = _kc(hours.pres_wd * prumer * PRIPLATEK_PRESCAS_VSEDNI)
    p_pres_we = _kc(hours.pres_we * prumer * PRIPLATEK_PRESCAS_VIKEND)
    # Víkendový přesčas dostává přesčasový i víkendový příplatek z týchž hodin
    # (§114 + §118 ZP — nároky se sčítají). Záměrné, ověřené proti páskám.
    p_so_ne = _kc(hours.pres_we * prumer * PRIPLATEK_SO_NE)
    p_svatek = _kc(hours.svatek_h * prumer * PRIPLATEK_SVATEK)
    p_noc = _kc(hours.noc_h * prumer * PRIPLATEK_NOC)

    pohotovost_placena_h = max(0.0, hours.pohot_h - hours.pohot_overlap_h)
    p_pohot = _kc(pohotovost_placena_h * prumer * SAZBA_POHOTOVOST)

    n_dovolena = _kc(hours.dov_h * prumer * NAHRADA_DOVOLENA)
    n_prekazky = _kc(hours.prek_h * prumer)
    n_prac_volno = _kc(hours.volno_h * hodinova_sazba)

    hruba_mzda = (
        zakladni_mzda + p_pres_wd + p_pres_we + p_so_ne + p_svatek + p_noc
        + p_pohot + n_dovolena + n_prekazky + n_prac_volno + bonus
    )

    # SZ/ZP a stravenky účtárna zaokrouhluje nahoru na celé Kč (páska 2026-06:
    # 5 292,4 → 5 293; 3 354,3 → 3 355; 2 220,75 → 2 221)
    socialni = math.ceil(hruba_mzda * SZ_ZAMESTNANEC)
    zdravotni = math.ceil(hruba_mzda * ZP_ZAMESTNANEC)

    zaklad_dane = math.ceil(hruba_mzda / 100.0) * 100.0
    dan = zaklad_dane * DAN_SAZBA - SLEVA_POPLATNIK

    cista_mzda = hruba_mzda - socialni - zdravotni - dan
    stravenky = math.ceil(hours.worked_days * STRAVENKA_DEN)
    na_ucet = cista_mzda - stravenky

    return SalaryBreakdown(
        fond_hodin=fond_hodin,
        hodinova_sazba=hodinova_sazba,
        zakladni_hodiny=zakladni_hodiny,
        zakladni_mzda=zakladni_mzda,
        priplatek_prescas_vsedni=p_pres_wd,
        priplatek_prescas_vikend=p_pres_we,
        priplatek_so_ne=p_so_ne,
        priplatek_svatek=p_svatek,
        priplatek_noc=p_noc,
        pohotovost_placena_h=pohotovost_placena_h,
        priplatek_pohotovost=p_pohot,
        nahrada_dovolena=n_dovolena,
        nahrada_prekazky=n_prekazky,
        nahrada_prac_volno=n_prac_volno,
        bonus=bonus,
        hruba_mzda=hruba_mzda,
        zaklad_dane=zaklad_dane,
        socialni=socialni,
        zdravotni=zdravotni,
        dan=dan,
        cista_mzda=cista_mzda,
        stravenky=stravenky,
        na_ucet=na_ucet,
    )
