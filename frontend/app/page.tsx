'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import PageLoader from '@/components/PageLoader';
import TransactionList from '@/components/TransactionList';
import NetWorthChart from '@/components/NetWorthChart';
import CategoryChart from '@/components/CategoryChart';
import { getDashboard } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';

// ── Payday logic ────────────────────────────────────────────────
const FIXED_HOLIDAYS: string[] = [
  '01-01', '05-01', '05-08', '07-05', '07-06',
  '09-28', '10-28', '11-17', '12-24', '12-25', '12-26',
];

function easterMonday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const d2 = new Date(year, month, day + 1); // +1 = Monday after Easter Sunday
  return d2;
}

function isHoliday(d: Date): boolean {
  const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (FIXED_HOLIDAYS.includes(key)) return true;
  const em = easterMonday(d.getFullYear());
  return d.getFullYear() === em.getFullYear() && d.getMonth() === em.getMonth() && d.getDate() === em.getDate();
}

function isWorkingDay(d: Date): boolean {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6 && !isHoliday(d);
}

function lastWorkingDayOnOrBefore(d: Date): Date {
  const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (!isWorkingDay(cur)) cur.setDate(cur.getDate() - 1);
  return cur;
}

function getNextPayday(today: Date): Date {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let candidate = lastWorkingDayOnOrBefore(new Date(today.getFullYear(), today.getMonth(), 8));
  if (todayStart > candidate) {
    candidate = lastWorkingDayOnOrBefore(new Date(today.getFullYear(), today.getMonth() + 1, 8));
  }
  return candidate;
}

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 10) return 'Dobré ráno';
  if (hour >= 10 && hour < 12) return 'Dobré dopoledne';
  if (hour >= 12 && hour < 18) return 'Dobré odpoledne';
  if (hour >= 18 && hour < 22) return 'Dobrý večer';
  return 'Dobrou noc';
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getPaydayText(today: Date, payday: Date): string {
  const diff = Math.round((payday.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return 'Dnes je výplatní den!';
  if (diff === 1) return 'Zítra je výplatní den';
  return `Do výplaty zbývá ${diff} ${diff >= 5 ? 'dní' : diff >= 2 ? 'dny' : 'den'}`;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard,
    // Wrap so React Query's context object isn't passed as `includeHidden`.
    queryFn: () => getDashboard(),
  });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (isLoading || !data) {
    return (
      <MainLayout>
        <PageLoader />
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
            <h1>{now ? `${getGreeting(now.getHours())}, Nicolas.` : 'Načítám…'}</h1>
            <div className="sub">
              {now && (
                <>
                  {formatDayLabel(now)}
                  {' · '}
                  {getPaydayText(now, getNextPayday(now))}
                </>
              )}
            </div>
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
