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
            <div style={{
                height: '300px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid var(--glass-border-light)',
                    borderTopColor: 'var(--accent-primary)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }} />
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
    const startValue = data.history[0]?.total || 0;
    const endValue = data.history[data.history.length - 1]?.total || 0;
    const change = endValue - startValue;
    const changePercent = startValue > 0 ? ((change / startValue) * 100).toFixed(1) : '0';

    return (
        <div>
            {/* Header with period selector */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-md)'
            }}>
                <div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                        {formatCurrency(endValue)}
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-xs)',
                        marginTop: '4px'
                    }}>
                        <span className={`stat-change ${change >= 0 ? 'positive' : 'negative'}`}>
                            {change >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(change))} ({changePercent}%)
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {PERIODS.map(p => (
                        <button
                            key={p.days}
                            onClick={() => setSelectedPeriod(p.days)}
                            className={`btn ${selectedPeriod === p.days ? 'btn-primary' : ''}`}
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div style={{ height: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.history}>
                        <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorBank" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#007AFF" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#007AFF" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#9C27B0" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#9C27B0" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="date"
                            stroke="rgba(255,255,255,0.5)"
                            fontSize={11}
                            tickFormatter={(value) => new Date(value).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            stroke="rgba(255,255,255,0.5)"
                            fontSize={11}
                            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                            width={50}
                        />
                        <Tooltip
                            contentStyle={{
                                background: 'rgba(0,0,0,0.85)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                padding: '12px'
                            }}
                            labelFormatter={(value) => new Date(value).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                            formatter={(value, name) => {
                                const labels: Record<string, string> = {
                                    total: 'Celkem',
                                    bank: 'Banka',
                                    investment: 'Investice'
                                };
                                return [formatCurrency(Number(value) || 0), labels[String(name)] || String(name)];
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="bank"
                            stroke="#007AFF"
                            strokeWidth={2}
                            fill="url(#colorBank)"
                        />
                        <Area
                            type="monotone"
                            dataKey="investment"
                            stroke="#9C27B0"
                            strokeWidth={2}
                            fill="url(#colorInvestment)"
                        />
                        <Area
                            type="monotone"
                            dataKey="total"
                            stroke="#2dd4bf"
                            strokeWidth={2}
                            fill="url(#colorTotal)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 'var(--spacing-lg)',
                marginTop: 'var(--spacing-md)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '3px', background: '#2dd4bf', borderRadius: '2px' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Celkem</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '3px', background: '#007AFF', borderRadius: '2px' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Banka</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '3px', background: '#9C27B0', borderRadius: '2px' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Investice</span>
                </div>
            </div>
        </div>
    );
}
