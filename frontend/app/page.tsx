'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import PageLoader from '@/components/PageLoader';
import TransactionList from '@/components/TransactionList';
import NetWorthChart from '@/components/NetWorthChart';
import CategoryChart from '@/components/CategoryChart';
import AccountsCard from '@/components/AccountsCard';
import ArrowIcon from '@/components/ArrowIcon';
import { apiFetch, getDashboard } from '@/lib/api';
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

  // Aktuální výplatní období z backendu (stejné jako v rozpočtu) — počet dní do výplaty.
  const { data: period } = useQuery<{ year_month: string; start: string; end: string }>({
    queryKey: ['salaryPeriodCurrent'],
    queryFn: () => apiFetch('/salary-period/current').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
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

  const { income, expenses, savings } = data.monthly;
  const currency = data.summary.currency;
  const coverage = expenses > 0 ? Math.round((income / expenses) * 100) : null;
  const gap = expenses - income;
  const totalWorth = data.summary.total_balance;
  const investShare = totalWorth > 0 ? (data.summary.investment_balance / totalWorth) * 100 : 0;
  const paydayText = period?.end
    ? getPaydayText(now, new Date(period.end + 'T00:00:00'))
    : getPaydayText(now, getNextPayday(now));

  return (
    <MainLayout>
      <div className="page-container dash">

        {/* Page header */}
        <div className="page-head">
          <div>
            <div className="dash-eyebrow">{formatDayLabel(now)}</div>
            <h1>Vaše finance, přehledně.</h1>
            <div className="sub">{getGreeting(now.getHours())}, Nicolasi. Vše důležité máte na dosah.</div>
          </div>
        </div>

        {/* KPI row */}
        <div className="dash-kpis">
          <Link href="/transactions" className="dash-card dash-kpi">
            <div className="dash-kpi-top"><span>Příjmy</span><ArrowIcon /></div>
            <div className="dash-kpi-value num">{formatCurrency(income, currency)}</div>
            <div className="dash-kpi-sub">
              {coverage != null ? `Příjmy pokryly ${coverage} % výdajů.` : 'Zatím žádné výdaje.'}
            </div>
          </Link>
          <Link href="/transactions" className="dash-card dash-kpi">
            <div className="dash-kpi-top"><span>Výdaje</span><ArrowIcon /></div>
            <div className="dash-kpi-value num">{formatCurrency(expenses, currency)}</div>
            <div className="dash-kpi-sub">
              {gap > 0
                ? `O ${formatCurrency(gap, currency)} více než příjmy`
                : `O ${formatCurrency(-gap, currency)} méně než příjmy`}
            </div>
          </Link>
          <Link href="/investments" className="dash-card dash-kpi">
            <div className="dash-kpi-top"><span>Investice</span><ArrowIcon /></div>
            <div className="dash-kpi-value num">{formatCurrency(data.summary.investment_balance, currency)}</div>
            <div className="dash-kpi-sub">{investShare.toFixed(1).replace('.', ',')} % vašeho čistého jmění.</div>
          </Link>
          <Link href="/rozpocet" className="dash-card dash-kpi">
            <div className="dash-kpi-top">
              <span className="dash-kpi-label-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
                </svg>
                Měsíční bilance
              </span>
              <ArrowIcon />
            </div>
            <div className={`dash-kpi-value num ${savings >= 0 ? 'pos' : 'neg'}`}>
              {savings < 0 ? '−' : ''}{formatCurrency(Math.abs(savings), currency)}
            </div>
            <div className="dash-kpi-sub">{paydayText}</div>
          </Link>
        </div>

        <div className="dash-grid">
          <NetWorthChart currency={currency} />
          <AccountsCard accounts={data.accounts} />

          <div className="dash-card dash-tx">
            <div className="dash-card-head">
              <h3>Poslední transakce</h3>
              <Link href="/transactions" className="dash-link">
                Zobrazit vše <ArrowIcon size={12} />
              </Link>
            </div>
            <TransactionList transactions={data.recent_transactions} showAccount />
          </div>

          <CategoryChart categories={data.categories} currency={currency} />
        </div>

      </div>
    </MainLayout>
  );
}
