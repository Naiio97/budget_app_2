'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import {
    getInvestmentPortfolio,
    getPortfolioHistory,
    getDividends,
    getPortfolioDetail,
    getPositions,
    getPies,
    InvestmentPortfolio,
    InvestmentPortfolioDetail,
    PortfolioHistory,
    PortfolioPosition,
    Dividend,
    Pie as PieData,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
    PieChart,
    Pie,
    Cell,
} from 'recharts';

export default function InvestmentsPage() {
    const [period, setPeriod] = useState('1M');

    const { data: portfolio, isLoading: loadingPortfolio, isError } = useQuery<InvestmentPortfolio>({
        queryKey: queryKeys.investmentPortfolio,
        queryFn: getInvestmentPortfolio,
    });

    const { data: history, isLoading: loadingHistory } = useQuery<PortfolioHistory>({
        queryKey: queryKeys.portfolioHistory(period),
        queryFn: () => getPortfolioHistory(period),
    });

    const { data: dividendsData } = useQuery({
        queryKey: queryKeys.dividends,
        queryFn: () => getDividends(20),
    });

    const { data: detail } = useQuery<InvestmentPortfolioDetail>({
        queryKey: queryKeys.portfolioDetail,
        queryFn: getPortfolioDetail,
    });

    const { data: positionsData } = useQuery<{ positions: PortfolioPosition[]; currency: string }>({
        queryKey: queryKeys.portfolioPositions,
        queryFn: getPositions,
    });
    const positions = positionsData?.positions ?? [];

    const { data: piesData } = useQuery<{ pies: PieData[]; currency: string }>({
        queryKey: queryKeys.pies,
        queryFn: getPies,
    });
    const pies = piesData?.pies ?? [];

    const dividends: Dividend[] = dividendsData?.dividends || [];
    const loading = loadingPortfolio || loadingHistory;
    const error = isError ? 'Nepodařilo se načíst investice' : null;

    const PIE_ICON_MAP: Record<string, string> = {
        Umbrella: '☂️', Home: '🏠', Savings: '🏦', Vacation: '🌴', Health: '🏥',
        Education: '🎓', Tech: '💻', Energy: '⚡', Finance: '💹', Food: '🍔',
        Car: '🚗', Entertainment: '🎬', Shopping: '🛒', Sports: '🏋️',
        Gift: '🎁', Star: '⭐', Rocket: '🚀', Heart: '❤️', Globe: '🌍',
        Chart: '📊', Diamond: '💎', Crown: '👑', Coins: '🪙',
    };
    const pieIcon = (icon: string) => PIE_ICON_MAP[icon] ?? '🥧';

    // Map ticker -> position for enriching pie instruments
    const positionMap = positions.reduce((acc, pos) => {
        const clean = pos.ticker.replace('_US_EQ', '').replace('_EQ', '');
        acc[clean] = pos;
        return acc;
    }, {} as Record<string, PortfolioPosition>);

    // Positions not belonging to any pie
    const tickersInPies = new Set(pies.flatMap(p => p.instruments.map(i => i.ticker)));
    const orphanPositions = positions.filter(pos => {
        const clean = pos.ticker.replace('_US_EQ', '').replace('_EQ', '');
        return !tickersInPies.has(clean);
    });

    const formatCurrency = (amount: number, currency: string = 'CZK') => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('cs-CZ');
    };

    if (loading) {
        return (
            <MainLayout>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    flexDirection: 'column',
                    gap: 'var(--spacing-md)'
                }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        border: '3px solid var(--glass-border-light)',
                        borderTopColor: 'var(--accent-primary)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <span className="text-secondary">Načítám investice...</span>
                </div>
            </MainLayout>
        );
    }

    if (error) {
        return (
            <MainLayout>
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    <GlassCard>
                        <h2>❌ Chyba</h2>
                        <p className="text-secondary">{error}</p>
                        <Link href="/" className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }}>
                            Zpět na dashboard
                        </Link>
                    </GlassCard>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="page-container">
                {/* Header */}
                <header className="section-header-wrap" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>📈 Investice</h1>
                    </div>
                    {portfolio?.last_synced && (
                        <div className="text-tertiary" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                            Poslední sync: <strong>{formatDate(portfolio.last_synced)}</strong>
                        </div>
                    )}
                </header>

                {/* Summary Card */}
                {portfolio && (
                    <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-lg)' }}>
                            <div>
                                <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Celková hodnota</div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                                    {formatCurrency(portfolio.total_value, portfolio.currency)}
                                </div>
                            </div>
                            {detail && detail.invested > 0 && (
                                <>
                                    <div>
                                        <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Investováno</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 500 }}>
                                            {formatCurrency(detail.invested, detail.currency)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Zisk / Ztráta</div>
                                        <div style={{
                                            fontSize: '1.4rem',
                                            fontWeight: 600,
                                            color: detail.result >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)'
                                        }}>
                                            {detail.result >= 0 ? '+' : ''}{formatCurrency(detail.result, detail.currency)}
                                            {detail.invested > 0 && (
                                                <span style={{ fontSize: '0.85rem', marginLeft: '6px', opacity: 0.8 }}>
                                                    ({detail.result >= 0 ? '+' : ''}{((detail.result / detail.invested) * 100).toFixed(2)} %)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {detail.cash_free > 0 && (
                                        <div>
                                            <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Volná hotovost</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>
                                                {formatCurrency(detail.cash_free, detail.currency)}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </GlassCard>
                )}

                {/* Chart */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ margin: '0 0 var(--spacing-md)' }}>📊 Vývoj hodnoty</h3>

                    {history && history.history.length >= 2 ? (
                        <div style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history.history}>
                                    <defs>
                                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="rgba(255,255,255,0.5)"
                                        fontSize={12}
                                        tickFormatter={(value) => new Date(value).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.5)"
                                        fontSize={12}
                                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                                        width={45}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(30,30,40,0.9)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '8px'
                                        }}
                                        labelFormatter={(value) => new Date(value).toLocaleDateString('cs-CZ')}
                                        formatter={(value) => [formatCurrency(Number(value) || 0, history.currency), 'Hodnota']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#2dd4bf"
                                        strokeWidth={2}
                                        fill="url(#colorValue)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '1.5rem' }}>📈</span>
                            <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                Graf se plní po každém syncu — zatím málo dat ({history?.history.length ?? 0} bod{history?.history.length === 1 ? '' : 'ů'})
                            </span>
                        </div>
                    )}

                    {/* Period buttons below the chart */}
                    <div style={{ display: 'flex', gap: '4px', marginTop: 'var(--spacing-md)' }}>
                        {['1W', '1M', '3M', '6M', '1Y', 'ALL'].map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`btn ${period === p ? 'btn-primary' : ''}`}
                                style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1 }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </GlassCard>

                {/* Positions — merged with Pies */}
                {(pies.length > 0 || positions.length > 0) && (
                    <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Pozice</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>

                            {/* Pies — each as a group with enriched instruments */}
                            {pies.map((pie) => (
                                <div key={pie.id} style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '12px',
                                }}>
                                    {/* Pie header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>{pieIcon(pie.icon)}</span>
                                            <span style={{ fontWeight: 600 }}>{pie.name}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 600 }}>{formatCurrency(pie.value_czk)}</div>
                                            <div style={{ fontSize: '0.8rem', color: pie.result_czk >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                                {pie.result_czk >= 0 ? '+' : ''}{formatCurrency(pie.result_czk)}
                                                <span style={{ opacity: 0.8, marginLeft: '4px' }}>
                                                    ({pie.result_pct >= 0 ? '+' : ''}{pie.result_pct.toFixed(2)} %)
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {pie.instruments.length > 0 && (
                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                            {/* Donut chart */}
                                            <div style={{ flexShrink: 0, width: 120, height: 120 }}>
                                                <PieChart width={120} height={120}>
                                                    <Pie
                                                        data={pie.instruments.map((inst, i) => ({
                                                            name: inst.ticker,
                                                            value: inst.current_share,
                                                            color: `hsl(${(i * 47) % 360}, 70%, 55%)`,
                                                        }))}
                                                        cx={55}
                                                        cy={55}
                                                        innerRadius={36}
                                                        outerRadius={55}
                                                        dataKey="value"
                                                        strokeWidth={0}
                                                    >
                                                        {pie.instruments.map((inst, i) => (
                                                            <Cell key={inst.ticker} fill={`hsl(${(i * 47) % 360}, 70%, 55%)`} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{
                                                            background: 'rgba(30,30,40,0.95)',
                                                            border: '1px solid rgba(255,255,255,0.15)',
                                                            borderRadius: '6px',
                                                            fontSize: '0.78rem',
                                                        }}
                                                        formatter={(value: number | undefined, name: string | undefined) => [`${(value ?? 0).toFixed(1)} %`, name ?? '']}
                                                    />
                                                </PieChart>
                                            </div>

                                            {/* Instruments enriched with position data */}
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', minWidth: 0 }}>
                                                {pie.instruments.map((inst, i) => {
                                                    const pos = positionMap[inst.ticker];
                                                    const hue = (i * 47) % 360;
                                                    return (
                                                        <div key={inst.ticker} style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '1fr auto auto',
                                                            gap: '10px',
                                                            alignItems: 'center',
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: `hsl(${hue}, 70%, 55%)`, flexShrink: 0 }} />
                                                                <div style={{ minWidth: 0 }}>
                                                                    <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{inst.ticker}</div>
                                                                    {pos && (
                                                                        <div className="text-tertiary" style={{ fontSize: '0.73rem' }}>
                                                                            {pos.quantity.toFixed(pos.quantity % 1 === 0 ? 0 : 4)} ks · {pos.current_price_eur.toFixed(2)} €
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{formatCurrency(inst.value_czk)}</div>
                                                                <div className="text-tertiary" style={{ fontSize: '0.73rem' }}>{inst.current_share.toFixed(1)} %</div>
                                                            </div>
                                                            {pos && (
                                                                <div style={{ textAlign: 'right', minWidth: '68px', color: pos.ppl_czk >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                                                                        {pos.ppl_czk >= 0 ? '+' : ''}{formatCurrency(pos.ppl_czk)}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.73rem', opacity: 0.85 }}>
                                                                        {pos.ppl_pct >= 0 ? '+' : ''}{pos.ppl_pct.toFixed(2)} %
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Orphan positions — not part of any pie */}
                            {orphanPositions.map((pos) => (
                                <div key={pos.ticker} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto auto',
                                    gap: '12px',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: 'var(--radius-sm)',
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{pos.ticker.replace('_US_EQ', '').replace('_EQ', '')}</div>
                                        <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                                            {pos.quantity.toFixed(pos.quantity % 1 === 0 ? 0 : 4)} ks · prům. {pos.average_price_eur.toFixed(2)} €
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 500 }}>{formatCurrency(pos.value_czk)}</div>
                                        <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>{pos.current_price_eur.toFixed(2)} €</div>
                                    </div>
                                    <div style={{ textAlign: 'right', minWidth: '80px', color: pos.ppl_czk >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                        <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                                            {pos.ppl_czk >= 0 ? '+' : ''}{formatCurrency(pos.ppl_czk)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                                            {pos.ppl_pct >= 0 ? '+' : ''}{pos.ppl_pct.toFixed(2)} %
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                )}

                {/* Transactions and Dividends */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 'var(--spacing-lg)'
                }}>
                    {/* Transactions — only when data exists */}
                    {portfolio && portfolio.transactions.length > 0 && (
                        <GlassCard>
                            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📋 Poslední transakce</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {portfolio.transactions.slice(0, 10).map((tx) => (
                                        <div
                                            key={tx.id}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '10px 12px',
                                                background: 'rgba(255,255,255,0.05)',
                                                borderRadius: 'var(--radius-sm)'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{tx.description}</div>
                                                <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                                                    {formatDate(tx.date)} • {tx.category}
                                                </div>
                                            </div>
                                            <div style={{
                                                fontWeight: 500,
                                                color: tx.amount >= 0 ? 'var(--accent-success)' : 'var(--text-primary)'
                                            }}>
                                                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                        </GlassCard>
                    )}

                    {/* Dividends — only when data exists */}
                    {dividends.length > 0 && (
                        <GlassCard>
                            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>💰 Dividendy</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {dividends.slice(0, 10).map((div, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            background: 'rgba(255,255,255,0.05)',
                                            borderRadius: 'var(--radius-sm)'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{div.ticker || 'Dividend'}</div>
                                            <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                                                {formatDate(div.date)}
                                            </div>
                                        </div>
                                        <div style={{ color: 'var(--accent-success)', fontWeight: 500 }}>
                                            +{formatCurrency(div.amount, div.currency)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
