'use client';

import { useMemo } from 'react';
import {
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';
import { Cashflow, CashflowEvent } from '@/lib/api';

// Kalendář cashflow (VYLEPSENI.md 4.5): plná čára = skutečný zůstatek od
// začátku měsíce, čárkovaná = projekce do konce měsíce z nezaplacených plateb,
// splátek, předplatných a očekávané výplaty. Stejný idiom jako BudgetBurndown
// (solid→dashed přechod ukazuje „dnešek"), jedna osa, jeden odstín.

const formatCZK = (amount: number) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatDayMonth = (iso: string) => `${parseInt(iso.slice(8, 10), 10)}. ${parseInt(iso.slice(5, 7), 10)}.`;

interface ChartPoint {
    day: number;
    date: string;
    actual: number | null;
    projection: number | null;
    events: CashflowEvent[];
}

export default function CashflowCard({ data }: { data: Cashflow }) {
    const { history, projection, events, projected_eom, projected_min, expected_out, expected_in } = data;

    const points = useMemo<ChartPoint[]>(() => {
        if (!history?.length || !projection?.length) return [];
        const eventsByDate = new Map<string, CashflowEvent[]>();
        for (const e of events) {
            const list = eventsByDate.get(e.date) || [];
            list.push(e);
            eventsByDate.set(e.date, list);
        }
        const result: ChartPoint[] = history.map(p => ({
            day: parseInt(p.date.slice(8, 10), 10),
            date: p.date,
            actual: p.balance,
            projection: null,
            events: [],
        }));
        // Dnešek je poslední bod historie i první bod projekce — čáry se napojí.
        result[result.length - 1].projection = projection[0].balance;
        for (const p of projection.slice(1)) {
            result.push({
                day: parseInt(p.date.slice(8, 10), 10),
                date: p.date,
                actual: null,
                projection: p.balance,
                events: eventsByDate.get(p.date) || [],
            });
        }
        return result;
    }, [history, projection, events]);

    if (points.length === 0) return null;

    const balances = points.map(p => (p.actual ?? p.projection) as number);
    const minBalance = Math.min(...balances);
    const maxBalance = Math.max(...balances);
    const pad = Math.max((maxBalance - minBalance) * 0.08, 1);
    const showZeroLine = minBalance < 0;
    const yDomain: [number, number] = [minBalance - pad, maxBalance + pad];
    const minIsAhead = projected_min && projected_min.date > data.today;

    return (
        <div className="surface cashflow-card">
            <div className="card-head">
                <h3>Cashflow do konce měsíce</h3>
                <span className="muted small">
                    {events.length === 0 ? 'žádné očekávané pohyby' : `${events.length} očekávaných pohybů`}
                </span>
            </div>
            <div className="card-body">
                <div className="cashflow-kpis">
                    <div className="cashflow-kpi">
                        <span className="cashflow-kpi-label">Teď na účtech</span>
                        <span className="num cashflow-kpi-value">{formatCZK(data.current_balance)}</span>
                    </div>
                    <div className="cashflow-kpi">
                        <span className="cashflow-kpi-label">Zbývá zaplatit</span>
                        <span className="num cashflow-kpi-value">{expected_out > 0 ? `−${formatCZK(expected_out)}` : '—'}</span>
                    </div>
                    <div className="cashflow-kpi">
                        <span className="cashflow-kpi-label">Čeká příjem</span>
                        <span className="num cashflow-kpi-value">{expected_in > 0 ? `+${formatCZK(expected_in)}` : '—'}</span>
                    </div>
                    <div className="cashflow-kpi">
                        <span className="cashflow-kpi-label">Konec měsíce</span>
                        <span className="num cashflow-kpi-value" style={{ color: projected_eom < 0 ? 'var(--neg)' : 'var(--text)' }}>
                            ~{formatCZK(projected_eom)}
                        </span>
                    </div>
                </div>

                <div style={{ height: 130, marginLeft: -4, marginRight: -4 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                            <defs>
                                <linearGradient id="cashflow-actual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="day"
                                ticks={[1, 15, points[points.length - 1].day]}
                                tickFormatter={(d) => `${d}.`}
                                stroke="var(--text-3)"
                                fontSize={10}
                                axisLine={false}
                                tickLine={false}
                                height={14}
                            />
                            <YAxis hide domain={yDomain} />
                            {showZeroLine && (
                                <ReferenceLine
                                    y={0}
                                    stroke="var(--neg)"
                                    strokeDasharray="4 4"
                                    label={{ value: '0 Kč', position: 'insideBottomRight', fill: 'var(--neg)', fontSize: 10 }}
                                />
                            )}
                            <Tooltip
                                contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: '0.8rem' }}
                                labelFormatter={(_, payload) => {
                                    const p = payload?.[0]?.payload as ChartPoint | undefined;
                                    if (!p) return '';
                                    const head = formatDayMonth(p.date);
                                    if (p.events.length === 0) return head;
                                    return `${head} · ${p.events.map(e =>
                                        `${e.name} ${e.amount > 0 ? '+' : '−'}${formatCZK(Math.abs(e.amount))}${e.date_estimated ? ' (odhad)' : ''}`
                                    ).join(' · ')}`;
                                }}
                                formatter={(value, name) => {
                                    if (value == null) return [];
                                    const labels: Record<string, string> = { actual: 'Zůstatek', projection: 'Odhad' };
                                    return [formatCZK(Number(value)), labels[String(name)] || String(name)];
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="actual"
                                stroke="var(--accent)"
                                strokeWidth={2}
                                fill="url(#cashflow-actual)"
                                connectNulls={false}
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="projection"
                                stroke="var(--accent)"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                strokeOpacity={0.55}
                                connectNulls={false}
                                isAnimationActive={false}
                                dot={(props) => {
                                    // Tečka jen v den s očekávaným pohybem — příjem/výdaj rozliší výplň
                                    const { cx, cy, payload, index } = props as { cx?: number; cy?: number; payload: ChartPoint; index: number };
                                    if (cx == null || cy == null || payload.events.length === 0) return <g key={`d-${index}`} />;
                                    const hasIncome = payload.events.some(e => e.amount > 0);
                                    return (
                                        <circle key={`d-${index}`} cx={cx} cy={cy} r={3.5}
                                            fill={hasIncome ? 'var(--pos)' : 'var(--accent)'}
                                            stroke="var(--surface-strong)" strokeWidth={1.5} />
                                    );
                                }}
                                activeDot={{ r: 4 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {projected_min && minIsAhead && projected_min.balance < 0 && (
                    <span className="cashflow-warning" style={{ color: 'var(--neg)' }}>
                        ⚠ {formatDayMonth(projected_min.date)} klesneš na {formatCZK(projected_min.balance)} — naplánuj převod
                    </span>
                )}
                {projected_min && minIsAhead && projected_min.balance >= 0 && projected_min.balance < data.current_balance * 0.2 && (
                    <span className="cashflow-warning" style={{ color: 'var(--warn)' }}>
                        Nejnižší bod: {formatDayMonth(projected_min.date)} · {formatCZK(projected_min.balance)}
                    </span>
                )}
            </div>
        </div>
    );
}
