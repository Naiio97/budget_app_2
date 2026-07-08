'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import PageLoader from '@/components/PageLoader';
import {
    getInvestmentPortfolio,
    getPortfolioDetail,
    getPositions,
    getPies,
    getDividends,
    getPortfolioHistory,
    InvestmentPortfolio,
    InvestmentPortfolioDetail,
    PortfolioPosition,
    Pie as PieData,
    Dividend,
    PortfolioHistory,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { POSITION_COLOR_PALETTE, PositionScope, getPositionColor, setPositionColor } from '@/lib/positionColors';

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];
const FALLBACK_PALETTE = ['#34c759', '#007aff', '#ff9f0a', '#5e5ce6', '#ff3b30', '#30b0c7', '#af52de', '#64d2ff'];

function cleanTicker(ticker: string) {
    return ticker.replace('_US_EQ', '').replace('_EQ', '');
}

function formatCurrency(amount: number, currency = 'CZK') {
    return new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency,
        minimumFractionDigits: currency === 'CZK' ? 0 : 2,
        maximumFractionDigits: currency === 'CZK' ? 0 : 2,
    }).format(amount);
}

function formatShortMoney(value: number) {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
    return `${Math.round(value)}`;
}

function formatPct(value: number) {
    return `${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)} %`;
}

function czPlural(n: number, one: string, few: string, many: string) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

function formatDate(dateStr: string) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('cs-CZ');
}

function formatAxisDate(value: string) {
    return new Date(value).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

export default function Trading212DetailPage() {
    const router = useRouter();
    const [period, setPeriod] = useState('1M');

    const { data: portfolio, isLoading: loadingPortfolio } = useQuery<InvestmentPortfolio>({
        queryKey: queryKeys.investmentPortfolio,
        queryFn: getInvestmentPortfolio,
    });

    const { data: detail } = useQuery<InvestmentPortfolioDetail>({
        queryKey: queryKeys.portfolioDetail,
        queryFn: getPortfolioDetail,
    });

    const { data: positionsData } = useQuery<{ positions: PortfolioPosition[]; currency: string }>({
        queryKey: queryKeys.portfolioPositions,
        queryFn: getPositions,
    });

    const { data: piesData } = useQuery<{ pies: PieData[]; currency: string }>({
        queryKey: queryKeys.pies,
        queryFn: getPies,
    });

    const { data: dividendsData } = useQuery({
        queryKey: queryKeys.dividends,
        queryFn: () => getDividends(20),
    });

    const { data: history } = useQuery<PortfolioHistory>({
        queryKey: queryKeys.portfolioHistory(period),
        queryFn: () => getPortfolioHistory(period),
    });

    const positions = useMemo(() => positionsData?.positions ?? [], [positionsData]);
    const pies = useMemo(() => piesData?.pies ?? [], [piesData]);
    const dividends: Dividend[] = dividendsData?.dividends ?? [];
    const tickersInPies = useMemo(() => new Set(pies.flatMap(p => p.instruments.map(i => i.ticker))), [pies]);
    const orphanPositions = useMemo(() => positions.filter(p => !tickersInPies.has(cleanTicker(p.ticker))), [positions, tickersInPies]);

    // Per-position / per-pie color overrides (localStorage)
    const [colorVersion, setColorVersion] = useState(0);
    const [pickerKey, setPickerKey] = useState<string | null>(null);

    const colors = useMemo(() => {
        void colorVersion;
        const next: Record<string, string> = {};
        for (const pos of positions) {
            const t = cleanTicker(pos.ticker);
            const c = getPositionColor('t212', t);
            if (c) next[`t212:${t}`] = c;
        }
        for (const pie of pies) {
            const c = getPositionColor('pie', pie.id);
            if (c) next[`pie:${pie.id}`] = c;
        }
        return next;
    }, [positions, pies, colorVersion]);

    useEffect(() => {
        if (pickerKey == null) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerKey(null); };
        const onClick = () => setPickerKey(null);
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', onClick);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onClick);
        };
    }, [pickerKey]);

    const writeColor = (scope: PositionScope, id: string | number, color: string | null) => {
        setPositionColor(scope, id, color);
        setColorVersion(v => v + 1);
    };

    const colorFor = (scope: PositionScope, id: string | number, fallbackIdx: number) =>
        colors[`${scope}:${id}`] ?? FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length];

    if (loadingPortfolio) {
        return (
            <MainLayout>
                <PageLoader />
            </MainLayout>
        );
    }

    if (!portfolio) {
        return (
            <MainLayout>
                <div className="page-container">
                    <div className="surface" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                        <p>Trading 212 účet není připojený.</p>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const total = portfolio.total_value;
    const invested = detail?.invested ?? 0;
    const result = detail?.result ?? 0;
    const resultPct = invested > 0 ? (result / invested) * 100 : 0;
    const cashFree = detail?.cash_free ?? 0;

    // Allocation rows: pies first, then orphan positions — carry result info
    // so the legend can replace the former standalone "Koláče" section
    const allocationRows = [
        ...pies.map((pie, i) => ({
            key: `pie:${pie.id}`,
            scope: 'pie' as PositionScope,
            id: pie.id as string | number,
            name: pie.name,
            sub: `${pie.instruments.length} ${czPlural(pie.instruments.length, 'pozice', 'pozice', 'pozic')}`,
            value: pie.value_czk,
            result: pie.result_czk,
            resultPct: pie.result_pct,
            color: colorFor('pie', pie.id, i),
            fallbackIdx: i,
        })),
        ...orphanPositions.map((pos, i) => ({
            key: `t212:${cleanTicker(pos.ticker)}`,
            scope: 't212' as PositionScope,
            id: cleanTicker(pos.ticker) as string | number,
            name: cleanTicker(pos.ticker),
            sub: 'mimo koláč',
            value: pos.value_czk,
            result: pos.ppl_czk,
            resultPct: pos.ppl_pct,
            color: colorFor('t212', cleanTicker(pos.ticker), pies.length + i),
            fallbackIdx: pies.length + i,
        })),
    ].filter(r => r.value > 0).sort((a, b) => b.value - a.value);

    const renderSwatch = (scope: PositionScope, id: string | number, currentColor: string) => {
        const k = `${scope}:${id}`;
        const open = pickerKey === k;
        return (
            <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPickerKey(open ? null : k); }}
                    title="Změnit barvu"
                    aria-label="Změnit barvu"
                    style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: currentColor,
                        border: '1.5px solid var(--surface)',
                        boxShadow: '0 0 0 1px var(--border)',
                        cursor: 'pointer',
                        padding: 0,
                    }}
                />
                {open && (
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                            zIndex: 10,
                            background: 'var(--surface-strong)',
                            border: '0.5px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            padding: 10,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                            minWidth: 200,
                        }}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                            {POSITION_COLOR_PALETTE.map(c => {
                                const isActive = colors[k] === c.value;
                                return (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => { writeColor(scope, id, c.value); setPickerKey(null); }}
                                        title={c.name}
                                        aria-label={c.name}
                                        style={{
                                            width: 24, height: 24, borderRadius: '50%',
                                            background: c.value,
                                            border: isActive ? '2px solid var(--text)' : '2px solid transparent',
                                            cursor: 'pointer',
                                            padding: 0,
                                        }}
                                    />
                                );
                            })}
                        </div>
                        {colors[k] && (
                            <button
                                type="button"
                                onClick={() => { writeColor(scope, id, null); setPickerKey(null); }}
                                style={{
                                    marginTop: 8, width: '100%', padding: '4px 8px',
                                    fontSize: '0.75rem', background: 'transparent',
                                    border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-2)', cursor: 'pointer',
                                }}
                            >
                                Resetovat na výchozí
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <MainLayout>
            <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                {/* Page head */}
                <div className="account-detail-head">
                    <div className="account-title-block">
                        <h1>Trading 212</h1>
                        <div className="account-detail-sub">
                            Investiční účet · automaticky synchronizováno
                            {portfolio.last_synced && <> · {formatDate(portfolio.last_synced)}</>}
                        </div>
                    </div>
                    <button onClick={() => router.back()} className="btn account-back-btn">← Zpět</button>
                </div>

                {/* Hero */}
                <section className="surface" style={{ padding: '24px 28px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div style={{ minWidth: 0 }}>
                            <div className="kpi-label">Celková hodnota</div>
                            <div className="num account-balance-value" style={{ marginTop: 6 }}>
                                {formatCurrency(total)}
                            </div>
                        </div>
                        <div className="account-hero-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 18, flex: '1 1 360px', maxWidth: 540 }}>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Investováno</div>
                                <div className="num" style={{ fontSize: 18, fontWeight: 620 }}>{formatCurrency(invested)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Výsledek</div>
                                <div className="num" style={{ fontSize: 18, fontWeight: 620, color: result >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                    {result >= 0 ? '+' : ''}{formatCurrency(result)}
                                    <span className="account-kpi-pct" style={{ fontSize: 12, fontWeight: 500, marginLeft: 4, opacity: 0.8, whiteSpace: 'nowrap' }}>
                                        ({resultPct >= 0 ? '+' : ''}{formatPct(resultPct)})
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Volná hotovost</div>
                                <div className="num" style={{ fontSize: 18, fontWeight: 620 }}>{formatCurrency(cashFree)}</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* History chart */}
                <section className="surface">
                    <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>Vývoj hodnoty</h3>
                        <div className="seg">
                            {PERIODS.map(p => (
                                <div
                                    key={p}
                                    className={`seg-item ${period === p ? 'active' : ''}`}
                                    onClick={() => setPeriod(p)}
                                >
                                    {p}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="card-body">
                        {history && history.history.length >= 2 ? (
                            <div style={{ height: 240 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history.history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="t212ValueFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="var(--pos)" stopOpacity={0.24} />
                                                <stop offset="95%" stopColor="var(--pos)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={formatShortMoney} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={54} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--surface-strong)', border: '0.5px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}
                                            formatter={(v: number | undefined) => [formatCurrency(Number(v ?? 0)), 'Hodnota']}
                                            labelFormatter={(l: string) => formatDate(l)}
                                        />
                                        <Area type="monotone" dataKey="value" stroke="var(--text)" strokeWidth={2.5} fill="url(#t212ValueFill)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', placeItems: 'center', minHeight: 200, color: 'var(--text-3)', fontSize: 13 }}>
                                Pro graf zatím není dost dat.
                            </div>
                        )}
                    </div>
                </section>

                {/* Allocation (incl. pie results) + positions, side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--spacing-lg)', alignItems: 'stretch' }}>
                    <section className="surface">
                        <div className="card-head">
                            <h3>Rozložení</h3>
                            <span className="muted" style={{ fontSize: 12 }}>
                                {allocationRows.length} {czPlural(allocationRows.length, 'skupina', 'skupiny', 'skupin')}
                            </span>
                        </div>
                        <div className="card-body">
                            {allocationRows.length === 0 ? (
                                <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 'var(--spacing-lg)' }}>Žádné pozice.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                    <div style={{ height: 180, position: 'relative' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={allocationRows} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" strokeWidth={2} stroke="var(--surface)">
                                                    {allocationRows.map(r => <Cell key={r.key} fill={r.color} />)}
                                                </Pie>
                                                <Tooltip formatter={(v: number | undefined, name) => [formatCurrency(Number(v ?? 0)), name as string]} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div style={{
                                            position: 'absolute', top: '50%', left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            textAlign: 'center', pointerEvents: 'none',
                                        }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Celkem</div>
                                            <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>{formatCurrency(total)}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {allocationRows.map((row, i) => {
                                            const pct = total > 0 ? (row.value / total) * 100 : 0;
                                            return (
                                                <div key={row.key} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '10px 0',
                                                    borderTop: i === 0 ? 'none' : '0.5px solid var(--border)',
                                                }}>
                                                    {renderSwatch(row.scope, row.id, row.color)}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{row.name}</div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.sub} · {formatPct(pct)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>{formatCurrency(row.value)}</div>
                                                        <div className="num" style={{ fontSize: 12, color: row.result >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                                            {row.result >= 0 ? '+' : ''}{formatCurrency(row.result)} ({row.resultPct >= 0 ? '+' : ''}{formatPct(row.resultPct)})
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="surface">
                        <div className="card-head">
                            <h3>Pozice</h3>
                            <span className="muted" style={{ fontSize: 12 }}>
                                {positions.length} {czPlural(positions.length, 'pozice', 'pozice', 'pozic')}
                            </span>
                        </div>
                        <div className="card-body-nopad">
                            {positions.length === 0 ? (
                                <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Žádné pozice.</div>
                            ) : (
                                <div>
                                    {[...positions].sort((a, b) => b.value_czk - a.value_czk).map((pos, i) => {
                                        const ticker = cleanTicker(pos.ticker);
                                        const color = colorFor('t212', ticker, i);
                                        return (
                                            <div key={pos.ticker} style={{
                                                display: 'grid',
                                                gridTemplateColumns: '36px minmax(0, 1fr) auto auto',
                                                gap: 12, alignItems: 'center',
                                                padding: '10px var(--spacing-lg)',
                                                borderTop: i === 0 ? 'none' : '0.5px solid var(--border)',
                                            }}>
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: 8,
                                                    background: color + '22',
                                                    color,
                                                    display: 'grid', placeItems: 'center',
                                                    fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                                                }}>{ticker.slice(0, 3).toUpperCase()}</div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ticker}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                                        {pos.quantity.toFixed(pos.quantity < 1 ? 4 : 2)} ks · prům. {formatCurrency(pos.average_price_eur, 'EUR')}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div className="num" style={{ fontWeight: 600, fontSize: 14 }}>{formatCurrency(pos.value_czk)}</div>
                                                    <div className="num" style={{
                                                        fontSize: 12,
                                                        color: pos.ppl_czk >= 0 ? 'var(--pos)' : 'var(--neg)',
                                                    }}>
                                                        {pos.ppl_czk >= 0 ? '+' : ''}{formatCurrency(pos.ppl_czk)} ({pos.ppl_pct >= 0 ? '+' : ''}{formatPct(pos.ppl_pct)})
                                                    </div>
                                                </div>
                                                {renderSwatch('t212', ticker, color)}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Recent transactions + dividends */}
                {(portfolio.transactions.length > 0 || dividends.length > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        {portfolio.transactions.length > 0 && (
                            <section className="surface">
                                <div className="card-head"><h3>Poslední transakce</h3></div>
                                <div className="card-body-nopad">
                                    {portfolio.transactions.slice(0, 8).map(tx => (
                                        <div key={tx.id} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '10px var(--spacing-lg)',
                                            borderTop: '0.5px solid var(--border)',
                                        }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDate(tx.date)} · {tx.category}</div>
                                            </div>
                                            <div className="num" style={{ fontWeight: 600, fontSize: 14, color: tx.amount >= 0 ? 'var(--pos)' : 'var(--text)' }}>
                                                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {dividends.length > 0 && (
                            <section className="surface">
                                <div className="card-head"><h3>Dividendy</h3></div>
                                <div className="card-body-nopad">
                                    {dividends.slice(0, 8).map((d, i) => (
                                        <div key={`${d.ticker}-${d.date}-${i}`} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '10px var(--spacing-lg)',
                                            borderTop: '0.5px solid var(--border)',
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: 14 }}>{d.ticker || 'Dividenda'}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDate(d.date)}</div>
                                            </div>
                                            <div className="num" style={{ fontWeight: 600, fontSize: 14, color: 'var(--pos)' }}>
                                                +{formatCurrency(d.amount, d.currency)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
