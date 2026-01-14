'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import { getDashboard, Account } from '@/lib/api';
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
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [report, setReport] = useState<MonthlyReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [months, setMonths] = useState(6);
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>(FALLBACK_COLORS);

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

    // Load category colors
    useEffect(() => {
        fetch('http://localhost:8000/api/categories')
            .then(res => res.json())
            .then((data: Category[]) => {
                const colors = data.reduce((acc, cat) => {
                    acc[cat.name] = cat.color;
                    return acc;
                }, { ...FALLBACK_COLORS } as Record<string, string>);
                setCategoryColors(colors);
            })
            .catch(err => console.error('Failed to load categories:', err));
    }, []);

    useEffect(() => {
        async function fetchData() {
            try {
                const [dashData, reportData] = await Promise.all([
                    getDashboard(),
                    fetch(`http://localhost:8000/api/dashboard/monthly-report?months=${months}`).then(r => r.json())
                ]);
                setAccounts(dashData.accounts || []);
                setReport(reportData);
            } catch (err) {
                console.error('Failed to load report:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [months]);

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
            <MainLayout accounts={accounts}>
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                    <p className="text-secondary">Načítám přehledy...</p>
                </div>
            </MainLayout>
        );
    }

    const categoryData = prepareCategoryData();

    return (
        <MainLayout accounts={accounts}>
            <header style={{ marginBottom: 'var(--spacing-xl)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>📊 Měsíční přehledy</h1>
                    <p className="text-secondary" style={{ marginTop: 'var(--spacing-sm)' }}>
                        Porovnání příjmů a výdajů
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    {[3, 6, 12].map(m => (
                        <button
                            key={m}
                            className={`btn ${months === m ? 'btn-primary' : ''}`}
                            onClick={() => setMonths(m)}
                            style={{ padding: '8px 16px' }}
                        >
                            {m} měsíců
                        </button>
                    ))}
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
                {/* Summary Cards */}
                {report && report.monthly_totals.length > 0 && (() => {
                    const totalIncome = report.monthly_totals.reduce((s, m) => s + m.income, 0);
                    const totalExpenses = report.monthly_totals.reduce((s, m) => s + m.expenses, 0);
                    const avgExpenses = totalExpenses / report.monthly_totals.length;

                    return (
                        <>
                            <GlassCard>
                                <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '4px' }}>
                                    Celkové příjmy
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--accent-success)' }}>
                                    {formatCurrency(totalIncome)}
                                </div>
                            </GlassCard>
                            <GlassCard>
                                <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '4px' }}>
                                    Celkové výdaje
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--accent-danger)' }}>
                                    {formatCurrency(totalExpenses)}
                                </div>
                            </GlassCard>
                            <GlassCard>
                                <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '4px' }}>
                                    Průměr měsíčně
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                                    {formatCurrency(avgExpenses)}
                                </div>
                            </GlassCard>
                        </>
                    );
                })()}
            </div>

            {/* Income vs Expenses Chart */}
            <GlassCard style={{ marginBottom: 'var(--spacing-xl)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>📈 Příjmy vs Výdaje</h3>
                <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={report?.monthly_totals.map(m => ({
                            ...m,
                            month: formatMonth(m.month)
                        })) || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(30, 30, 40, 0.95)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px'
                                }}
                                formatter={(value: number) => formatCurrency(value)}
                            />
                            <Legend />
                            <Bar dataKey="income" name="Příjmy" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expenses" name="Výdaje" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </GlassCard>

            {/* Category Breakdown Chart */}
            <GlassCard style={{ marginBottom: 'var(--spacing-xl)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>🏷️ Výdaje podle kategorií</h3>
                <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={categoryData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(30, 30, 40, 0.95)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px'
                                }}
                                formatter={(value: number) => formatCurrency(value)}
                            />
                            <Legend />
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
            <GlassCard>
                <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>📋 Detaily po měsících</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '0.875rem' }}>Měsíc</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.875rem' }}>Příjmy</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.875rem' }}>Výdaje</th>
                                <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '0.875rem' }}>Bilance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report?.monthly_totals.slice().reverse().map((m, i) => (
                                <tr key={m.month} style={{ borderBottom: i < report.monthly_totals.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <td style={{ padding: '12px 8px', fontWeight: 500 }}>{formatMonth(m.month)}</td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--accent-success)' }}>{formatCurrency(m.income)}</td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--accent-danger)' }}>{formatCurrency(m.expenses)}</td>
                                    <td style={{
                                        padding: '12px 8px',
                                        textAlign: 'right',
                                        fontWeight: 600,
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
        </MainLayout>
    );
}
