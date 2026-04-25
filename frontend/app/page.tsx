'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import TransactionList from '@/components/TransactionList';
import NetWorthChart from '@/components/NetWorthChart';
import CategoryChart from '@/components/CategoryChart';
import { getDashboard } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: getDashboard,
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

        {/* Bottom row: recent transactions + category breakdown */}
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

          {/* Category breakdown */}
          <div className="surface">
            <div className="card-head">
              <h3>Výdaje podle kategorií</h3>
              <span className="muted" style={{ fontSize: 12 }}>Tento měsíc</span>
            </div>
            <div className="card-body">
              <CategoryChart categories={data.categories} currency={data.summary.currency} />
            </div>
          </div>
        </div>

      </div>
    </MainLayout>
  );
}
