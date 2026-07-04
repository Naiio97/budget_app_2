'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import MainLayout from '@/components/MainLayout';
import { getWrapped, SpendingWrapped } from '@/lib/api';
import { getCategoryIcon } from '@/lib/category-icons';

// Roční přehled — „Spending Wrapped": top obchodníci, nejdražší měsíc,
// žebříček kategorií, největší výdaj a projekty (tagy) za vybraný rok.

const CATEGORY_ICON_KEY: Record<string, string> = {
    Food: 'utensils', Transport: 'car', Utilities: 'bulb', Entertainment: 'film',
    Shopping: 'cart', Health: 'health', Investment: 'trending', Subscription: 'phone',
    Salary: 'wallet', Dividend: 'banknote', Other: 'box',
};

const formatCZK = (amount: number) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const monthLabel = (month: string) =>
    new Date(`${month}-01`).toLocaleDateString('cs-CZ', { month: 'short' }).replace('.', '');

const monthLabelLong = (month: string) => {
    const s = new Date(`${month}-01`).toLocaleDateString('cs-CZ', { month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
};

function MonthlyChart({ data }: { data: SpendingWrapped }) {
    const topMonth = data.top_month?.month;
    const chartData = data.monthly.map(m => ({
        ...m,
        label: monthLabel(m.month),
        // direct label jen na nejdražším měsíci — selektivní popisky, ne číslo všude
        topLabel: m.month === topMonth && m.expenses > 0 ? formatCZK(m.expenses) : '',
    }));

    return (
        <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 24, right: 4, left: 4, bottom: 0 }}>
                    <XAxis
                        dataKey="label"
                        stroke="var(--text-3)"
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                    />
                    <YAxis hide />
                    <Tooltip
                        cursor={{ fill: 'var(--surface-sunken)' }}
                        contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: '0.85rem' }}
                        labelFormatter={(_, payload) => monthLabelLong(String(payload?.[0]?.payload?.month ?? ''))}
                        formatter={(value) => [formatCZK(Number(value) || 0), 'Utraceno']}
                    />
                    <Bar dataKey="expenses" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        <LabelList dataKey="topLabel" position="top" style={{ fill: 'var(--text-2)', fontSize: 11, fontWeight: 600 }} />
                        {chartData.map((m) => (
                            <Cell
                                key={m.month}
                                fill="var(--accent)"
                                fillOpacity={m.month === topMonth ? 1 : 0.55}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default function WrappedPage() {
    const [year, setYear] = useState<number | undefined>(undefined);

    const { data, isLoading } = useQuery<SpendingWrapped>({
        queryKey: ['wrapped', year ?? 'latest'],
        queryFn: () => getWrapped(year),
        staleTime: 5 * 60_000,
    });

    const hasData = !!data && data.totals.expenses > 0;

    return (
        <MainLayout>
            <div className="page-container" style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>

                <div className="page-head">
                    <div>
                        <h1>Rok {data?.year ?? ''} v penězích</h1>
                        <div className="sub">Roční přehled utrácení — Spending Wrapped</div>
                    </div>
                    {data && data.available_years.length > 1 && (
                        <div className="seg">
                            {data.available_years.map(y => (
                                <div
                                    key={y}
                                    className={`seg-item ${y === data.year ? 'active' : ''}`}
                                    onClick={() => setYear(y)}
                                >
                                    {y}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {isLoading && (
                    <div className="surface" style={{ padding: 'var(--spacing-lg)', color: 'var(--text-3)' }}>
                        Počítám tvůj rok…
                    </div>
                )}

                {!isLoading && !hasData && (
                    <div className="surface" style={{ padding: 'var(--spacing-lg)', color: 'var(--text-3)' }}>
                        Pro rok {data?.year} tu zatím nejsou žádné výdaje.
                    </div>
                )}

                {hasData && (
                    <>
                        {/* KPI řada */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                            <div className="surface kpi">
                                <div className="kpi-label">Utraceno</div>
                                <div className="kpi-value num" style={{ color: 'var(--neg)' }}>{formatCZK(data.totals.expenses)}</div>
                                <div className="kpi-sub"><span>{data.totals.expense_count} plateb</span></div>
                            </div>
                            <div className="surface kpi">
                                <div className="kpi-label">Příjmy</div>
                                <div className="kpi-value num" style={{ color: 'var(--pos)' }}>{formatCZK(data.totals.income)}</div>
                                <div className="kpi-sub"><span>bez vypořádání a převodů</span></div>
                            </div>
                            <div className="surface kpi">
                                <div className="kpi-label">Ušetřeno</div>
                                <div className="kpi-value num" style={{ color: data.totals.saved >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                    {formatCZK(data.totals.saved)}
                                </div>
                                <div className="kpi-sub">
                                    <span>{data.totals.no_spend_days} dní bez utrácení z {data.totals.days_elapsed}</span>
                                </div>
                            </div>
                        </div>

                        {/* Měsíce */}
                        <div className="surface">
                            <div className="card-head">
                                <h3>Utrácení po měsících</h3>
                                {data.top_month && (
                                    <span className="muted" style={{ fontSize: 13 }}>
                                        Nejdražší: <strong>{monthLabelLong(data.top_month.month)}</strong>
                                    </span>
                                )}
                            </div>
                            <div className="card-body">
                                <MonthlyChart data={data} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-md)' }}>
                            {/* Top obchodníci */}
                            <div className="surface">
                                <div className="card-head"><h3>Top obchodníci</h3></div>
                                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {data.top_merchants.map((m, i) => (
                                        <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span className="num" style={{ width: 20, color: 'var(--text-3)', fontSize: 13, fontWeight: 600 }}>{i + 1}.</span>
                                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: i === 0 ? 600 : 400 }}>
                                                {m.name}
                                            </span>
                                            <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>{m.count}×</span>
                                            <span className="num" style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{formatCZK(m.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top kategorie */}
                            <div className="surface">
                                <div className="card-head"><h3>Top kategorie</h3></div>
                                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {data.top_categories.map(c => {
                                        const pct = data.totals.expenses > 0 ? (c.total / data.totals.expenses) * 100 : 0;
                                        return (
                                            <div key={c.category} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ color: 'var(--text-2)', display: 'flex' }}>
                                                        {getCategoryIcon(CATEGORY_ICON_KEY[c.category] ?? 'box', 15)}
                                                    </span>
                                                    <span style={{ flex: 1, fontSize: 14 }}>{c.category}</span>
                                                    <span className="muted" style={{ fontSize: 12 }}>{pct.toFixed(0)} %</span>
                                                    <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{formatCZK(c.total)}</span>
                                                </div>
                                                <div className="progress">
                                                    <span style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--accent)' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Největší výdaj + projekty */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-md)' }}>
                            {data.biggest_expense && (
                                <div className="surface kpi">
                                    <div className="kpi-label">Největší výdaj roku</div>
                                    <div className="kpi-value num" style={{ fontSize: '1.5rem' }}>{formatCZK(data.biggest_expense.amount)}</div>
                                    <div className="kpi-sub" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <span style={{ color: 'var(--text-2)' }}>{data.biggest_expense.description}</span>
                                        <span>
                                            {new Date(data.biggest_expense.date).toLocaleDateString('cs-CZ')} · {data.biggest_expense.category}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {data.tags.length > 0 && (
                                <div className="surface">
                                    <div className="card-head"><h3>Projekty (tagy)</h3></div>
                                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {data.tags.map(t => (
                                            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
                                                    #{t.name}
                                                </span>
                                                <span className="muted" style={{ fontSize: 12 }}>{t.count}×</span>
                                                <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{formatCZK(t.total)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

            </div>
        </MainLayout>
    );
}
