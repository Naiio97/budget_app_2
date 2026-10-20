'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import PageLoader from '@/components/PageLoader';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { queryKeys } from '@/lib/queryKeys';
import { getLineIcon } from '@/lib/line-icons';
import AccountsCard from '@/components/AccountsCard';
import { apiFetch, getDashboard } from '@/lib/api';

interface MonthlyTotal {
    month: string;
    income: number;
    expenses: number;
    balance: number;
}

interface CategoryBreakdown {
    month: string;
    category: string;
    amount: number;
}

interface MonthlyReport {
    monthly_totals: MonthlyTotal[];
    category_breakdown: CategoryBreakdown[];
    categories: string[];
    currency: string;
}

const MUTED_PALETTE = ['#6a9fd0', '#b8a56a', '#9d92c9', '#7fbf9e', '#d09a8a', '#7fb8c4', '#c58fb0', '#a3acba', '#8fb36a', '#d4b36a', '#6f86c9', '#b98a6a'];
const formatMoney = (amount: number) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('cs-CZ', { month: 'short', year: '2-digit' });
};

export default function ReportsPage() {
    const [months, setMonths] = useState(6);
    // false = jen moje podíly (rozdělené výdaje + bez vypořádání), true = plné částky z výpisu
    const [fullAmounts, setFullAmounts] = useState(false);

    const { data: report, isLoading: loading, error } = useQuery<MonthlyReport>({
        queryKey: [...queryKeys.monthlyReport(months), fullAmounts],
        queryFn: () => apiFetch(`/dashboard/monthly-report?months=${months}&full_amounts=${fullAmounts}`).then(r => r.json()),
    });

    const { data: dashData } = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => getDashboard() });
    const accounts = dashData?.accounts ?? [];

    // Top 5 kategorií za období — jen kvůli stabilním barvám v přehledu.
    const trendCategories = useMemo(() => {
        if (!report) return [] as string[];
        const totals = new Map<string, number>();
        for (const item of report.category_breakdown) {
            totals.set(item.category, (totals.get(item.category) || 0) + item.amount);
        }
        return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
    }, [report]);

    // Savings rate trend (per month)
    const savingsTrend = useMemo(() => {
        if (!report) return [];
        return report.monthly_totals.map(m => ({
            month: formatMonth(m.month),
            rate: m.income > 0 ? Math.round(((m.income - m.expenses) / m.income) * 100) : 0,
            balance: m.balance,
        }));
    }, [report]);

    // Top categories aggregated across the period
    const topCategoriesAgg = useMemo(() => {
        if (!report) return [];
        const map = new Map<string, number>();
        for (const item of report.category_breakdown) {
            map.set(item.category, (map.get(item.category) || 0) + item.amount);
        }
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [report]);

    // Tlumená paleta nového stylu pro kategorie, které se v grafech skutečně zobrazují,
    // přidělená podle abecedy — stejná kategorie má v obou grafech stejnou barvu a barvy
    // se neopakují (nepoužívají se křiklavé barvy z databáze).
    const categoryColors: Record<string, string> = useMemo(() => {
        const shown = Array.from(new Set([...topCategoriesAgg.map(([name]) => name), ...trendCategories])).sort();
        return shown.reduce((acc, name, i) => {
            acc[name] = MUTED_PALETTE[i % MUTED_PALETTE.length];
            return acc;
        }, {} as Record<string, string>);
    }, [topCategoriesAgg, trendCategories]);

    if (loading) {
        return (
            <MainLayout>
                <PageLoader />
            </MainLayout>
        );
    }

    if (error || !report) {
        return (
            <MainLayout>
                <div className="page-container">
                    <div className="surface" style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--neg)' }}>
                        Nepodařilo se načíst přehledy.
                    </div>
                </div>
            </MainLayout>
        );
    }

    const totals = report.monthly_totals;
    const totalIncome = totals.reduce((s, m) => s + m.income, 0);
    const totalExpenses = totals.reduce((s, m) => s + m.expenses, 0);
    const totalSavings = totalIncome - totalExpenses;
    const avgIncome = totals.length ? totalIncome / totals.length : 0;
    const avgExpenses = totals.length ? totalExpenses / totals.length : 0;
    const overallSavingsRate = totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 100) : 0;

    // MoM change (current vs previous month) — uses last 2 months in window
    const last = totals[totals.length - 1];
    const prev = totals[totals.length - 2];
    const momExpensesChange = last && prev && prev.expenses > 0
        ? Math.round(((last.expenses - prev.expenses) / prev.expenses) * 100)
        : null;

    return (
        <MainLayout>
            <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                {/* Page header */}
                <div className="page-head">
                    <div>
                        <h1>Přehledy</h1>
                        <div className="sub">Trendy a srovnání měsíců</div>
                    </div>
                    <div className="page-head-controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div className="seg" title="Moje podíly: rozdělené výdaje jen mojí částí, vypořádání mimo příjmy. Plné částky: co reálně odešlo/přišlo na účtu.">
                            {([[false, 'Moje podíly'], [true, 'Plné částky']] as [boolean, string][]).map(([val, label]) => (
                                <div
                                    key={label}
                                    className={`seg-item ${fullAmounts === val ? 'active' : ''}`}
                                    onClick={() => setFullAmounts(val)}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                        <div className="seg">
                            {[3, 6, 12].map(m => (
                                <div
                                    key={m}
                                    className={`seg-item ${months === m ? 'active' : ''}`}
                                    onClick={() => setMonths(m)}
                                >
                                    {m}M
                                </div>
                            ))}
                        </div>
                        <Link href="/wrapped" className="seg-link">
                            {getLineIcon('star', 14)} Roční přehled
                        </Link>
                    </div>
                </div>

                {/* KPI karty */}
                <div className="rep-kpis">
                    <div className="surface rep-kpi">
                        <div className="rep-kpi-label">Příjmy</div>
                        <div className="rep-kpi-value num pos">+{formatMoney(totalIncome)}</div>
                        <div className="rep-kpi-sub">průměr {formatMoney(avgIncome)}/měsíc</div>
                    </div>
                    <div className="surface rep-kpi">
                        <div className="rep-kpi-label">Výdaje</div>
                        <div className="rep-kpi-value num neg">−{formatMoney(totalExpenses)}</div>
                        <div className="rep-kpi-sub">průměr {formatMoney(avgExpenses)}/měsíc</div>
                    </div>
                    <div className="surface rep-kpi">
                        <div className="rep-kpi-label">Úspora celkem</div>
                        <div className={`rep-kpi-value num ${totalSavings >= 0 ? 'pos' : 'neg'}`}>
                            {totalSavings >= 0 ? '+' : ''}{formatMoney(totalSavings)}
                        </div>
                        <div className="rep-kpi-sub">{overallSavingsRate} % z příjmu</div>
                    </div>
                    <div className="surface rep-kpi">
                        <div className="rep-kpi-label">Výdaje vs. min. měsíc</div>
                        <div className={`rep-kpi-value num ${momExpensesChange == null ? '' : momExpensesChange > 0 ? 'neg' : 'pos'}`}>
                            {momExpensesChange == null ? '—' : `${momExpensesChange > 0 ? '+' : ''}${momExpensesChange} %`}
                        </div>
                        <div className="rep-kpi-sub">
                            {last && prev ? `${formatMonth(last.month)} vs ${formatMonth(prev.month)}` : 'málo dat'}
                        </div>
                    </div>
                </div>

                <div className="rep-layout">
                    <div className="rep-main">
                        {/* Příjmy vs. výdaje */}
                        <section className="surface">
                            <div className="card-head">
                                <h3>Příjmy vs. výdaje</h3>
                                <span className="muted" style={{ fontSize: 12 }}>{months} měsíců zpět</span>
                            </div>
                            <div className="card-body">
                                <div style={{ height: 280 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={totals.map(m => ({ ...m, month: formatMonth(m.month) }))} barGap={6}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                            <XAxis dataKey="month" stroke="var(--text-3)" fontSize={11} axisLine={false} tickLine={false} />
                                            <YAxis stroke="var(--text-3)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={42} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                cursor={{ fill: 'var(--surface-sunken)' }}
                                                contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
                                                formatter={(value, name) => [formatMoney(Number(value)), name === 'income' ? 'Příjmy' : 'Výdaje']}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '0.8rem' }} iconType="circle" formatter={(value) => value === 'income' ? 'Příjmy' : 'Výdaje'} />
                                            <Bar dataKey="income" fill="#7fbf9e" radius={[8, 8, 0, 0]} maxBarSize={44} />
                                            <Bar dataKey="expenses" fill="#6a9fd0" radius={[8, 8, 0, 0]} maxBarSize={44} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </section>

                        {/* Úspora po měsících + top kategorie */}
                        <div className="rep-pair">
                            <section className="surface">
                                <div className="card-head">
                                    <h3>Kolik z příjmů zůstává?</h3>
                                    <span className="muted" style={{ fontSize: 12 }}>% z příjmu</span>
                                </div>
                                <div className="card-body rep-bars">
                                    {savingsTrend.map(m => {
                                        const pct = Math.max(-100, Math.min(100, m.rate));
                                        return (
                                            <div key={m.month} className="rep-bar-row">
                                                <span className="rep-bar-name">{m.month}</span>
                                                <span className="rep-bar-track">
                                                    <span className={m.rate >= 0 ? 'pos' : 'neg'} style={{ width: `${Math.abs(pct)}%` }} />
                                                </span>
                                                <span className={`rep-bar-value num ${m.rate >= 0 ? 'pos' : 'neg'}`}>{m.rate} %</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="surface">
                                <div className="card-head">
                                    <h3>Za co utrácíte nejvíc</h3>
                                    <span className="muted" style={{ fontSize: 12 }}>celkem za období</span>
                                </div>
                                <div className="card-body rep-bars">
                                    {topCategoriesAgg.length === 0 ? (
                                        <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 'var(--spacing-lg)' }}>Žádné výdaje.</div>
                                    ) : topCategoriesAgg.map(([name, amount]) => {
                                        const max = topCategoriesAgg[0][1];
                                        return (
                                            <div key={name} className="rep-bar-row cat">
                                                <span className="rep-bar-name">{name}</span>
                                                <span className="rep-bar-track">
                                                    <span style={{ width: `${(amount / max) * 100}%`, background: categoryColors[name] || '#6b7280' }} />
                                                </span>
                                                <span className="rep-bar-value num">{formatMoney(amount)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>

                        {/* Detail po měsících */}
                        <section className="surface">
                    <div className="card-head">
                        <h3>Detail po měsících</h3>
                    </div>
                    {/* Desktop: table (Měsíc zarovnané s nadpisem, žádné boční odsazení) */}
                    <div className="reports-month-table">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '10px var(--spacing-lg) 10px 0', fontSize: 12, fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Měsíc</th>
                                    <th style={{ textAlign: 'right', padding: '10px var(--spacing-lg)', fontSize: 12, fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Příjmy</th>
                                    <th style={{ textAlign: 'right', padding: '10px var(--spacing-lg)', fontSize: 12, fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Výdaje</th>
                                    <th style={{ textAlign: 'right', padding: '10px var(--spacing-lg)', fontSize: 12, fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Bilance</th>
                                    <th style={{ textAlign: 'right', padding: '10px 0 10px var(--spacing-lg)', fontSize: 12, fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Úspora %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {totals.slice().reverse().map((m, i, arr) => {
                                    const rate = m.income > 0 ? Math.round((m.balance / m.income) * 100) : 0;
                                    return (
                                        <tr key={m.month} style={{ borderBottom: i < arr.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                                            <td style={{ padding: '11px var(--spacing-lg) 11px 0', fontWeight: 510, fontSize: 14 }}>{formatMonth(m.month)}</td>
                                            <td className="num" style={{ padding: '11px var(--spacing-lg)', textAlign: 'right', color: 'var(--pos)', fontSize: 14 }}>+{formatMoney(m.income)}</td>
                                            <td className="num" style={{ padding: '11px var(--spacing-lg)', textAlign: 'right', color: 'var(--text-2)', fontSize: 14 }}>{formatMoney(m.expenses)}</td>
                                            <td className="num" style={{ padding: '11px var(--spacing-lg)', textAlign: 'right', fontWeight: 600, fontSize: 14, color: m.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                                {m.balance >= 0 ? '+' : ''}{formatMoney(m.balance)}
                                            </td>
                                            <td className="num" style={{ padding: '11px 0 11px var(--spacing-lg)', textAlign: 'right', fontSize: 14, color: rate >= 0 ? 'var(--text)' : 'var(--neg)' }}>
                                                {rate}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* Mobile: stacked cards — vejde se bez horizontálního scrollu */}
                    <div className="reports-month-cards">
                        {totals.slice().reverse().map((m) => {
                            const rate = m.income > 0 ? Math.round((m.balance / m.income) * 100) : 0;
                            return (
                                <div key={m.month} className="reports-month-card">
                                    <div className="reports-month-card-head">
                                        <span className="reports-month-name">{formatMonth(m.month)}</span>
                                        <span className="num" style={{ fontWeight: 700, fontSize: 15, color: m.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                            {m.balance >= 0 ? '+' : ''}{formatMoney(m.balance)}
                                        </span>
                                    </div>
                                    <div className="reports-month-card-grid">
                                        <div>
                                            <span className="reports-mc-label">Příjmy</span>
                                            <span className="num" style={{ color: 'var(--pos)' }}>+{formatMoney(m.income)}</span>
                                        </div>
                                        <div>
                                            <span className="reports-mc-label">Výdaje</span>
                                            <span className="num" style={{ color: 'var(--text-2)' }}>{formatMoney(m.expenses)}</span>
                                        </div>
                                        <div>
                                            <span className="reports-mc-label">Úspora</span>
                                            <span className="num" style={{ color: rate >= 0 ? 'var(--text)' : 'var(--neg)' }}>{rate}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                        </section>
                    </div>

                    <aside className="rep-aside">
                        <div className="dash rep-accounts hide-with-drawer"><AccountsCard accounts={accounts} /></div>
                        <Link href="/wrapped" className="surface rep-promo">
                            <strong>Máte úspory. Velký přehled.</strong>
                            <span>Zobrazte si celý rok — příjmy, výdaje, nejlepší měsíce i vývoj úspor.</span>
                            <em>Podrobnější statistiky →</em>
                        </Link>
                    </aside>
                </div>

            </div>
        </MainLayout>
    );
}
