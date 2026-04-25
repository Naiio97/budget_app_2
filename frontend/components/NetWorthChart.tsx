'use client';

import { useEffect, useState } from 'react';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts';
import { getNetWorthHistory, NetWorthHistory } from '@/lib/api';

interface NetWorthChartProps {
    currency?: string;
}

const PERIODS = [
    { label: '1M', days: 30 },
    { label: '3M', days: 90 },
    { label: '6M', days: 180 },
    { label: '1Y', days: 365 },
];

export default function NetWorthChart({ currency = 'CZK' }: NetWorthChartProps) {
    const [data, setData] = useState<NetWorthHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPeriod, setSelectedPeriod] = useState(30);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const history = await getNetWorthHistory(selectedPeriod);
                setData(history);
            } catch (err) {
                console.error('Failed to load net worth history:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [selectedPeriod]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    if (loading) {
        return (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
        );
    }

    if (!data || data.history.length === 0) {
        return (
            <div style={{
                height: '200px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)'
            }}>
                Žádná data k zobrazení
            </div>
        );
    }

    // Calculate change from start to end
    const lastEntry = data.history[data.history.length - 1];
    const startValue = data.history[0]?.total || 0;
    const endValue = lastEntry?.total || 0;
    const change = endValue - startValue;
    const changePercent = startValue > 0 ? ((change / startValue) * 100).toFixed(1) : '0';

    return (
        <div>
            {/* Header: current value + period toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)', flexWrap: 'wrap', gap: 8 }}>
                <div>
                    <div className="num" style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.028em' }}>
                        {formatCurrency(endValue)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span className={`chip ${change >= 0 ? 'chip-success' : 'chip-danger'}`}>
                            {change >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(change))} ({changePercent}%)
                        </span>
                    </div>
                </div>
                <div className="seg period-buttons-desktop">
                    {PERIODS.map(p => (
                        <div
                            key={p.days}
                            className={`seg-item ${selectedPeriod === p.days ? 'active' : ''}`}
                            onClick={() => setSelectedPeriod(p.days)}
                        >
                            {p.label}
                        </div>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div style={{ height: 260, marginLeft: -8 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.history} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorBank" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--pos)" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="var(--pos)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#bf5af2" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#bf5af2" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                            dataKey="date"
                            stroke="var(--text-3)"
                            fontSize={11}
                            tickFormatter={(value) => new Date(value).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                            interval="preserveStartEnd"
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            stroke="var(--text-3)"
                            fontSize={11}
                            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                            width={40}
                            tick={{ dx: -4 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '0.85rem' }}
                            labelFormatter={(value) => new Date(value).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                            formatter={(value, name) => {
                                const labels: Record<string, string> = { total: 'Celkem', bank: 'Banka', investment: 'Investice' };
                                return [formatCurrency(Number(value) || 0), labels[String(name)] || String(name)];
                            }}
                        />
                        <Area type="monotone" dataKey="bank" stroke="var(--pos)" strokeWidth={2} fill="url(#colorBank)" />
                        <Area type="monotone" dataKey="investment" stroke="#bf5af2" strokeWidth={2} fill="url(#colorInvestment)" />
                        <Area type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={2} fill="url(#colorTotal)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap', marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-sm)', borderTop: '0.5px solid var(--border)' }}>
                {[
                    { label: 'Celkem', color: 'var(--accent)', value: lastEntry?.total },
                    { label: 'Banka', color: 'var(--pos)', value: lastEntry?.bank },
                    { label: 'Investice', color: '#bf5af2', value: lastEntry?.investment },
                ].map(item => (
                    <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 10, height: 3, background: item.color, borderRadius: 2 }} />
                            <span className="small muted">{item.label}</span>
                        </div>
                        <span className="num" style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatCurrency(item.value || 0)}</span>
                    </div>
                ))}
            </div>

            {/* Period Buttons (Mobile only) */}
            <div className="period-buttons-mobile seg" style={{ width: '100%', marginTop: 'var(--spacing-md)' }}>
                {PERIODS.map(p => (
                    <div
                        key={p.days}
                        className={`seg-item ${selectedPeriod === p.days ? 'active' : ''}`}
                        onClick={() => setSelectedPeriod(p.days)}
                        style={{ flex: 1, justifyContent: 'center', display: 'flex' }}
                    >
                        {p.label}
                    </div>
                ))}
            </div>
        </div>
    );
}
