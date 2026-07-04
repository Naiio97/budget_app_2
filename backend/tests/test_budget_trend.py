"""Tests for the budget pace/burn-down math (routers.budgets.build_trend).

Pure-function tests — no DB. The daily dict comes from
get_daily_spending_by_category which is a straight GROUP BY; the interesting
logic (cumulative series, projection, forward-booked handling) lives here.
"""
from routers.budgets import build_trend


def test_linear_pace_projects_to_month_end():
    # 100 Kč/den po 10 dní v 30denním měsíci → odhad 3 000
    daily = {day: 100.0 for day in range(1, 11)}
    spent, projected, cumulative = build_trend(daily, amount=5000, days_elapsed=10, days_in_month=30)
    assert spent == 1000.0
    assert projected == 3000.0
    assert [p.day for p in cumulative] == list(range(1, 11))
    assert cumulative[-1].spent == 1000.0


def test_cumulative_fills_days_without_spending():
    daily = {1: 200.0, 5: 300.0}
    spent, projected, cumulative = build_trend(daily, amount=1000, days_elapsed=6, days_in_month=30)
    assert [p.spent for p in cumulative] == [200.0, 200.0, 200.0, 200.0, 500.0, 500.0]
    assert spent == 500.0


def test_forward_booked_counts_in_spent_not_in_projection():
    # platba zaúčtovaná dopředu (den 25, dnes je 10.) je ve spent,
    # ale nesmí nafouknout tempo
    daily = {1: 100.0, 25: 500.0}
    spent, projected, cumulative = build_trend(daily, amount=1000, days_elapsed=10, days_in_month=30)
    assert spent == 600.0
    assert projected == 300.0  # 100 / 10 dní * 30
    assert cumulative[-1].spent == 100.0


def test_empty_month():
    spent, projected, cumulative = build_trend({}, amount=1000, days_elapsed=5, days_in_month=31)
    assert spent == 0.0
    assert projected == 0.0
    assert len(cumulative) == 5


def test_zero_days_elapsed_does_not_divide():
    spent, projected, cumulative = build_trend({}, amount=1000, days_elapsed=0, days_in_month=30)
    assert projected == 0.0
    assert cumulative == []
