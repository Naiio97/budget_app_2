'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import {
    getInvestmentPortfolio,
    getPortfolioHistory,
    getDividends,
    getDashboard,
    InvestmentPortfolio,
    PortfolioHistory,
    Dividend,
    Account
} from '@/lib/api';
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
    const [portfolio, setPortfolio] = useState<InvestmentPortfolio | null>(null);
    const [history, setHistory] = useState<PortfolioHistory | null>(null);
    const [dividends, setDividends] = useState<Dividend[]>([]);
    const [_accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState('1M');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const [portfolioData, historyData, dividendsData, dashboard] = await Promise.all([
                    getInvestmentPortfolio(),
                    getPortfolioHistory(period),
                    getDividends(20),
                    getDashboard()
                ]);
                setPortfolio(portfolioData);
                setHistory(historyData);
                setDividends(dividendsData.dividends);
                setAccounts(dashboard.accounts);
            } catch (err) {
                console.error('Failed to load investments:', err);
                setError('Nepodařilo se načíst investice');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [period]);

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
                        <div className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                            Celková hodnota portfolia
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 600 }}>
                            {formatCurrency(portfolio.total_value, portfolio.currency)}
                        </div>
                    </GlassCard>
                )}

                {/* Chart */}
                {history && history.history.length > 0 && (
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
                    </GlassCard>
                )}

                {/* Transactions and Dividends */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 'var(--spacing-lg)'
                }}>
                    {/* Transactions */}
                    {portfolio && (
                        <GlassCard>
                            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📋 Poslední transakce</h3>
                            {portfolio.transactions.length === 0 ? (
                                <p className="text-secondary">Žádné transakce</p>
                            ) : (
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
                            )}
                        </GlassCard>
                    )}

                    {/* Dividends */}
                    <GlassCard>
                        <h3 style={{ marginBottom: 'var(--spacing-md)' }}>💰 Dividendy</h3>
                        {dividends.length === 0 ? (
                            <p className="text-secondary">Žádné dividendy</p>
                        ) : (
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
                        )}
                    </GlassCard>
                </div>
            </div>
        </MainLayout>
    );
}
