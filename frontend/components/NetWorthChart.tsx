'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNetWorthHistory, NetWorthHistory } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

interface NetWorthChartProps {
    currency?: string;
}

const PERIODS = [
    { label: '1M', days: 30, hint: 'oproti minulému měsíci' },
    { label: '3M', days: 90, hint: 'za poslední 3 měsíce' },
    { label: '6M', days: 180, hint: 'za posledních 6 měsíců' },
    { label: '1R', days: 365, hint: 'za poslední rok' },
];

const MAX_BARS = 30;

// Zaokrouhlí maximum nahoru na „hezkou" hodnotu pro osu (160 tis., 2 mil.…)
function niceMax(value: number): number {
    if (value <= 0) return 1;
    const step = Math.pow(10, Math.floor(Math.log10(value))) / 2;
    return Math.ceil(value / step) * step;
}

function formatAxis(value: number): string {
    if (value === 0) return '0 Kč';
    if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)} mil.`.replace('.', ',');
    if (value >= 1_000) return `${+(value / 1_000).toFixed(0)} tis.`;
    return String(Math.round(value));
}

function formatDay(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
}

function formatDayFull(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Sloučí denní řadu do nejvýš MAX_BARS sloupců — hodnota sloupce = poslední den v úseku.
function toBars(history: NetWorthHistory['history']) {
    if (history.length <= MAX_BARS) return history;
    const size = history.length / MAX_BARS;
    return Array.from({ length: MAX_BARS }, (_, i) => {
        const end = Math.min(history.length - 1, Math.floor((i + 1) * size) - 1);
        return history[end];
    });
}

export default function NetWorthChart({ currency = 'CZK' }: NetWorthChartProps) {
    const [selectedDays, setSelectedDays] = useState(30);
    const [hover, setHover] = useState<number | null>(null);
    const period = PERIODS.find(p => p.days === selectedDays) ?? PERIODS[0];

    const { data, isLoading, error } = useQuery<NetWorthHistory>({
        queryKey: ['net-worth-history', selectedDays],
        queryFn: () => getNetWorthHistory(selectedDays),
        staleTime: 60_000,
    });

    const history = data?.history ?? [];
    const last = history[history.length - 1];
    const first = history[0];
    const change = last && first ? last.total - first.total : 0;
    const changePct = first && first.total > 0 ? (change / first.total) * 100 : 0;
    const positive = change >= 0;

    const bars = toBars(history);
    const axisMax = niceMax(Math.max(0, ...bars.map(b => b.total)));
    const ticks = [axisMax, axisMax / 2, 0];
    const labelIdx = bars.length > 1
        ? [0, Math.round((bars.length - 1) / 3), Math.round(((bars.length - 1) * 2) / 3), bars.length - 1]
        : [0];

    return (
        <div className="dash-card dash-nw">
            <div className="dash-card-head">
                <h3>Vývoj majetku</h3>
                <div className="dash-range" role="tablist" aria-label="Období">
                    {PERIODS.map(p => (
                        <button
                            key={p.days}
                            role="tab"
                            aria-selected={selectedDays === p.days}
                            className={`dash-range-item ${selectedDays === p.days ? 'active' : ''}`}
                            onClick={() => setSelectedDays(p.days)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {error ? (
                <div className="dash-empty">Nepodařilo se načíst vývoj majetku.</div>
            ) : isLoading ? (
                <div className="dash-empty"><span className="dash-spinner" /></div>
            ) : !last ? (
                <div className="dash-empty">Žádná data k zobrazení</div>
            ) : (
                <>
                    <div className="dash-nw-hero">
                        <span className="dash-nw-value num">{formatCurrency(last.total, currency)}</span>
                        <span className={`dash-badge ${positive ? 'pos' : 'neg'}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                {positive ? <path d="m3 17 6-6 4 4 8-8M15 7h6v6" /> : <path d="m3 7 6 6 4-4 8 8M15 17h6v-6" />}
                            </svg>
                            {Math.abs(changePct).toFixed(1).replace('.', ',')} %
                        </span>
                    </div>
                    <div className="dash-nw-sub">
                        {positive ? '+' : '−'}{formatCurrency(Math.abs(change), currency)} {period.hint}
                    </div>

                    <div className="dash-bars">
                        <div className="dash-bars-axis" aria-hidden>
                            {ticks.map(t => <span key={t}>{formatAxis(t)}</span>)}
                        </div>
                        <div className="dash-bars-plot" onMouseLeave={() => setHover(null)}>
                            {bars.map((b, i) => (
                                <div
                                    key={b.date}
                                    className={`dash-bar-col ${hover === i ? 'hover' : ''}`}
                                    onMouseEnter={() => setHover(i)}
                                    onFocus={() => setHover(i)}
                                    onBlur={() => setHover(null)}
                                    tabIndex={0}
                                    role="img"
                                    aria-label={`${formatDay(b.date)}: ${formatCurrency(b.total, currency)}`}
                                >
                                    <div
                                        className={`dash-bar ${i === bars.length - 1 ? 'current' : ''}`}
                                        style={{ height: `${Math.max(2, (b.total / axisMax) * 100)}%` }}
                                    />
                                </div>
                            ))}
                            {hover != null && bars[hover] && (() => {
                                const b = bars[hover];
                                const prev = hover > 0 ? bars[hover - 1] : null;
                                const delta = prev ? b.total - prev.total : null;
                                const edge = hover < 3 ? 'left' : hover > bars.length - 4 ? 'right' : 'center';
                                return (
                                    <div
                                        className={`dash-tip ${edge}`}
                                        style={{
                                            left: `${((hover + 0.5) / bars.length) * 100}%`,
                                            bottom: `calc(${Math.max(2, (b.total / axisMax) * 100)}% + 12px)`,
                                        }}
                                    >
                                        <span className="dash-tip-date">{formatDayFull(b.date)}</span>
                                        <strong className="dash-tip-total num">{formatCurrency(b.total, currency)}</strong>
                                        {delta != null && (
                                            <span className={`dash-tip-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                                                {delta >= 0 ? '▲ +' : '▼ −'}{formatCurrency(Math.abs(delta), currency)} oproti předchozímu
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="dash-bars-labels" aria-hidden>
                            {labelIdx.map((i, k) => (
                                <span key={`${i}-${k}`}>{formatDay(bars[i].date)}</span>
                            ))}
                        </div>
                    </div>

                    <div className="dash-nw-split">
                        <div>
                            <span className="dash-split-label"><span className="dash-dot bank" />Bankovní účty</span>
                            <strong className="num">{formatCurrency(last.bank, currency)}</strong>
                        </div>
                        <div>
                            <span className="dash-split-label"><span className="dash-dot invest" />Investice</span>
                            <strong className="num">{formatCurrency(last.investment, currency)}</strong>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
