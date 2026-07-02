'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPositionColor } from '@/lib/positionColors';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
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

type ChartPoint = { date: string; value: number };
type ProjectionPoint = { year: number; invested: number; gains: number };
type HoldingRow = {
    id: string;
    name: string;
    source: string;
    value: number;
    pnl: number | null;
    pnlPct: number | null;
    share: number;
};

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

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
    const positions = useMemo(() => positionsData?.positions ?? [], [positionsData?.positions]);

    const { data: piesData } = useQuery<{ pies: PieData[]; currency: string }>({
        queryKey: queryKeys.pies,
        queryFn: getPies,
    });
    const pies = useMemo(() => piesData?.pies ?? [], [piesData?.pies]);

    const { data: manualInvestments = [] } = useQuery<ManualInvestmentAccount[]>({
        queryKey: queryKeys.manualInvestments,
        queryFn: getManualInvestments,
    });

    const manualHistoryResults = useQueries({
        queries: manualInvestments.map((acc) => ({
            queryKey: queryKeys.manualInvestmentHistory(acc.id),
            queryFn: () => getManualInvestmentHistory(acc.id),
        })),
    });

    const manualTotal = manualInvestments.reduce((sum, account) => sum + account.total_value, 0);
    const manualInvested = manualInvestments.reduce((sum, account) => sum + account.invested, 0);
    const manualPnl = manualInvestments.reduce((sum, account) => sum + account.pnl, 0);
    const combinedTotal = (portfolio?.total_value ?? 0) + manualTotal;
    const investedTotal = (detail?.invested ?? 0) + manualInvested;
    const resultTotal = (detail?.result ?? 0) + manualPnl;
    const resultPct = investedTotal > 0 ? (resultTotal / investedTotal) * 100 : 0;
    const accountCount = (portfolio ? 1 : 0) + manualInvestments.length;

    const combinedChartData = useMemo<ChartPoint[]>(() => {
        const allDates = new Set<string>();
        history?.history.forEach((point) => allDates.add(point.date));
        manualHistoryResults.forEach((result) => result.data?.forEach((point) => allDates.add(point.date)));
        if (allDates.size === 0) return [];

        const sortedDates = Array.from(allDates).sort();
        const t212Map = new Map(history?.history.map((point) => [point.date, point.value]) ?? []);
        const manualMaps = manualHistoryResults.map((result) => new Map(result.data?.map((point) => [point.date, point.value]) ?? []));
        let lastT212 = 0;
        const lastManual = manualMaps.map(() => 0);

        return sortedDates.map((date) => {
            if (t212Map.has(date)) lastT212 = t212Map.get(date)!;
            manualMaps.forEach((map, index) => {
                if (map.has(date)) lastManual[index] = map.get(date)!;
            });
            return { date, value: lastT212 + lastManual.reduce((sum, value) => sum + value, 0) };
        });
    }, [history, manualHistoryResults]);

    const valueDelta = useMemo(() => {
        if (combinedChartData.length < 2) return 0;
        return combinedChartData[combinedChartData.length - 1].value - combinedChartData[0].value;
    }, [combinedChartData]);

    const positionMap = useMemo(() => {
        return positions.reduce<Record<string, PortfolioPosition>>((acc, position) => {
            const ticker = cleanTicker(position.ticker);
            acc[ticker] = position;
            return acc;
        }, {});
    }, [positions]);

    const tickersInPies = useMemo(() => new Set(pies.flatMap((pie) => pie.instruments.map((instrument) => instrument.ticker))), [pies]);
    const orphanPositions = useMemo(() => positions.filter((position) => !tickersInPies.has(cleanTicker(position.ticker))), [positions, tickersInPies]);

    // Force re-evaluation when localStorage changes (e.g. user picks a color on detail page)
    const [colorVersion, setColorVersion] = useState(0);
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key && e.key.startsWith('inv-color-')) setColorVersion(v => v + 1);
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const allocationRows = useMemo(() => {
        void colorVersion;
        const rows = [
            ...pies.map((pie) => ({
                id: `pie-${pie.id}`,
                name: pie.name,
                value: pie.value_czk,
                pnl: pie.result_czk,
                pnlPct: pie.result_pct,
                color: getPositionColor('pie', pie.id) ?? allocationColor(pie.id),
            })),
            ...orphanPositions.map((position, index) => {
                const ticker = cleanTicker(position.ticker);
                return {
                    id: `pos-${position.ticker}`,
                    name: ticker,
                    value: position.value_czk,
                    pnl: position.ppl_czk,
                    pnlPct: position.ppl_pct,
                    color: getPositionColor('t212', ticker) ?? allocationColor(pies.length + index + 1),
                };
            }),
            ...manualInvestments.map((account, index) => ({
                id: `manual-${account.id}`,
                name: account.name,
                value: account.total_value,
                pnl: account.pnl,
                pnlPct: account.pnl_pct,
                color: allocationColor(pies.length + orphanPositions.length + index + 1),
            })),
        ].filter((row) => row.value > 0);

        return rows.sort((a, b) => b.value - a.value).slice(0, 8);
        // colorVersion is intentional dep — it triggers re-read from localStorage
    }, [manualInvestments, orphanPositions, pies, colorVersion]);

    const holdingRows = useMemo<HoldingRow[]>(() => {
        const pieHoldings = pies.flatMap((pie) => pie.instruments.map((instrument) => {
            const position = positionMap[instrument.ticker];
            return {
                id: `pie-${pie.id}-${instrument.ticker}`,
                name: instrument.ticker,
                source: pie.name,
                value: instrument.value_czk,
                pnl: position?.ppl_czk ?? instrument.result_czk ?? null,
                pnlPct: position?.ppl_pct ?? null,
                share: combinedTotal > 0 ? (instrument.value_czk / combinedTotal) * 100 : 0,
            };
        }));

        const orphanHoldings = orphanPositions.map((position) => ({
            id: `orphan-${position.ticker}`,
            name: cleanTicker(position.ticker),
            source: 'Trading 212',
            value: position.value_czk,
            pnl: position.ppl_czk,
            pnlPct: position.ppl_pct,
            share: combinedTotal > 0 ? (position.value_czk / combinedTotal) * 100 : 0,
        }));

        const manualHoldings = manualInvestments.flatMap((account) => account.positions.map((position) => ({
            id: `manual-${account.id}-${position.id}`,
            name: position.name,
            source: account.name,
            value: position.current_value,
            pnl: position.pnl,
            pnlPct: position.pnl_pct,
            share: combinedTotal > 0 ? (position.current_value / combinedTotal) * 100 : 0,
        })));

        return [...pieHoldings, ...orphanHoldings, ...manualHoldings].sort((a, b) => b.value - a.value).slice(0, 12);
    }, [combinedTotal, manualInvestments, orphanPositions, pies, positionMap]);

    const projectionData = useMemo<ProjectionPoint[]>(() => {
        const start = projStartOverride !== '' ? (parseFloat(projStartOverride) || 0) : combinedTotal;
        const monthlyRate = projRate / 100 / 12;
        const points: ProjectionPoint[] = [];
        let value = start;
        let invested = start;
        for (let year = 0; year <= projYears; year++) {
            points.push({ year, invested: Math.round(invested), gains: Math.round(Math.max(0, value - invested)) });
            for (let month = 0; month < 12; month++) {
                value = value * (1 + monthlyRate) + projMonthly;
                invested += projMonthly;
            }
        }
        return points;
    }, [combinedTotal, projStartOverride, projMonthly, projRate, projYears]);

    const createAccountMutation = useMutation({
        mutationFn: () => createManualInvestment({ name: newAccountName.trim(), currency: newAccountCurrency }),
        onSuccess: (newAccount) => {
            qc.setQueryData<ManualInvestmentAccount[]>(queryKeys.manualInvestments, (old = []) => [...old, newAccount]);
            qc.invalidateQueries({ queryKey: queryKeys.dashboard });
            setShowNewAccountForm(false);
            setNewAccountName('');
        },
    });

    const dividends: Dividend[] = dividendsData?.dividends || [];
    const loading = loadingPortfolio || loadingHistory;
    const error = isError ? 'Nepodařilo se načíst investice' : null;

    if (loading) {
        return (
            <MainLayout>
                <div className="investment-loading">
                    <div className="investment-spinner" />
                    <span>Načítám investice...</span>
                </div>
            </MainLayout>
        );
    }

    if (error) {
        return (
            <MainLayout>
                <div className="page-container investment-page">
                    <section className="surface investment-empty-card">
                        <h2>Chyba</h2>
                        <p>{error}</p>
                        <Link href="/" className="btn btn-primary">Zpět na dashboard</Link>
                    </section>
                </div>
            </MainLayout>
        );
    }

    const projectionLast = projectionData[projectionData.length - 1];
    const projectionTotal = projectionLast ? projectionLast.invested + projectionLast.gains : 0;
    const projectionGainPct = projectionLast && projectionLast.invested > 0 ? (projectionLast.gains / projectionLast.invested) * 100 : 0;

    return (
        <MainLayout>
            <div className="page-container investment-page">
                <header className="investment-header">
                    <div>
                        <h1>Investice</h1>
                        <p>
                            {portfolio?.last_synced ? `Poslední sync ${formatDate(portfolio.last_synced)}` : 'Portfolio a manuální investice'}
                        </p>
                    </div>
                    <button className="btn btn-primary investment-add-btn" onClick={() => setShowNewAccountForm((value) => !value)}>
                        {showNewAccountForm ? 'Zrušit' : '+ Přidat účet'}
                    </button>
                </header>

                {showNewAccountForm && (
                    <section className="surface investment-create-card">
                        <div className="investment-form-field">
                            <label>Název účtu</label>
                            <input
                                className="input"
                                autoFocus
                                value={newAccountName}
                                onChange={(event) => setNewAccountName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && newAccountName.trim()) createAccountMutation.mutate();
                                }}
                                placeholder="Degiro, fond, broker..."
                            />
                        </div>
                        <div className="investment-form-field investment-currency-field">
                            <label>Měna</label>
                            <input className="input" value={newAccountCurrency} onChange={(event) => setNewAccountCurrency(event.target.value)} placeholder="CZK" />
                        </div>
                        <button className="btn btn-primary" disabled={!newAccountName.trim() || createAccountMutation.isPending} onClick={() => createAccountMutation.mutate()}>
                            {createAccountMutation.isPending ? 'Vytvářím...' : 'Vytvořit'}
                        </button>
                    </section>
                )}

                <section className="surface investment-hero">
                    <div className="investment-hero-copy">
                        <span className="kpi-label">Celková hodnota portfolia</span>
                        <strong className="investment-total num">{formatCurrency(combinedTotal)}</strong>
                        <div className="investment-hero-sub">
                            <span className={valueDelta >= 0 ? 'positive' : 'negative'}>{valueDelta >= 0 ? '+' : ''}{formatCurrency(valueDelta)}</span>
                            <span>za období {period}</span>
                        </div>
                        <div className="investment-kpi-strip">
                            <div>
                                <span>Investováno</span>
                                <strong>{formatCurrency(investedTotal)}</strong>
                            </div>
                            <div>
                                <span>Výsledek</span>
                                <strong className={resultTotal >= 0 ? 'positive' : 'negative'}>
                                    {resultTotal >= 0 ? '+' : ''}{formatCurrency(resultTotal)}
                                    <small>{resultTotal >= 0 ? '+' : ''}{formatPct(resultPct)}</small>
                                </strong>
                            </div>
                            <div>
                                <span>Volná hotovost</span>
                                <strong>{formatCurrency(detail?.cash_free ?? 0, detail?.currency ?? 'CZK')}</strong>
                            </div>
                            <div>
                                <span>Účty</span>
                                <strong>{accountCount}</strong>
                            </div>
                        </div>
                    </div>

                    <div className="investment-chart-panel">
                        <div className="investment-periods" aria-label="Období grafu">
                            {PERIODS.map((periodOption) => (
                                <button
                                    key={periodOption}
                                    className={period === periodOption ? 'active' : ''}
                                    onClick={() => setPeriod(periodOption)}
                                >
                                    {periodOption}
                                </button>
                            ))}
                        </div>
                        {combinedChartData.length >= 2 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={combinedChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="investmentValueFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--pos)" stopOpacity={0.24} />
                                            <stop offset="95%" stopColor="var(--pos)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 7" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} height={24} tickMargin={2} />
                                    <YAxis tickFormatter={formatShortMoney} tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} width={54} />
                                    <Tooltip content={<InvestmentTooltip />} />
                                    <Area type="monotone" dataKey="value" stroke="var(--text)" strokeWidth={2.5} fill="url(#investmentValueFill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="investment-chart-empty">
                                <strong>Graf se doplní po dalších synchronizacích</strong>
                                <span>Zatím mám {combinedChartData.length} bod{combinedChartData.length === 1 ? '' : 'ů'} historie.</span>
                            </div>
                        )}
                    </div>
                </section>

                <section className="investment-main-grid">
                    <div className="surface investment-holdings-card">
                        <div className="card-head">
                            <h3>Pozice</h3>
                            <span>{holdingRows.length} položek</span>
                        </div>
                        <div className="investment-holding-list">
                            {holdingRows.length > 0 ? holdingRows.map((holding) => (
                                <div className="investment-holding-row" key={holding.id}>
                                    <div className="investment-holding-mark">{holding.name.slice(0, 2).toUpperCase()}</div>
                                    <div className="investment-holding-copy">
                                        <strong>{holding.name}</strong>
                                        <span>{holding.source}</span>
                                    </div>
                                    <div className="investment-holding-share">
                                        <div style={{ width: `${Math.min(100, Math.max(3, holding.share))}%` }} />
                                    </div>
                                    <div className="investment-holding-value">
                                        <strong>{formatCurrency(holding.value)}</strong>
                                        {holding.pnl != null && (
                                            <span className={holding.pnl >= 0 ? 'positive' : 'negative'}>
                                                {holding.pnl >= 0 ? '+' : ''}{formatCurrency(holding.pnl)}
                                                {holding.pnlPct != null ? ` (${holding.pnlPct >= 0 ? '+' : ''}${formatPct(holding.pnlPct)})` : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <div className="investment-empty-inline">Zatím tu nejsou žádné pozice.</div>
                            )}
                        </div>
                    </div>

                    <div className="surface investment-allocation-card">
                        <div className="card-head">
                            <h3>Rozložení</h3>
                        </div>
                        {allocationRows.length > 0 ? (
                            <div className="investment-allocation-body">
                                <PieChart width={190} height={190}>
                                    <Pie data={allocationRows} cx={95} cy={95} innerRadius={58} outerRadius={84} dataKey="value" strokeWidth={0}>
                                        {allocationRows.map((row) => <Cell key={row.id} fill={row.color} />)}
                                    </Pie>
                                    <Tooltip formatter={(value: number | undefined) => formatCurrency(Number(value ?? 0))} />
                                </PieChart>
                                <div className="investment-allocation-list">
                                    {allocationRows.map((row) => (
                                        <div className="investment-allocation-row" key={row.id}>
                                            <span style={{ background: row.color }} />
                                            <strong>{row.name}</strong>
                                            <em>{combinedTotal > 0 ? formatPct((row.value / combinedTotal) * 100) : '0 %'}</em>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="investment-empty-inline">Rozložení se zobrazí po načtení pozic.</div>
                        )}
                    </div>
                </section>

                {((portfolio?.transactions.length ?? 0) > 0 || dividends.length > 0) && (
                    <section className="investment-feed-grid">
                        {portfolio && portfolio.transactions.length > 0 && (
                            <div className="surface investment-feed-card">
                                <div className="card-head">
                                    <h3>Poslední transakce</h3>
                                </div>
                                <div className="investment-feed-list">
                                    {portfolio.transactions.slice(0, 8).map((transaction) => (
                                        <div className="investment-feed-row" key={transaction.id}>
                                            <div className="investment-feed-icon">{transaction.amount >= 0 ? '+' : '-'}</div>
                                            <div>
                                                <strong>{transaction.description}</strong>
                                                <span>{formatDate(transaction.date)} · {transaction.category}</span>
                                            </div>
                                            <em className={transaction.amount >= 0 ? 'positive' : ''}>
                                                {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount, transaction.currency)}
                                            </em>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {dividends.length > 0 && (
                            <div className="surface investment-feed-card">
                                <div className="card-head">
                                    <h3>Dividendy</h3>
                                </div>
                                <div className="investment-feed-list">
                                    {dividends.slice(0, 8).map((dividend, index) => (
                                        <div className="investment-feed-row" key={`${dividend.ticker}-${dividend.date}-${index}`}>
                                            <div className="investment-feed-icon dividend">D</div>
                                            <div>
                                                <strong>{dividend.ticker || 'Dividenda'}</strong>
                                                <span>{formatDate(dividend.date)}</span>
                                            </div>
                                            <em className="positive">+{formatCurrency(dividend.amount, dividend.currency)}</em>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                <section className="surface investment-projection-card">
                    <div className="card-head">
                        <h3>Projekce složeného úročení</h3>
                        <span>{projYears} let</span>
                    </div>

                    <div className="investment-projection-body">
                        <div className="investment-projection-controls">
                            <label>
                                <span>Počáteční hodnota</span>
                                <input
                                    className="input"
                                    type="number"
                                    value={projStartOverride !== '' ? projStartOverride : String(Math.round(combinedTotal))}
                                    onChange={(event) => setProjStartOverride(event.target.value)}
                                />
                            </label>
                            <RangeControl label="Měsíční příspěvek" value={projMonthly} min={0} max={50000} step={500} suffix="Kč" onChange={setProjMonthly} />
                            <RangeControl label="Roční výnos" value={projRate} min={1} max={20} step={0.5} suffix="%" onChange={setProjRate} />
                            <RangeControl label="Horizont" value={projYears} min={1} max={40} step={1} suffix="let" onChange={setProjYears} />
                        </div>

                        <div className="investment-projection-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={projectionData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="projectionInvestedFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.05} />
                                        </linearGradient>
                                        <linearGradient id="projectionGainsFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--pos)" stopOpacity={0.28} />
                                            <stop offset="100%" stopColor="var(--pos)" stopOpacity={0.07} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 7" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="year" tickFormatter={(year: number) => year === 0 ? 'Dnes' : `+${year}r`} tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={formatShortMoney} tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} width={54} />
                                    <Tooltip content={<ProjectionTooltip />} />
                                    <Area type="monotone" dataKey="invested" stackId="1" stroke="var(--accent)" strokeWidth={1.7} fill="url(#projectionInvestedFill)" />
                                    <Area type="monotone" dataKey="gains" stackId="1" stroke="var(--pos)" strokeWidth={1.7} fill="url(#projectionGainsFill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="investment-projection-summary">
                        <div>
                            <span>Hodnota za {projYears} let</span>
                            <strong>{formatCurrency(projectionTotal)}</strong>
                        </div>
                        <div>
                            <span>Celkem vloženo</span>
                            <strong>{formatCurrency(projectionLast?.invested ?? 0)}</strong>
                        </div>
                        <div>
                            <span>Výnos</span>
                            <strong className="positive">+{formatCurrency(projectionLast?.gains ?? 0)} <small>({formatPct(projectionGainPct)})</small></strong>
                        </div>
                    </div>
                </section>

                <section className="surface investment-accounts-card">
                    <div className="card-head">
                        <h3>Investiční účty</h3>
                        <button className="btn" onClick={() => setShowNewAccountForm((value) => !value)}>+ Přidat</button>
                    </div>
                    <div className="investment-account-list">
                        {portfolio && (
                            <Link className="investment-account-row" href="/investments/trading212">
                                <div className="investment-account-logo">T212</div>
                                <div>
                                    <strong>Trading 212</strong>
                                    <span>Automaticky synchronizováno</span>
                                </div>
                                <em>{formatCurrency(portfolio.total_value, portfolio.currency)}</em>
                            </Link>
                        )}
                        {manualInvestments.map((account) => (
                            <Link className="investment-account-row" href={`/investments/manual/${account.id}`} key={account.id}>
                                <div className="investment-account-logo manual">M</div>
                                <div>
                                    <strong>{account.name}</strong>
                                    <span>{account.positions.length} pozic</span>
                                </div>
                                <em>{formatCurrency(account.total_value, account.currency)}</em>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </MainLayout>
    );
}

function RangeControl({
    label,
    value,
    min,
    max,
    step,
    suffix,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix: string;
    onChange: (value: number) => void;
}) {
    return (
        <label>
            <span>{label}</span>
            <strong>{value.toLocaleString('cs-CZ')} {suffix}</strong>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        </label>
    );
}

function InvestmentTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="investment-tooltip">
            <span>{label ? formatDate(label) : ''}</span>
            <strong>{formatCurrency(Number(payload[0].value ?? 0))}</strong>
        </div>
    );
}

function ProjectionTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: number }) {
    if (!active || !payload?.length) return null;
    const invested = payload.find((item) => item.name === 'invested')?.value ?? 0;
    const gains = payload.find((item) => item.name === 'gains')?.value ?? 0;
    return (
        <div className="investment-tooltip">
            <span>{label === 0 ? 'Dnes' : `Za ${label} let`}</span>
            <strong>{formatCurrency(invested + gains)}</strong>
            <em>Vloženo {formatCurrency(invested)} · výnos {formatCurrency(gains)}</em>
        </div>
    );
}

function cleanTicker(ticker: string) {
    return ticker.replace('_US_EQ', '').replace('_EQ', '');
}

function allocationColor(index: number) {
    const colors = ['#34c759', '#007aff', '#ff9f0a', '#5e5ce6', '#ff3b30', '#30b0c7', '#af52de', '#64d2ff'];
    return colors[index % colors.length];
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

function formatDate(dateStr: string) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('cs-CZ');
}

function formatAxisDate(value: string) {
    return new Date(value).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}
