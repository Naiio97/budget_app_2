'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';

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
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

// Fallback colors
const FALLBACK_COLORS: Record<string, string> = {
    'Food': '#ef4444',
    'Transport': '#f97316',
    'Shopping': '#14b8a6',
    'Entertainment': '#22c55e',
    'Utilities': '#eab308',
    'Health': '#ec4899',
    'Investment': '#3b82f6',
    'Dividend': '#8b5cf6',
    'Salary': '#10b981',
    'Other': '#6b7280',
};

export default function ReportsPage() {
    const [months, setMonths] = useState(6);

    const { data: report, isLoading: loading } = useQuery<MonthlyReport>({
        queryKey: ['monthly-report', months],
        queryFn: () =>
            fetch(`${API_BASE}/dashboard/monthly-report?months=${months}`).then(r => r.json()),
    });

    const { data: categoriesData } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: () => fetch(`${API_BASE}/categories/`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
        staleTime: 5 * 60 * 1000,
    });

    const categoryColors: Record<string, string> = categoriesData
        ? categoriesData.reduce((acc, cat) => { acc[cat.name] = cat.color; return acc; }, { ...FALLBACK_COLORS } as Record<string, string>)
        : FALLBACK_COLORS;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency: 'CZK',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('cs-CZ', { month: 'short', year: '2-digit' });
    };

    // Prepare category data per month for stacked chart
    const prepareCategoryData = () => {
        if (!report) return [];

        const monthData: Record<string, Record<string, number>> = {};

        for (const item of report.category_breakdown) {
            if (!monthData[item.month]) {
                monthData[item.month] = {};
            }
            monthData[item.month][item.category] = item.amount;
        }

        return report.monthly_totals.map(m => ({
            month: formatMonth(m.month),
            ...monthData[m.month]
        }));
    };

    if (loading) {
        return (
            <MainLayout>
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                    <p className="text-secondary">Načítám přehledy...</p>
                </div>
            </MainLayout>
        );
    }

    const categoryData = prepareCategoryData();

    return (
        <MainLayout>
            <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                {/* Page header */}
                <div className="page-head">
                    <div>
                        <h1>Přehledy</h1>
                        <div className="sub">Trendy a srovnání měsíců</div>
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
                </div>

                {/* KPI row */}
                {report && report.monthly_totals.length > 0 && (() => {
                    const totalIncome = report.monthly_totals.reduce((s, m) => s + m.income, 0);
                    const totalExpenses = report.monthly_totals.reduce((s, m) => s + m.expenses, 0);
                    const avgExpenses = totalExpenses / report.monthly_totals.length;
                    return (
                        <div className="grid-3">
                            <div className="surface kpi">
                                <div className="kpi-label">Příjmy celkem</div>
                                <div className="kpi-value num" style={{ color: 'var(--pos)' }}>+{formatCurrency(totalIncome)}</div>
                                <div className="kpi-sub"><span>za {months} měsíců</span></div>
                            </div>
                            <div className="surface kpi">
                                <div className="kpi-label">Výdaje celkem</div>
                                <div className="kpi-value num">{formatCurrency(totalExpenses)}</div>
                                <div className="kpi-sub"><span>za {months} měsíců</span></div>
                            </div>
                            <div className="surface kpi">
                                <div className="kpi-label">Průměr výdajů / měsíc</div>
                                <div className="kpi-value num">{formatCurrency(avgExpenses)}</div>
                                <div className="kpi-sub"><span>průměr</span></div>
                            </div>
                        </div>
                    );
                })()}

                {/* Income vs Expenses Chart */}
                <div className="surface">
                    <div className="card-head">
                        <h3>Příjmy vs. výdaje</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={report?.monthly_totals.map(m => ({ ...m, month: formatMonth(m.month) })) || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="month" stroke="var(--text-3)" fontSize={11} />
                                    <YAxis stroke="var(--text-3)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
                                        formatter={(value) => formatCurrency(Number(value))}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                                    <Bar dataKey="income" name="Příjmy" fill="var(--pos)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="expenses" name="Výdaje" fill="var(--neg)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Category Breakdown Chart */}
                <div className="surface">
                    <div className="card-head">
                        <h3>Výdaje podle kategorií</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={categoryData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="month" stroke="var(--text-3)" fontSize={11} />
                                    <YAxis stroke="var(--text-3)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
                                        formatter={(value) => formatCurrency(Number(value))}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                                    {report?.categories.map(cat => (
                                        <Area key={cat} type="monotone" dataKey={cat} stackId="1"
                                            stroke={categoryColors[cat] || 'var(--text-3)'}
                                            fill={categoryColors[cat] || 'var(--text-3)'}
                                            fillOpacity={0.6} />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Monthly Table */}
                <div className="surface">
                    <div className="card-head">
                        <h3>Detail po měsících</h3>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '10px var(--spacing-lg)', fontSize: '12px', fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Měsíc</th>
                                    <th style={{ textAlign: 'right', padding: '10px var(--spacing-lg)', fontSize: '12px', fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Příjmy</th>
                                    <th style={{ textAlign: 'right', padding: '10px var(--spacing-lg)', fontSize: '12px', fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Výdaje</th>
                                    <th style={{ textAlign: 'right', padding: '10px var(--spacing-lg)', fontSize: '12px', fontWeight: 590, color: 'var(--text-3)', letterSpacing: '0.03em' }}>Bilance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report?.monthly_totals.slice().reverse().map((m, i, arr) => (
                                    <tr key={m.month} style={{ borderBottom: i < arr.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                                        <td style={{ padding: '11px var(--spacing-lg)', fontWeight: 510, fontSize: '0.875rem' }}>{formatMonth(m.month)}</td>
                                        <td className="num" style={{ padding: '11px var(--spacing-lg)', textAlign: 'right', color: 'var(--pos)', fontSize: '0.875rem' }}>+{formatCurrency(m.income)}</td>
                                        <td className="num" style={{ padding: '11px var(--spacing-lg)', textAlign: 'right', color: 'var(--text-2)', fontSize: '0.875rem' }}>{formatCurrency(m.expenses)}</td>
                                        <td className="num" style={{ padding: '11px var(--spacing-lg)', textAlign: 'right', fontWeight: 600, fontSize: '0.875rem', color: m.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                            {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </MainLayout>
    );
}
