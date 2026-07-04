"""Tests for the yearly Spending Wrapped aggregation (routers.dashboard.build_wrapped).

Pure-function tests over fake transaction objects — no DB. Verifies the shared
conventions: is_excluded skipped, my_share_amount respected, settlements not
income, income categories out of the expense leaderboard.
"""
import json
from types import SimpleNamespace

from routers.dashboard import build_wrapped


def tx(date, amount, description="Tx", category="Food", *, excluded=False,
       settlement=False, my_share=None, creditor=None):
    raw = json.dumps({"creditorName": creditor}) if creditor else None
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
