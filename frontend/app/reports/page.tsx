'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import PageLoader from '@/components/PageLoader';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line
} from 'recharts';
import { queryKeys } from '@/lib/queryKeys';
import { getLineIcon } from '@/lib/line-icons';
import { apiFetch } from '@/lib/api';

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

interface Category {
    id: number;
    name: string;
    color: string;
    icon?: string;
}

const FALLBACK_COLORS: Record<string, string> = {
    'Restaurant': '#ef4444', 'Food': '#ef4444', 'Transport': '#f97316', 'Utilities': '#eab308',
    'Entertainment': '#22c55e', 'Shopping': '#14b8a6', 'Investment': '#3b82f6',
    'Dividend': '#8b5cf6', 'Salary': '#10b981', 'Subscription': '#030303',
    'Installments': '#4b4c95', 'Insurance': '#e5c52a', 'Supermarkets': '#e69eb0',
    'ATM': '#f28f64', 'Other': '#6b7280',
};

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

    const { data: categoriesData = [] } = useQuery<Category[]>({
        queryKey: queryKeys.categories,
        queryFn: () => apiFetch(`/categories/`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
        staleTime: 5 * 60 * 1000,
    });

    const categoryColors: Record<string, string> = useMemo(() =>
        categoriesData.reduce((acc, cat) => {
            acc[cat.name] = cat.color || FALLBACK_COLORS[cat.name] || '#6b7280';
            return acc;
        }, { ...FALLBACK_COLORS } as Record<string, string>),
        [categoriesData]
    );

    // Per-month breakdown with one line per top-5 category. Lines are easier to read
    // than stacked bars/areas — you can compare categories at a glance.
    const { categoryTrendData, trendCategories } = useMemo(() => {
        if (!report) return { categoryTrendData: [], trendCategories: [] as string[] };

        const totals = new Map<string, number>();
        for (const item of report.category_breakdown) {
            totals.set(item.category, (totals.get(item.category) || 0) + item.amount);
        }
        const top = Array.from(totals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);
        const topSet = new Set(top);

        const monthMap: Record<string, Record<string, number>> = {};
        for (const item of report.category_breakdown) {
            if (!topSet.has(item.category)) continue;
            if (!monthMap[item.month]) monthMap[item.month] = {};
            monthMap[item.month][item.category] = item.amount;
        }

        const data = report.monthly_totals.map(m => {
            const row: Record<string, number | string> = { month: formatMonth(m.month) };
            for (const cat of top) {
                row[cat] = monthMap[m.month]?.[cat] ?? 0;
            }
            return row;
        });

        return { categoryTrendData: data, trendCategories: top };
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
                        <Link href="/wrapped" className="btn btn-sm roc-pill" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {getLineIcon('star', 14)} Roční přehled
                        </Link>
                    </div>
                </div>

                {/* Hero KPI strip */}
                <section className="surface" style={{ padding: '24px 28px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24 }}>
                        <div>
                            <div className="kpi-label">Příjmy · {months} měsíců</div>
                            <div className="num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--pos)', letterSpacing: '-0.03em', marginTop: 4 }}>
                                +{formatMoney(totalIncome)}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>průměr {formatMoney(avgIncome)}/měsíc</div>
                        </div>
                        <div>
                            <div className="kpi-label">Výdaje · {months} měsíců</div>
                            <div className="num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--neg)', letterSpacing: '-0.03em', marginTop: 4 }}>
                                -{formatMoney(totalExpenses)}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>průměr {formatMoney(avgExpenses)}/měsíc</div>
                        </div>
                        <div>
                            <div className="kpi-label">Úspora celkem</div>
                            <div className="num" style={{ fontSize: 28, fontWeight: 700, color: totalSavings >= 0 ? 'var(--pos)' : 'var(--neg)', letterSpacing: '-0.03em', marginTop: 4 }}>
                                {totalSavings >= 0 ? '+' : ''}{formatMoney(totalSavings)}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                                {overallSavingsRate}% z příjmu
                            </div>
                        </div>
                        <div>
                            <div className="kpi-label">Výdaje vs. min. měsíc</div>
                            <div className="num" style={{
                                fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 4,
                                color: momExpensesChange == null ? 'var(--text-3)' : momExpensesChange > 0 ? 'var(--neg)' : 'var(--pos)',
                            }}>
                                {momExpensesChange == null ? '—' : `${momExpensesChange > 0 ? '+' : ''}${momExpensesChange}%`}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                                {last && prev ? `${formatMonth(last.month)} vs ${formatMonth(prev.month)}` : 'málo dat'}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Income vs Expenses bar chart */}
                <section className="surface">
                    <div className="card-head">
                        <h3>Příjmy vs. výdaje</h3>
                        <span className="muted" style={{ fontSize: 12 }}>{months} měsíců zpět</span>
                    </div>
                    <div className="card-body">
                        <div style={{ height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={totals.map(m => ({ ...m, month: formatMonth(m.month) }))}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="month" stroke="var(--text-3)" fontSize={11} axisLine={false} tickLine={false} />
                                    <YAxis stroke="var(--text-3)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={42} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
                                        formatter={(value, name) => [formatMoney(Number(value)), name === 'income' ? 'Příjmy' : 'Výdaje']}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem' }} formatter={(value) => value === 'income' ? 'Příjmy' : 'Výdaje'} />
                                    <Bar dataKey="income" fill="var(--pos)" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="expenses" fill="var(--neg)" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                {/* Two-column row: savings trend + top categories */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 'var(--spacing-lg)' }} className="reports-insight-grid">
                    <section className="surface">
                        <div className="card-head">
                            <h3>Trend úspory</h3>
                            <span className="muted" style={{ fontSize: 12 }}>% z příjmu / měsíc</span>
                        </div>
                        <div className="card-body">
                            <div style={{ height: 220 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={savingsTrend}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="month" stroke="var(--text-3)" fontSize={11} axisLine={false} tickLine={false} />
                                        <YAxis stroke="var(--text-3)" fontSize={11} tickFormatter={(v) => `${v}%`} width={40} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
                                            formatter={(value, name, item) => {
                                                const balance = item?.payload?.balance ?? 0;
                                                return [`${value}%  (${formatMoney(balance)})`, 'Úspora'];
                                            }}
                                        />
                                        <Line type="monotone" dataKey="rate" stroke="var(--pos)" strokeWidth={3} dot={{ r: 4, fill: 'var(--pos)' }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </section>

                    <section className="surface">
                        <div className="card-head">
                            <h3>Top kategorie</h3>
                            <span className="muted" style={{ fontSize: 12 }}>Celkem za období</span>
                        </div>
                        <div className="card-body">
                            {topCategoriesAgg.length === 0 ? (
                                <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 'var(--spacing-lg)' }}>Žádné výdaje.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {topCategoriesAgg.map(([name, amount]) => {
                                        const max = topCategoriesAgg[0][1];
                                        const color = categoryColors[name] || '#6b7280';
                                        return (
                                            <div key={name}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                                                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{name}</span>
                                                    <span className="num" style={{ color: 'var(--text-2)' }}>{formatMoney(amount)}</span>
                                                </div>
                                                <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${(amount / max) * 100}%`, background: color, borderRadius: 999 }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Multi-line: trend per top-5 category — easier to read than stacked area */}
                <section className="surface">
                    <div className="card-head">
                        <h3>Kategorie po měsících</h3>
                        <span className="muted" style={{ fontSize: 12 }}>Top 5 kategorií · vývoj</span>
                    </div>
                    <div className="card-body">
                        {trendCategories.length === 0 ? (
                            <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                                Žádné výdaje k zobrazení.
                            </div>
                        ) : (
                            <div style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={categoryTrendData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="month" stroke="var(--text-3)" fontSize={11} axisLine={false} tickLine={false} />
                                        <YAxis stroke="var(--text-3)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={42} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
                                            formatter={(value, name) => [formatMoney(Number(value)), name as string]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} iconType="circle" />
                                        {trendCategories.map(cat => (
                                            <Line
                                                key={cat}
                                                type="monotone"
                                                dataKey={cat}
                                                stroke={categoryColors[cat] || '#6b7280'}
                                                strokeWidth={2.5}
                                                dot={{ r: 3 }}
                                                activeDot={{ r: 5 }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </section>

                {/* Monthly table */}
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
        </MainLayout>
    );
}
