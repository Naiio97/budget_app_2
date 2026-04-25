'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import TransactionList from '@/components/TransactionList';
import NetWorthChart from '@/components/NetWorthChart';
import { getDashboard, getBudgetOverview } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: getDashboard,
  });

  const { data: budgetOverview } = useQuery({
    queryKey: queryKeys.budgetOverview,
    queryFn: () => getBudgetOverview().catch(() => null),
  });

  if (isLoading || !data) {
    return (
      <MainLayout>
        <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </MainLayout>
    );
  }

  const savingsRate = data.monthly.income > 0
    ? Math.round((data.monthly.savings / data.monthly.income) * 100)
    : 0;

  return (
    <MainLayout>
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

        {/* Page header */}
        <div className="page-head">
          <div>
            <h1>Přehled</h1>
            <div className="sub">Aktuální stav financí</div>
          </div>
        </div>

        {/* KPI row — 3 cards */}
        <div className="grid-3">
          <div className="surface kpi">
            <div className="kpi-label">Příjmy tento měsíc</div>
            <div className="kpi-value num" style={{ color: 'var(--pos)' }}>
              {formatCurrency(data.monthly.income)}
            </div>
            <div className="kpi-sub">
              <span>celkem přijato</span>
            </div>
          </div>
          <div className="surface kpi">
            <div className="kpi-label">Výdaje tento měsíc</div>
            <div className="kpi-value num">
              {formatCurrency(data.monthly.expenses)}
            </div>
            <div className="kpi-sub">
              <span>celkem utraceno</span>
            </div>
          </div>
          <div className="surface kpi">
            <div className="kpi-label">Úspora</div>
            <div className="kpi-value num" style={{ color: data.monthly.savings >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
              {formatCurrency(data.monthly.savings)}
            </div>
            <div className="kpi-sub">
              {savingsRate > 0 && (
                <span className="chip chip-accent">{savingsRate} % z příjmu</span>
              )}
            </div>
          </div>
        </div>

        {/* Net worth chart */}
        <div className="surface">
          <div className="card-head">
            <h3>Vývoj majetku</h3>
          </div>
          <div className="card-body">
            <NetWorthChart currency={data.summary.currency} />
          </div>
        </div>

        {/* Bottom row: recent transactions + budget */}
        <div className="grid-2">
          {/* Recent transactions */}
          <div className="surface">
            <div className="card-head">
              <h3>Poslední transakce</h3>
              <Link href="/transactions" className="btn btn-ghost btn-sm">
                Zobrazit vše →
              </Link>
            </div>
            <div className="card-body-nopad">
              <TransactionList transactions={data.recent_transactions} showAccount />
            </div>
          </div>

          {/* Budget widget */}
          {budgetOverview && budgetOverview.categories_count > 0 ? (
            <div className="surface">
              <div className="card-head">
                <h3>Stav rozpočtu</h3>
                <Link href="/budgets" className="btn btn-ghost btn-sm">Detail →</Link>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Total progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Celkem</span>
                    <span className="num" style={{ fontSize: 13 }}>
                      {formatCurrency(budgetOverview.total_spent)} / {formatCurrency(budgetOverview.total_budget)}
                    </span>
                  </div>
                  <div className="progress">
                    <span style={{
                      width: `${Math.min(budgetOverview.total_percentage, 100)}%`,
                      background: budgetOverview.total_percentage >= 100 ? 'var(--neg)' : budgetOverview.total_percentage >= 80 ? 'var(--warn)' : 'var(--accent)',
                    }} />
                  </div>
                </div>
                {/* Top categories */}
                {budgetOverview.categories.slice(0, 4).map((cat, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{cat.category}</span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {Math.round(cat.percentage)} %
                      </span>
                    </div>
                    <div className="progress">
                      <span style={{
                        width: `${Math.min(cat.percentage, 100)}%`,
                        background: cat.percentage >= 100 ? 'var(--neg)' : cat.percentage >= 80 ? 'var(--warn)' : 'var(--accent)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="surface">
              <div className="card-head">
                <h3>Zůstatky účtů</h3>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Bankovní účty</span>
                  <span className="num" style={{ fontWeight: 600 }}>{formatCurrency(data.summary.bank_balance, data.summary.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid var(--border)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Investice</span>
                  <span className="num" style={{ fontWeight: 600 }}>{formatCurrency(data.summary.investment_balance, data.summary.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Celkem</span>
                  <span className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                    {formatCurrency(data.summary.total_balance, data.summary.currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </MainLayout>
  );
}
