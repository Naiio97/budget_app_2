"""Tests for the yearly Spending Wrapped aggregation (routers.dashboard.build_wrapped).

Pure-function tests over fake transaction objects — no DB. Verifies the shared
conventions: is_excluded skipped, my_share_amount respected, settlements not
income, income categories out of the expense leaderboard.
"""
import json
from types import SimpleNamespace

from routers.dashboard import build_wrapped


def tx(date, amount, description="Tx", category="Food", *, excluded=False,
       settlement=False, my_share=None, creditor=None, debtor=None,
       creditor_iban=None, debtor_iban=None):
    payload = {}
    if creditor:
        payload["creditorName"] = creditor
    if debtor:
        payload["debtorName"] = debtor
    if creditor_iban:
        payload["creditorAccount"] = {"iban": creditor_iban}
    if debtor_iban:
        payload["debtorAccount"] = {"iban": debtor_iban}
    raw = json.dumps(payload) if payload else None
    return SimpleNamespace(
        date=date, amount=amount, description=description, category=category,
        is_excluded=excluded, settlement_flag=settlement,
        my_share_amount=my_share, raw_json=raw,
    )


def test_totals_and_monthly():
    result = build_wrapped([
        tx("2025-01-10", -100),
        tx("2025-01-15", -200),
        tx("2025-03-01", -50),
        tx("2025-02-01", 40000, category="Salary"),
    ], income_category_names={"Salary"}, year=2025)

    assert result["totals"]["expenses"] == 350.0
    assert result["totals"]["income"] == 40000.0
    assert result["totals"]["saved"] == 39650.0
    assert result["totals"]["expense_count"] == 3
    assert len(result["monthly"]) == 12
    jan = next(m for m in result["monthly"] if m["month"] == "2025-01")
    assert jan["expenses"] == 300.0
    assert result["top_month"]["month"] == "2025-01"


def test_excluded_and_settlements_skipped():
    result = build_wrapped([
        tx("2025-01-10", -999, excluded=True),          # interní převod
        tx("2025-01-11", 5000, settlement=True),        # vratka od ženy ≠ příjem
        tx("2025-01-12", -100),
    ], income_category_names=set(), year=2025)

    assert result["totals"]["expenses"] == 100.0
    assert result["totals"]["income"] == 0.0


def test_my_share_counts_not_full_amount():
    result = build_wrapped([
        tx("2025-05-01", -30000, description="Nájem", category="Utilities", my_share=15000),
    ], income_category_names=set(), year=2025)

    assert result["totals"]["expenses"] == 15000.0
    assert result["biggest_expense"]["amount"] == 15000.0


def test_top_merchants_group_by_creditor_name():
    result = build_wrapped([
        tx("2025-01-01", -100, description="Platba kartou 1", creditor="Lidl"),
        tx("2025-02-01", -200, description="Platba kartou 2", creditor="Lidl"),
        tx("2025-03-01", -50, description="Bez protistrany"),
    ], income_category_names=set(), year=2025)

    top = result["top_merchants"][0]
    assert top["name"] == "Lidl"
    assert top["total"] == 300.0
    assert top["count"] == 2
    assert result["top_merchants"][1]["name"] == "Bez protistrany"


def test_income_categories_not_in_expense_leaderboard():
    # záporná transakce v příjmové kategorii (vratka výplaty) nesmí do žebříčku
    result = build_wrapped([
        tx("2025-01-01", -500, category="Salary"),
        tx("2025-01-02", -100, category="Food"),
    ], income_category_names={"Salary"}, year=2025)

    assert [c["category"] for c in result["top_categories"]] == ["Food"]
    # ale do celkových výdajů se počítá pořád
    assert result["totals"]["expenses"] == 600.0


def test_other_year_ignored():
    result = build_wrapped([
        tx("2024-12-31", -100),
        tx("2025-01-01", -40),
    ], income_category_names=set(), year=2025)

    assert result["totals"]["expenses"] == 40.0


def test_empty_year():
    result = build_wrapped([], income_category_names=set(), year=2025)
    assert result["totals"]["expenses"] == 0.0
    assert result["top_month"] is None
    assert result["biggest_expense"] is None
    assert result["top_merchants"] == []


def test_self_transfers_excluded_by_owner_name():
    # majitel účtu "Nicolas Bureš"; převody na sebe (i s prohozeným pořadím)
    # vypadnou z útrat, obchodníků i příjmů, reálný nákup zůstane
    own = frozenset({frozenset({"nicolas", "bures"})})
    result = build_wrapped([
        tx("2025-01-05", -50000, description="Převod", creditor="Bureš Nicolas"),
        tx("2025-02-05", -30000, description="Převod", creditor="Nicolas Bureš"),
        tx("2025-03-05", 20000, description="Převod zpět", debtor="Nicolas Bureš"),
        tx("2025-01-10", -800, description="Nákup", creditor="Lidl"),
    ], income_category_names=set(), year=2025, own_name_tokens=own)

    assert result["totals"]["expenses"] == 800.0
    assert result["totals"]["income"] == 0.0
    assert [m["name"] for m in result["top_merchants"]] == ["Lidl"]


def test_credit_card_repayment_counts_as_expense():
    # převod na kreditku (v transfer_excluded_accounts) je reálný výdaj, i když
    # se jméno protistrany shoduje s majitelem; jiný převod na sebe vypadne
    own = frozenset({frozenset({"nicolas", "bures"})})
    keep = frozenset({"CZ7501000001237970420227"})
    result = build_wrapped([
        tx("2025-01-05", -20000, description="Splátka", creditor="Nicolas Bureš",
           creditor_iban="CZ7501000001237970420227"),   # kreditka → výdaj
        tx("2025-02-05", -30000, description="Převod", creditor="Nicolas Bureš",
           creditor_iban="CZ3008000000001028717374"),    # spořicí → vyřadit
    ], income_category_names=set(), year=2025,
       own_name_tokens=own, keep_account_ids=keep)

    assert result["totals"]["expenses"] == 20000.0
    assert [m["name"] for m in result["top_merchants"]] == ["Nicolas Bureš"]


def test_self_transfer_needs_all_name_tokens():
    # zpráva "Bureš skříň" nesmí splynout se jménem majitele (chybí "nicolas")
    own = frozenset({frozenset({"nicolas", "bures"})})
    result = build_wrapped([
        tx("2025-01-10", -5000, description="Nábytek", creditor="Bureš skříň"),
    ], income_category_names=set(), year=2025, own_name_tokens=own)

    assert result["totals"]["expenses"] == 5000.0
    assert result["top_merchants"][0]["name"] == "Bureš skříň"
