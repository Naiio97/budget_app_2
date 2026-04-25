'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
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
    getManualInvestments,
    getManualInvestmentHistory,
    createManualInvestment,
    InvestmentPortfolio,
    InvestmentPortfolioDetail,
    PortfolioHistory,
    PortfolioPosition,
    Dividend,
    Pie as PieData,
    ManualInvestmentAccount,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
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
    const [showNewAccountForm, setShowNewAccountForm] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');
    const [newAccountCurrency, setNewAccountCurrency] = useState('CZK');
    const [projStartOverride, setProjStartOverride] = useState('');
    const [projMonthly, setProjMonthly] = useState(5000);
    const [projRate, setProjRate] = useState(7);
    const [projYears, setProjYears] = useState(20);
    const qc = useQueryClient();

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

    const { data: manualInvestments = [] } = useQuery<ManualInvestmentAccount[]>({
        queryKey: queryKeys.manualInvestments,
        queryFn: getManualInvestments,
    });

    const manualHistoryResults = useQueries({
        queries: manualInvestments.map(acc => ({
            queryKey: queryKeys.manualInvestmentHistory(acc.id),
            queryFn: () => getManualInvestmentHistory(acc.id),
        })),
    });

    const combinedChartData = useMemo(() => {
        const allDates = new Set<string>();
        history?.history.forEach(p => allDates.add(p.date));
        manualHistoryResults.forEach(r => r.data?.forEach(p => allDates.add(p.date)));
        if (allDates.size === 0) return [];

        const sortedDates = Array.from(allDates).sort();
        const t212Map = new Map(history?.history.map(p => [p.date, p.value]) ?? []);
        const manualMaps = manualHistoryResults.map(r => new Map(r.data?.map(p => [p.date, p.value]) ?? []));

        let lastT212 = 0;
        const lastManual = manualMaps.map(() => 0);

        return sortedDates.map(date => {
            if (t212Map.has(date)) lastT212 = t212Map.get(date)!;
            manualMaps.forEach((m, i) => { if (m.has(date)) lastManual[i] = m.get(date)!; });
            return { date, value: lastT212 + lastManual.reduce((s, v) => s + v, 0) };
        });
    }, [history, manualHistoryResults]);

    const createAccountMutation = useMutation({
        mutationFn: () => createManualInvestment({ name: newAccountName.trim(), currency: newAccountCurrency }),
        onSuccess: (newAcc) => {
            qc.setQueryData<ManualInvestmentAccount[]>(queryKeys.manualInvestments, (old = []) => [...old, newAcc]);
            qc.invalidateQueries({ queryKey: queryKeys.dashboard });
            setShowNewAccountForm(false);
            setNewAccountName('');
        },
    });

    const dividends: Dividend[] = dividendsData?.dividends || [];
    const loading = loadingPortfolio || loadingHistory;
    const error = isError ? 'Nepodařilo se načíst investice' : null;

    const manualTotal = manualInvestments.reduce((s, a) => s + a.total_value, 0);
    const combinedTotal = (portfolio?.total_value ?? 0) + manualTotal;

    const projectionData = useMemo(() => {
        const start = projStartOverride !== '' ? (parseFloat(projStartOverride) || 0) : combinedTotal;
        const monthlyRate = projRate / 100 / 12;
        const points = [];
        let value = start;
        let invested = start;
        for (let y = 0; y <= projYears; y++) {
            points.push({ year: y, invested: Math.round(invested), gains: Math.round(Math.max(0, value - invested)) });
            for (let m = 0; m < 12; m++) {
                value = value * (1 + monthlyRate) + projMonthly;
                invested += projMonthly;
            }
        }
        return points;
    }, [combinedTotal, projStartOverride, projMonthly, projRate, projYears]);

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
                        <h2>{Icons.status.error} Chyba</h2>
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
                        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{Icons.nav.investments} Investice</h1>
                    </div>
                    {portfolio?.last_synced && (
                        <div className="text-tertiary" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                            Poslední sync: <strong>{formatDate(portfolio.last_synced)}</strong>
                        </div>
                    )}
                </header>

                {/* Summary Card */}
                {(portfolio || manualInvestments.length > 0) && (
                    <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-lg)' }}>
                            <div>
                                <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>
                                    {manualInvestments.length > 0 && portfolio ? 'Celkem (T212 + manuální)' : 'Celková hodnota'}
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>
                                    {formatCurrency(combinedTotal, 'CZK')}
                                </div>
                                {manualInvestments.length > 0 && portfolio && (
                                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                        T212: {formatCurrency(portfolio.total_value, 'CZK')} · Manuální: {formatCurrency(manualTotal, 'CZK')}
                                    </div>
                                )}
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
                    <h3 style={{ margin: '0 0 var(--spacing-md)' }}>{Icons.section.valueGrowth} Vývoj hodnoty</h3>

                    {combinedChartData.length >= 2 ? (
                        <div style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={combinedChartData}>
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
                                        formatter={(value) => [formatCurrency(Number(value) || 0, 'CZK'), 'Hodnota']}
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
                                Graf se plní postupně — zatím málo dat ({combinedChartData.length} bod{combinedChartData.length === 1 ? '' : 'ů'})
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

                {/* Positions — merged with Pies + manual investments */}
                {(pies.length > 0 || positions.length > 0 || manualInvestments.some(a => a.positions.length > 0)) && (
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
                                    {pie.instruments.length > 0 && (
                                        <div className="pie-layout">
                                            {/* Donut chart */}
                                            <div className="pie-donut-wrap">
                                                <PieChart width={160} height={160}>
                                                    <Pie
                                                        data={pie.instruments.map((inst) => ({
                                                            name: inst.ticker,
                                                            value: inst.current_share,
                                                        }))}
                                                        cx={75}
                                                        cy={75}
                                                        innerRadius={50}
                                                        outerRadius={72}
                                                        dataKey="value"
                                                        strokeWidth={0}
                                                    >
                                                        {pie.instruments.map((inst, i) => (
                                                            <Cell key={inst.ticker} fill={`hsl(${(i * 47) % 360}, 70%, 55%)`} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{
                                                            background: '#1e293b',
                                                            border: '1px solid #334155',
                                                            borderRadius: '8px',
                                                            fontSize: '0.78rem',
                                                            color: '#ffffff',
                                                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8), 0 8px 10px -6px rgba(0,0,0,0.8)',
                                                        }}
                                                        labelStyle={{ color: '#ffffff', fontWeight: 600 }}
                                                        itemStyle={{ color: '#ffffff' }}
                                                        formatter={(value: number | undefined, name: string | undefined) => [`${(value ?? 0).toFixed(1)} %`, name ?? '']}
                                                    />
                                                </PieChart>
                                            </div>

                                            {/* Right: pie name + value + instruments */}
                                            <div className="pie-right">
                                                {/* Pie header */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '1.1rem' }}>{pieIcon(pie.icon)}</span>
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
                                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />

                                            {/* Instruments enriched with position data */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                                                {pie.instruments.map((inst, i) => {
                                                    const pos = positionMap[inst.ticker];
                                                    const hue = (i * 47) % 360;
                                                    return (
                                                        <div key={inst.ticker} className="pie-inst-grid">
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
                                                                <div className="pie-inst-ppl" style={{ color: pos.ppl_czk >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
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

                            {/* Manual investment positions — grouped by account */}
                            {manualInvestments.filter(a => a.positions.length > 0).map(acc => (
                                <div key={acc.id}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 4px', borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: '4px' }}>
                                        <Link href={`/investments/manual/${acc.id}`} style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                                            {acc.name}
                                        </Link>
                                        <span className="text-secondary" style={{ fontSize: '0.8rem' }}>{formatCurrency(acc.total_value, acc.currency)}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {acc.positions.map(pos => (
                                            <div key={pos.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)' }}>
                                                <div>
                                                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{pos.name}</div>
                                                    {pos.quantity != null && (
                                                        <div className="text-tertiary" style={{ fontSize: '0.73rem' }}>
                                                            {pos.quantity} ks{pos.avg_buy_price != null ? ` · nákup ${formatCurrency(pos.avg_buy_price, pos.currency)}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{formatCurrency(pos.current_value, pos.currency)}</div>
                                                    {acc.total_value > 0 && <div className="text-tertiary" style={{ fontSize: '0.73rem' }}>{((pos.current_value / acc.total_value) * 100).toFixed(1)} %</div>}
                                                </div>
                                                {pos.pnl != null && (
                                                    <div style={{ textAlign: 'right', minWidth: '80px', color: pos.pnl >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{pos.pnl >= 0 ? '+' : ''}{formatCurrency(pos.pnl, pos.currency)}</div>
                                                        <div style={{ fontSize: '0.73rem', opacity: 0.85 }}>{pos.pnl_pct != null ? `${pos.pnl_pct >= 0 ? '+' : ''}${pos.pnl_pct.toFixed(2)} %` : ''}</div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
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
                            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>{Icons.section.lastTransactions} Poslední transakce</h3>
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
                            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>{Icons.section.dividends} Dividendy</h3>
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

                {/* Compound interest projection */}
                <GlassCard style={{ marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ margin: '0 0 var(--spacing-lg)' }}>Projekce složeného úročení</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Počáteční hodnota (Kč)</label>
                            <input
                                className="input"
                                type="number"
                                value={projStartOverride !== '' ? projStartOverride : String(Math.round(combinedTotal))}
                                onChange={e => setProjStartOverride(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                                Měsíční příspěvek: <strong>{projMonthly.toLocaleString('cs-CZ')} Kč</strong>
                            </label>
                            <input type="range" min="0" max="50000" step="500" value={projMonthly} onChange={e => setProjMonthly(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                <span>0</span><span>50 000 Kč</span>
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                                Roční výnos: <strong>{projRate} %</strong>
                            </label>
                            <input type="range" min="1" max="20" step="0.5" value={projRate} onChange={e => setProjRate(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                <span>1 %</span><span>20 %</span>
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                                Horizont: <strong>{projYears} let</strong>
                            </label>
                            <input type="range" min="1" max="40" step="1" value={projYears} onChange={e => setProjYears(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                <span>1 rok</span><span>40 let</span>
                            </div>
                        </div>
                    </div>

                    <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={projectionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="projInvestGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.45} />
                                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="projGainsGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.55} />
                                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.1} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis
                                dataKey="year"
                                tickFormatter={(y: number) => y === 0 ? 'Dnes' : `+${y}r`}
                                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                axisLine={false} tickLine={false}
                            />
                            <YAxis
                                tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}k`}
                                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                axisLine={false} tickLine={false} width={55}
                            />
                            <Tooltip
                                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.78rem', color: '#fff' }}
                                formatter={(v: number | undefined, name: string | undefined) => [formatCurrency(v ?? 0, 'CZK'), name === 'invested' ? 'Investováno' : 'Výnos ze složeného úročení']}
                                labelFormatter={(y: number) => y === 0 ? 'Dnes' : `Za ${y} let`}
                            />
                            <Area type="monotone" dataKey="invested" stackId="1" stroke="#2dd4bf" strokeWidth={1.5} fill="url(#projInvestGrad)" name="invested" />
                            <Area type="monotone" dataKey="gains" stackId="1" stroke="#818cf8" strokeWidth={1.5} fill="url(#projGainsGrad)" name="gains" />
                        </AreaChart>
                    </ResponsiveContainer>

                    {(() => {
                        const last = projectionData[projectionData.length - 1];
                        if (!last) return null;
                        const totalValue = last.invested + last.gains;
                        const gainPct = last.invested > 0 ? (last.gains / last.invested) * 100 : 0;
                        return (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                <div>
                                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Hodnota za {projYears} let</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{formatCurrency(totalValue, 'CZK')}</div>
                                </div>
                                <div>
                                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Celkem vloženo</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{formatCurrency(last.invested, 'CZK')}</div>
                                </div>
                                <div>
                                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Výnos ze složeného úročení</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent-success)' }}>
                                        +{formatCurrency(last.gains, 'CZK')}
                                        <span style={{ fontSize: '0.8rem', opacity: 0.8, fontWeight: 400, marginLeft: '6px' }}>({gainPct.toFixed(0)} %)</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </GlassCard>

                {/* Manual accounts — navigation + create */}
                <GlassCard style={{ marginTop: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showNewAccountForm || manualInvestments.length > 0 ? 'var(--spacing-md)' : 0 }}>
                        <h3 style={{ margin: 0 }}>{Icons.accountType.investment} Manuální účty</h3>
                        <button className="btn btn-primary" onClick={() => setShowNewAccountForm(v => !v)} style={{ fontSize: '0.85rem' }}>
                            {showNewAccountForm ? 'Zrušit' : '+ Nový účet'}
                        </button>
                    </div>

                    {showNewAccountForm && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Název</label>
                                <input className="input" autoFocus value={newAccountName} onChange={e => setNewAccountName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newAccountName.trim()) createAccountMutation.mutate(); }} placeholder="Degiro, Fond XY…" style={{ width: '100%' }} />
                            </div>
                            <div style={{ flex: '0 1 100px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Měna</label>
                                <input className="input" value={newAccountCurrency} onChange={e => setNewAccountCurrency(e.target.value)} placeholder="CZK" style={{ width: '100%' }} />
                            </div>
                            <button className="btn btn-primary" disabled={!newAccountName.trim() || createAccountMutation.isPending} onClick={() => createAccountMutation.mutate()} style={{ fontSize: '0.85rem' }}>
                                {createAccountMutation.isPending ? 'Vytvářím…' : 'Vytvořit'}
                            </button>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {manualInvestments.map(acc => (
                            <Link key={acc.id} href={`/investments/manual/${acc.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                >
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{acc.name}</span>
                                    <span className="text-secondary" style={{ fontSize: '0.8rem' }}>{formatCurrency(acc.total_value, acc.currency)}</span>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>→</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </GlassCard>
            </div>
        </MainLayout>
    );
}
