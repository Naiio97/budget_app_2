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
    InvestmentPortfolio,
    InvestmentPortfolioDetail,
    PortfolioHistory,
    PortfolioPosition,
    Dividend
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart
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

    const dividends: Dividend[] = dividendsData?.dividends || [];
    const loading = loadingPortfolio || loadingHistory;
    const error = isError ? 'Nepodařilo se načíst investice' : null;

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
                    <div className="chart-header-wrap">
                        <h3 style={{ margin: 0 }}>📊 Vývoj hodnoty</h3>
                        <div className="period-buttons" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {['1W', '1M', '3M', '6M', '1Y'].map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`btn ${period === p ? 'btn-primary' : ''}`}
                                    style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1, minWidth: '40px' }}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

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
                </GlassCard>

                {/* Positions */}
                {positions.length > 0 && (
                    <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Pozice</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {positions.map((pos) => (
                                <div
                                    key={pos.ticker}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr auto auto',
                                        gap: '12px',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: 'var(--radius-sm)',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{pos.ticker.replace('_US_EQ', '').replace('_EQ', '')}</div>
                                        <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                                            {pos.quantity % 1 === 0 ? pos.quantity : pos.quantity.toFixed(4)} ks · prům. {pos.average_price_eur.toFixed(2)} €
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 500 }}>{formatCurrency(pos.value_czk)}</div>
                                        <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                                            {pos.current_price_eur.toFixed(2)} €
                                        </div>
                                    </div>
                                    <div style={{
                                        textAlign: 'right',
                                        color: pos.ppl_czk >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)',
                                        minWidth: '80px',
                                    }}>
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
