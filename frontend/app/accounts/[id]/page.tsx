'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import TransactionList from '@/components/TransactionList';
import { getAccountDetail, getTransactions, AccountDetail, Transaction, PaginatedResponse } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';

const formatMoney = (amount: number, currency = 'CZK') =>
    new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);

const formatAxisDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

const formatLastSync = (iso: string) =>
    new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

const THEMES = [
    { id: 'default', name: 'Výchozí', color: null as string | null },
    { id: 'green', name: 'Zelený', color: '#10b981' },
    { id: 'blue', name: 'Modrý', color: '#3b82f6' },
    { id: 'purple', name: 'Fialový', color: '#a855f7' },
    { id: 'orange', name: 'Oranžový', color: '#f97316' },
    { id: 'red', name: 'Červený', color: '#ef4444' },
    { id: 'teal', name: 'Tyrkysový', color: '#14b8a6' },
    { id: 'pink', name: 'Růžový', color: '#ec4899' },
];

function BalanceChart({ transactions, balance, currency, nowMs, themeColor }: { transactions: Transaction[]; balance: number; currency: string; nowMs: number; themeColor: string | null }) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const series = useMemo(() => {
        const ninetyDaysAgo = nowMs - 90 * 24 * 60 * 60 * 1000;
        const recent = [...transactions]
            .filter(t => new Date(t.date).getTime() >= ninetyDaysAgo)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (recent.length < 2) return [];
        const startBalance = balance - recent.reduce((sum, tx) => sum + tx.amount, 0);
        const out: Array<{ date: string; value: number }> = [];
        let running = startBalance;
        recent.forEach(tx => {
            running += tx.amount;
            out.push({ date: tx.date, value: running });
        });
        return out;
    }, [transactions, balance, nowMs]);

    if (series.length < 2) {
        return <div style={{ display: 'grid', placeItems: 'center', minHeight: 240, color: 'var(--text-3)', fontSize: 13 }}>Pro graf zatím není dost dat.</div>;
    }

    const width = 900;
    const height = 220;
    const padTop = 12;
    const padBottom = 12;
    const padLeft = 12;
    const padRight = 86; // room for Y-axis labels
    const min = Math.min(...series.map(p => p.value));
    const max = Math.max(...series.map(p => p.value));
    const mid = (min + max) / 2;
    const range = max - min || 1;
    const points = series.map((point, i) => {
        const x = padLeft + (i / (series.length - 1)) * (width - padLeft - padRight);
        const y = padTop + (1 - ((point.value - min) / range)) * (height - padTop - padBottom);
        return { ...point, x, y };
    });
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${points[points.length - 1].x.toFixed(1)} ${height - padBottom} L${points[0].x.toFixed(1)} ${height - padBottom} Z`;

    const last = points[points.length - 1];
    const hovered = hoverIdx != null ? points[hoverIdx] : null;

    const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const xPct = (e.clientX - rect.left) / rect.width;
        const xInVB = xPct * width;
        let nearest = 0;
        let nearestDist = Infinity;
        points.forEach((p, i) => {
            const d = Math.abs(p.x - xInVB);
            if (d < nearestDist) { nearestDist = d; nearest = i; }
        });
        setHoverIdx(nearest);
    };

    const formatTooltipDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div style={{ position: 'relative' }}>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height: 220, display: 'block', cursor: 'crosshair' }}
                onMouseMove={handleMove}
                onMouseLeave={() => setHoverIdx(null)}
            >
                <defs>
                    <linearGradient id="acctChartFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={themeColor ?? 'var(--text)'} stopOpacity={themeColor ? 0.32 : 0.18} />
                        <stop offset="100%" stopColor={themeColor ?? 'var(--text)'} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Horizontal grid + Y-axis labels (max / mid / min) */}
                {[
                    { v: max, y: padTop },
                    { v: mid, y: padTop + (height - padTop - padBottom) / 2 },
                    { v: min, y: height - padBottom },
                ].map((row, i) => (
                    <g key={i}>
                        <line x1={padLeft} x2={width - padRight} y1={row.y} y2={row.y} stroke="var(--border)" strokeDasharray="4 8" opacity="0.65" />
                        <text x={width - padRight + 8} y={row.y + 4} fill="var(--text-3)" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatMoney(row.v, currency)}
                        </text>
                    </g>
                ))}

                <path d={area} fill="url(#acctChartFill)" />
                <path d={line} fill="none" stroke={themeColor ?? 'var(--text)'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

                {/* Last point marker */}
                <circle cx={last.x} cy={last.y} r="4" fill={themeColor ?? 'var(--text)'} />

                {/* Hover crosshair */}
                {hovered && (
                    <>
                        <line x1={hovered.x} x2={hovered.x} y1={padTop} y2={height - padBottom} stroke={themeColor ?? 'var(--text)'} strokeWidth="1" opacity="0.4" />
                        <circle cx={hovered.x} cy={hovered.y} r="5" fill={themeColor ?? 'var(--text)'} stroke="var(--surface-strong)" strokeWidth="2" />
                    </>
                )}
            </svg>

            {/* Date axis */}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-3)', fontSize: 12, marginTop: 4, paddingRight: '9.5%' }}>
                <span>{formatAxisDate(points[0].date)}</span>
                <span>{formatAxisDate(points[Math.floor(points.length / 2)].date)}</span>
                <span>{formatAxisDate(last.date)}</span>
            </div>

            {/* Tooltip */}
            {hovered && (
                <div style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    background: 'var(--surface-strong)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px',
                    fontSize: 12,
                    pointerEvents: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}>
                    <div style={{ color: 'var(--text-3)', marginBottom: 2 }}>{formatTooltipDate(hovered.date)}</div>
                    <div className="num" style={{ fontWeight: 620, fontSize: 14 }}>{formatMoney(hovered.value, currency)}</div>
                </div>
            )}
        </div>
    );
}

function TopCategories({ transactions, currency, nowMs, themeColor }: { transactions: Transaction[]; currency: string; nowMs: number; themeColor: string | null }) {
    const top = useMemo(() => {
        const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
        const map = new Map<string, number>();
        transactions.forEach(tx => {
            if (tx.amount >= 0) return;
            if (tx.is_excluded || (tx.transaction_type && tx.transaction_type !== 'normal')) return;
            if (new Date(tx.date).getTime() < cutoff) return;
            const cat = tx.category || 'Ostatní';
            map.set(cat, (map.get(cat) || 0) + Math.abs(tx.amount));
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [transactions, nowMs]);

    if (top.length === 0) {
        return <div style={{ display: 'grid', placeItems: 'center', minHeight: 220, color: 'var(--text-3)', fontSize: 13 }}>Za posledních 30 dní žádné výdaje.</div>;
    }

    const max = top[0][1];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {top.map(([name, amount]) => (
                <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{name}</span>
                        <span className="num" style={{ color: 'var(--text-2)' }}>{formatMoney(amount, currency)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(amount / max) * 100}%`, background: themeColor ?? 'var(--text)', borderRadius: 999 }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function AccountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const accountId = params.id as string;

    // Stable timestamp captured once on mount (used for date filtering in stats)
    const [nowMs] = useState(() => Date.now());

    // Per-account color theme (persisted in localStorage)
    const [themeId, setThemeId] = useState<string>('default');
    const [themeOpen, setThemeOpen] = useState(false);
    useEffect(() => {
        if (!accountId) return;
        const saved = localStorage.getItem(`acct-theme-${accountId}`);
        if (saved && THEMES.some(t => t.id === saved)) setThemeId(saved);
    }, [accountId]);
    const selectTheme = (id: string) => {
        setThemeId(id);
        if (accountId) localStorage.setItem(`acct-theme-${accountId}`, id);
    };
    const themeColor = THEMES.find(t => t.id === themeId)?.color ?? null;

    // Account meta
    const { data: meta, isLoading: metaLoading, isError } = useQuery<AccountDetail>({
        queryKey: queryKeys.accountDetail(accountId, 1),
        queryFn: () => getAccountDetail(accountId, 1, 1),
        enabled: !!accountId,
    });

    // Last 5 transactions for the preview list
    const previewFilters = { page: 1, account_id: accountId, limit: 5 };
    const { data: previewData, isLoading: previewLoading } = useQuery<PaginatedResponse<Transaction>>({
        queryKey: queryKeys.transactions(previewFilters),
        queryFn: () => getTransactions(previewFilters),
        enabled: !!accountId,
    });

    // 90-day stats for chart, top categories, and KPIs
    const ninetyDaysAgo = useMemo(() => {
        const d = new Date(nowMs);
        d.setDate(d.getDate() - 90);
        return d.toISOString().slice(0, 10);
    }, [nowMs]);
    const statsFilters = { account_id: accountId, date_from: ninetyDaysAgo, limit: 500 };
    const { data: statsData } = useQuery<PaginatedResponse<Transaction>>({
        queryKey: queryKeys.transactions(statsFilters),
        queryFn: () => getTransactions(statsFilters),
        enabled: !!accountId,
    });

    if (metaLoading && !meta) {
        return (
            <MainLayout>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    <div style={{ width: 40, height: 40, border: '3px solid var(--glass-border-light)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span className="text-secondary">Načítám účet...</span>
                </div>
            </MainLayout>
        );
    }

    if (isError || !meta) {
        return (
            <MainLayout>
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    <div className="surface">
                        <h2>{Icons.status.error} Chyba</h2>
                        <p className="text-secondary">Účet nenalezen</p>
                        <Link href="/" className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }}>Zpět na dashboard</Link>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const { account } = meta;
    const stats = statsData?.items ?? [];
    const previewList = previewData?.items ?? [];
    const totalItems = previewData?.total || 0;

    // This-month KPIs
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonthTx = stats.filter(t => new Date(t.date) >= monthStart && (!t.transaction_type || t.transaction_type === 'normal') && !t.is_excluded);
    const monthIncome = thisMonthTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const monthExpense = Math.abs(thisMonthTx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const monthNet = monthIncome - monthExpense;

    const pageBgStyle: React.CSSProperties = themeColor ? {
        position: 'relative',
    } : {};
    const heroBgStyle: React.CSSProperties = { padding: '24px 28px' };

    return (
        <MainLayout>
            <div className="page-container account-detail-page" style={pageBgStyle}>
                {/* Soft full-bleed background tint */}
                {themeColor && (
                    <div style={{
                        position: 'absolute',
                        top: -20, left: -40, right: -40,
                        height: 520,
                        background: `radial-gradient(ellipse at 30% 0%, color-mix(in srgb, ${themeColor} 16%, transparent), transparent 65%)`,
                        pointerEvents: 'none',
                        zIndex: 0,
                    }} />
                )}

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                {/* ── Page head ── */}
                <div className="account-detail-head">
                    <div className="account-title-block">
                        <h1 style={themeColor ? { color: themeColor } : undefined}>{account.name}</h1>
                        <div className="account-detail-sub">
                            {account.type === 'bank' ? 'Běžný účet' : account.type}
                            {account.institution && <> · {account.institution.replace(/_/g, ' ')}</>}
                            {account.last_synced && <> · synchronizováno {formatLastSync(account.last_synced)}</>}
                            {!account.is_visible && <> · <span className="chip">Skrytý</span></>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                            onClick={() => setThemeOpen(true)}
                            className="btn"
                            title="Vzhled účtu"
                            aria-label="Vzhled účtu"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        >
                            <span style={{
                                width: 14, height: 14, borderRadius: '50%',
                                background: themeColor ?? 'var(--surface-sunken)',
                                border: themeColor ? 'none' : '1px solid var(--border)',
                                display: 'inline-block',
                            }} />
                            Vzhled
                        </button>
                        <button onClick={() => router.back()} className="btn account-back-btn">← Zpět</button>
                    </div>
                </div>

                {/* ── Hero: balance + monthly KPIs ── */}
                <section className="surface" style={heroBgStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div style={{ minWidth: 0 }}>
                            <div className="kpi-label">Aktuální zůstatek</div>
                            <div className="num" style={{ fontSize: 'clamp(2.45rem, 4.2vw, 3.7rem)', fontWeight: 720, letterSpacing: '-0.055em', lineHeight: 1, marginTop: 6 }}>
                                {formatMoney(account.balance, account.currency)}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 18, flex: '1 1 360px', maxWidth: 540 }}>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Příjmy · tento měsíc</div>
                                <div className="num" style={{ fontSize: 18, fontWeight: 620, color: 'var(--pos)' }}>+{formatMoney(monthIncome, account.currency)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Výdaje · tento měsíc</div>
                                <div className="num" style={{ fontSize: 18, fontWeight: 620, color: 'var(--neg)' }}>-{formatMoney(monthExpense, account.currency)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Netto · tento měsíc</div>
                                <div className="num" style={{ fontSize: 18, fontWeight: 620, color: 'var(--text)' }}>{monthNet >= 0 ? '+' : ''}{formatMoney(monthNet, account.currency)}</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Two-column: balance chart + top categories ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 'var(--spacing-lg)' }} className="account-insight-grid">
                    <section className="surface">
                        <div style={{ marginBottom: 14 }}>
                            <h3 style={{ margin: 0, fontSize: 16 }}>Vývoj zůstatku</h3>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Posledních 90 dní</div>
                        </div>
                        <BalanceChart transactions={stats} balance={account.balance} currency={account.currency} nowMs={nowMs} themeColor={themeColor} />
                    </section>
                    <section className="surface">
                        <div style={{ marginBottom: 14 }}>
                            <h3 style={{ margin: 0, fontSize: 16 }}>Top kategorie</h3>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Posledních 30 dní</div>
                        </div>
                        <TopCategories transactions={stats} currency={account.currency} nowMs={nowMs} themeColor={themeColor} />
                    </section>
                </div>

                {/* ── Last 5 transactions ── */}
                <div className="surface">
                    <div className="card-head" style={{ padding: '18px var(--spacing-lg) 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>Posledních 5 transakcí <span className="muted">({totalItems} celkem)</span></h3>
                        <Link href={`/transactions?account_id=${accountId}`} className="btn">
                            Zobrazit všechny →
                        </Link>
                    </div>
                    <div className="card-body-nopad">
                        {previewLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl)' }}>
                                <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            </div>
                        ) : (
                            <TransactionList transactions={previewList} showAccount={false} />
                        )}
                    </div>
                </div>
                </div>
            </div>

            {/* Theme picker modal */}
            {themeOpen && (
                <div className="modal-backdrop" onClick={() => setThemeOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 0 }}>
                        <div style={{ padding: '18px var(--spacing-lg) 12px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 17 }}>Vzhled účtu</h3>
                            <button onClick={() => setThemeOpen(false)} className="btn btn-icon btn-ghost">✕</button>
                        </div>
                        <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {THEMES.map(t => {
                                const isActive = themeId === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => { selectTheme(t.id); setThemeOpen(false); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '10px 14px',
                                            borderRadius: 'var(--radius-md)',
                                            border: `1px solid ${isActive ? (t.color ?? 'var(--text)') : 'var(--border)'}`,
                                            background: isActive ? `color-mix(in srgb, ${t.color ?? 'var(--text)'} 10%, var(--surface))` : 'var(--surface)',
                                            color: 'var(--text)',
                                            fontSize: 14,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontWeight: isActive ? 600 : 400,
                                        }}
                                    >
                                        <span style={{
                                            width: 22, height: 22, borderRadius: '50%',
                                            background: t.color ?? 'var(--surface-sunken)',
                                            border: t.color ? 'none' : '1px solid var(--border)',
                                            flexShrink: 0,
                                        }} />
                                        <span style={{ flex: 1 }}>{t.name}</span>
                                        {isActive && <span style={{ color: t.color ?? 'var(--text)', fontSize: 16 }}>✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
