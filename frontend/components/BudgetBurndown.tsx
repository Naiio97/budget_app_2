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
import { Budget } from '@/lib/api';

// Burn-down tempa utrácení v měsíci: plná čára = skutečná kumulativní útrata,
// čárkované pokračování = lineární projekce do konce měsíce, vodorovná linka = limit.
// Solid→dashed přechod sám o sobě ukazuje „dnešek", takže svislá čára není potřeba.

const formatCZK = (amount: number) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

interface ChartPoint {
    day: number;
    actual: number | null;
    projection: number | null;
}

export default function BudgetBurndown({ budget }: { budget: Budget }) {
    const { daily_cumulative: cumulative, days_elapsed, days_in_month, projected, amount } = budget;

    const data = useMemo<ChartPoint[]>(() => {
        if (!cumulative?.length || !days_in_month) return [];
        const last = cumulative[cumulative.length - 1].spent;
        const points: ChartPoint[] = [];
        for (let day = 1; day <= days_in_month; day++) {
            const actual = day <= cumulative.length ? cumulative[day - 1].spent : null;
            let projection: number | null = null;
            if (day >= days_elapsed && days_in_month > days_elapsed) {
                // lineárně od dnešního stavu k odhadu na konci měsíce
                projection = last + (projected - last) * ((day - days_elapsed) / (days_in_month - days_elapsed));
            }
            points.push({ day, actual, projection });
        }
        return points;
    }, [cumulative, days_elapsed, days_in_month, projected]);

    if (data.length === 0) return null;

    const yMax = Math.max(amount, projected, budget.spent) * 1.08;
    const gradientId = `budget-burndown-${budget.id}`;

    return (
        <div style={{ height: 96, marginLeft: -4, marginRight: -4 }}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="day"
                        ticks={[1, 15, days_in_month]}
                        tickFormatter={(d) => `${d}.`}
                        stroke="var(--text-3)"
                        fontSize={10}
                        axisLine={false}
                        tickLine={false}
                        height={14}
                    />
                    <YAxis hide domain={[0, yMax]} />
                    <ReferenceLine
                        y={amount}
                        stroke="var(--border-strong)"
                        strokeDasharray="4 4"
                        label={{ value: 'limit', position: 'insideTopRight', fill: 'var(--text-3)', fontSize: 10 }}
                    />
                    <Tooltip
                        contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '8px 12px', fontSize: '0.8rem' }}
                        labelFormatter={(day) => `${day}. den`}
                        formatter={(value, name) => {
                            if (value == null) return [];
                            const labels: Record<string, string> = { actual: 'Utraceno', projection: 'Odhad' };
                            return [formatCZK(Number(value)), labels[String(name)] || String(name)];
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="actual"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
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
                        dot={false}
                        activeDot={{ r: 4 }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

// Textová predikce pod grafem: „tímhle tempem…" — stav nese text + barva,
// nikdy jen barva (ikonku/slovo má i barvoslepý uživatel).
export function BudgetPaceLabel({ budget }: { budget: Budget }) {
    const { projected, amount, days_elapsed, days_in_month } = budget;
    if (!days_in_month || days_elapsed <= 0) return null;

    const overrun = projected - amount;
    const ratio = amount > 0 ? projected / amount : 0;

    let color = 'var(--text-3)';
    let text = `Tímhle tempem: ~${formatCZK(projected)} — v limitu (rezerva ${formatCZK(Math.max(0, -overrun))})`;
    if (ratio >= 1) {
        color = 'var(--neg)';
        text = `Tímhle tempem: ~${formatCZK(projected)} — překročíš o ${formatCZK(overrun)}`;
    } else if (ratio >= 0.9) {
        color = 'var(--warn)';
        text = `Tímhle tempem: ~${formatCZK(projected)} — těsně pod limitem`;
    }

    return (
        <span style={{ fontSize: 12, color }}>
            {text}
        </span>
    );
}
