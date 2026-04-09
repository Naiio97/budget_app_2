'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
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
            <div className="page-container">
                <header className="reports-header">
                    <div>
                        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>📊 Měsíční přehledy</h1>
                        <p className="text-secondary" style={{ marginTop: '4px', fontSize: '0.875rem' }}>
                            Porovnání příjmů a výdajů
                        </p>
                    </div>
                    <div className="reports-period-btns">
                        {[3, 6, 12].map(m => (
                            <button
                                key={m}
                                className={`btn ${months === m ? 'btn-primary' : ''}`}
                                onClick={() => setMonths(m)}
                            >
                                {m} měsíců
                            </button>
                        ))}
                    </div>
                </header>

                {/* Summary Stats Bar */}
                {report && report.monthly_totals.length > 0 && (() => {
                    const totalIncome = report.monthly_totals.reduce((s, m) => s + m.income, 0);
                    const totalExpenses = report.monthly_totals.reduce((s, m) => s + m.expenses, 0);
                    const avgExpenses = totalExpenses / report.monthly_totals.length;

                    return (
                        <div className="tx-summary-bar animate-fade-in" style={{ marginBottom: 'var(--spacing-xl)' }}>
                            <div className="tx-summary-item">
                                <span className="tx-summary-label">Celkové příjmy</span>
                                <span className="tx-summary-value" style={{ color: 'var(--accent-success)' }}>
                                    +{formatCurrency(totalIncome)}
                                </span>
                            </div>
                            <div className="tx-summary-divider" />
                            <div className="tx-summary-item">
                                <span className="tx-summary-label">Celkové výdaje</span>
                                <span className="tx-summary-value" style={{ color: 'var(--accent-danger)' }}>
                                    {formatCurrency(totalExpenses)}
                                </span>
                            </div>
                            <div className="tx-summary-divider" />
                            <div className="tx-summary-item">
                                <span className="tx-summary-label">Průměr měsíčně</span>
                                <span className="tx-summary-value">
                                    {formatCurrency(avgExpenses)}
                                </span>
                            </div>
                        </div>
                    );
                })()}

                {/* Income vs Expenses Chart */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)', fontSize: '1.1rem' }}>📈 Příjmy vs Výdaje</h3>
                    <div style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={report?.monthly_totals.map(m => ({
                                ...m,
                                month: formatMonth(m.month)
                            })) || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" fontSize={11} />
                                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(30, 30, 40, 0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem'
                                    }}
                                    formatter={(value) => formatCurrency(Number(value))}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                                <Bar dataKey="income" name="Příjmy" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expenses" name="Výdaje" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>

                {/* Category Breakdown Chart */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)', fontSize: '1.1rem' }}>🏷️ Výdaje podle kategorií</h3>
                    <div style={{ height: '280px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={categoryData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" fontSize={11} />
                                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(30, 30, 40, 0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem'
                                    }}
                                    formatter={(value) => formatCurrency(Number(value))}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                                {report?.categories.map(cat => (
                                    <Area
                                        key={cat}
                                        type="monotone"
                                        dataKey={cat}
                                        stackId="1"
                                        stroke={categoryColors[cat] || '#6b7280'}
                                        fill={categoryColors[cat] || '#6b7280'}
                                        fillOpacity={0.6}
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>

                {/* Monthly Table */}
                <GlassCard style={{ paddingBottom: 'calc(var(--spacing-xl) * 2)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)', fontSize: '1.1rem' }}>📋 Detaily po měsících</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ textAlign: 'left', padding: '10px 6px', fontSize: '0.8rem' }}>Měsíc</th>
                                    <th style={{ textAlign: 'right', padding: '10px 6px', fontSize: '0.8rem' }}>Příjmy</th>
                                    <th style={{ textAlign: 'right', padding: '10px 6px', fontSize: '0.8rem' }}>Výdaje</th>
                                    <th style={{ textAlign: 'right', padding: '10px 6px', fontSize: '0.8rem' }}>Bilance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report?.monthly_totals.slice().reverse().map((m, i) => (
                                    <tr key={m.month} style={{ borderBottom: i < report.monthly_totals.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                        <td style={{ padding: '10px 6px', fontWeight: 500, fontSize: '0.85rem' }}>{formatMonth(m.month)}</td>
                                        <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--accent-success)', fontSize: '0.85rem' }}>{formatCurrency(m.income)}</td>
                                        <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--accent-danger)', fontSize: '0.85rem' }}>{formatCurrency(m.expenses)}</td>
                                        <td style={{
                                            padding: '10px 6px',
                                            textAlign: 'right',
                                            fontWeight: 600,
                                            fontSize: '0.85rem',
                                            color: m.balance >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'
                                        }}>
                                            {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            </div>
        </MainLayout>
    );
}
