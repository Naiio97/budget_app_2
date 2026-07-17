"""Tests for services.payslip_parser — čisté funkce, žádné DB ani PDF I/O.

Testuje se parse_payslip_text na syntetickém textu napodobujícím rozházenou
textovou vrstvu pásky (Elanor). Všechna čísla jsou vymyšlená.
"""
from services.payslip_parser import parse_payslip_text


def build_payslip_text(
    year_month="2026-03",
    base="45 000",
    prumer="250.00",
    na_ucet="31234",
):
    # Věrná napodobenina extrakce: hodnoty hlavičky na samostatných řádcích
    # před labely, příjmové řádky se slepenými sloupci, srážky čisté
    return f"""Novák Jan
{year_month}
Vzorová firma a.s.
Vzorová pojišťovna
44_9999
{base}
40.000
{prumer}
22.00 /
1.1.2020
200.00
106.00
88.00 /  0.00
Pracovní poměr
Úvazek:
Nástup:
Pracovní fond (dny/hodiny) 176.00
Prům.náhrady:
Zákl.měsíční mzda:
Základní mzda měsíční 44000176.00 22.00
Přípl. přesčas 2504.00
Odvod SZ-zaměstnanec 3196
Odvod ZP-zaměstnanec 2025
Zálohová daň 6750
Sleva na poplatníka -2570
Stravenky I. 2115
Hrubá mzda
45000
Mzda na účet {na_ucet}
Celkem příjmy 45000"""


def test_full_extraction():
    d = parse_payslip_text(build_payslip_text())
    assert d.year_month == "2026-03"
    assert d.base_monthly == 45000.0
    assert d.prumer == 250.0
    assert d.na_ucet == 31234.0
    assert d.srazky == {
        "sz": 3196.0,
        "zp": 2025.0,
        "dan_zaloha": 6750.0,
        "sleva": -2570.0,
        "stravenky": 2115.0,
    }


def test_uvazek_and_fond_not_mistaken_for_prumer():
    # "40.000" (3 desetinná místa) ani "22.00 /" (lomítko) nesmí vyhrát
    # nad skutečným průměrem — první čistý tvar \d+.\d{2} je průměr
    d = parse_payslip_text(build_payslip_text(prumer="412.34"))
    assert d.prumer == 412.34


def test_base_monthly_needs_thousands_space():
    # základní mzda je jediné číslo s mezerou tisíců v hlavičce
    d = parse_payslip_text(build_payslip_text(base="52 500"))
    assert d.base_monthly == 52500.0


def test_missing_na_ucet_returns_none():
    text = build_payslip_text().replace("Mzda na účet 31234", "")
    d = parse_payslip_text(text)
    assert d.na_ucet is None


def test_garbage_text_yields_empty_data():
    d = parse_payslip_text("tohle není páska, jen náhodný text 123")
    assert d.na_ucet is None
    assert d.base_monthly is None
    assert d.prumer is None
    assert d.srazky == {}


def test_header_values_after_pracovni_pomer_are_ignored():
    # hodnoty ve tvaru průměru objevující se až za hlavičkou (např. hodiny
    # v příjmových řádcích) se nesmí chytit
    text = "2026-05\nPracovní poměr\n123.45\nMzda na účet 30000"
    d = parse_payslip_text(text)
    assert d.prumer is None
    assert d.na_ucet == 30000.0
