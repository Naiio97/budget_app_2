'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import FormModal from '@/components/FormModal';
import {
    getManualInvestment,
    getManualInvestmentHistory,
    createManualInvestmentPosition,
    updateManualInvestmentPosition,
    deleteManualInvestmentPosition,
    updateManualInvestment,
    deleteManualInvestment,
    ManualInvestmentPosition,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import { POSITION_COLOR_PALETTE, getPositionColor, setPositionColor } from '@/lib/positionColors';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
} from 'recharts';

const PERIODS: { key: '1M' | '3M' | '6M' | '1R' | 'Vše'; days: number | null }[] = [
    { key: '1M', days: 30 }, { key: '3M', days: 90 }, { key: '6M', days: 180 }, { key: '1R', days: 365 }, { key: 'Vše', days: null },
];

const COLORS = ['#6a9fd0', '#b8a56a', '#9d92c9', '#7fbf9e', '#d09a8a', '#7fb8c4', '#c58fb0', '#a3acba'];

type PositionForm = {
    name: string;
    current_value: string;
    quantity: string;
    avg_buy_price: string;
    currency: string;
    note: string;
};

const emptyForm: PositionForm = { name: '', current_value: '', quantity: '', avg_buy_price: '', currency: 'CZK', note: '' };

function PositionFormFields({ form, onChange }: { form: PositionForm; onChange: (f: PositionForm) => void }) {
    return (
        <div className="loan-form-grid">
            <label className="loan-field loan-field-wide">
                <span>Název *</span>
                <input className="input" value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} placeholder="VWCE, Bitcoin…" />
            </label>
            <label className="loan-field">
                <span>Aktuální hodnota *</span>
                <input className="input" type="number" value={form.current_value} onChange={e => onChange({ ...form, current_value: e.target.value })} placeholder="15 000" />
            </label>
            <label className="loan-field">
                <span>Měna</span>
                <input className="input" value={form.currency} onChange={e => onChange({ ...form, currency: e.target.value })} placeholder="CZK" />
            </label>
            <label className="loan-field">
                <span>Počet ks (volitelné)</span>
                <input className="input" type="number" value={form.quantity} onChange={e => onChange({ ...form, quantity: e.target.value })} placeholder="10" />
            </label>
            <label className="loan-field">
                <span>Nákupní cena/ks (volitelné)</span>
                <input className="input" type="number" value={form.avg_buy_price} onChange={e => onChange({ ...form, avg_buy_price: e.target.value })} placeholder="1 400" />
            </label>
            <label className="loan-field loan-field-wide">
                <span>Poznámka (volitelné)</span>
                <input className="input" value={form.note} onChange={e => onChange({ ...form, note: e.target.value })} />
            </label>
        </div>
    );
}

export default function ManualInvestmentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params.id);
    const qc = useQueryClient();

    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState<PositionForm>(emptyForm);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<PositionForm>(emptyForm);

    // Per-position color overrides (localStorage). Map position id → hex color.
    const [colorVersion, setColorVersion] = useState(0);
    const [colorPickerForId, setColorPickerForId] = useState<number | null>(null);
    const [showManage, setShowManage] = useState(false);
    const [period, setPeriod] = useState<'1M' | '3M' | '6M' | '1R' | 'Vše'>('Vše');
    const [renameValue, setRenameValue] = useState('');

    const renameMutation = useMutation({
        mutationFn: (name: string) => updateManualInvestment(id, { name }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.manualInvestment(id) });
            qc.invalidateQueries({ queryKey: queryKeys.manualInvestments });
            qc.invalidateQueries({ queryKey: queryKeys.dashboard });
            setShowManage(false);
        },
    });
    const deleteAccountMutation = useMutation({
        mutationFn: () => deleteManualInvestment(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.manualInvestments });
            qc.invalidateQueries({ queryKey: queryKeys.dashboard });
            router.push('/investments');
        },
    });

    const { data: account, isLoading } = useQuery({
        queryKey: queryKeys.manualInvestment(id),
        queryFn: () => getManualInvestment(id),
    });

    const { data: history = [] } = useQuery({
        queryKey: queryKeys.manualInvestmentHistory(id),
        queryFn: () => getManualInvestmentHistory(id),
    });

    const colors = useMemo(() => {
        void colorVersion;
        const next: Record<number, string> = {};
        for (const pos of account?.positions ?? []) {
            const stored = getPositionColor('manual', pos.id);
            if (stored) next[pos.id] = stored;
        }
        return next;
    }, [account?.positions, colorVersion]);

    // Close color picker on outside click / Escape.
    useEffect(() => {
        if (colorPickerForId == null) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setColorPickerForId(null); };
        const onClick = () => setColorPickerForId(null);
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', onClick);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('click', onClick);
        };
    }, [colorPickerForId]);

    const setPosColor = (posId: number, color: string | null) => {
        setPositionColor('manual', posId, color);
        setColorVersion(v => v + 1);
    };

    const colorForIndex = (posId: number, index: number) =>
        colors[posId] ?? COLORS[index % COLORS.length];

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: queryKeys.manualInvestment(id) });
        qc.invalidateQueries({ queryKey: queryKeys.manualInvestmentHistory(id) });
        qc.invalidateQueries({ queryKey: queryKeys.manualInvestments });
        qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    };

    const addMutation = useMutation({
        mutationFn: (data: PositionForm) => createManualInvestmentPosition(id, {
            name: data.name.trim(),
            current_value: parseFloat(data.current_value),
            quantity: data.quantity ? parseFloat(data.quantity) : null,
            avg_buy_price: data.avg_buy_price ? parseFloat(data.avg_buy_price) : null,
            currency: data.currency || 'CZK',
            note: data.note || null,
        }),
        onSuccess: () => { invalidate(); setShowAddForm(false); setAddForm(emptyForm); },
    });

    const updateMutation = useMutation({
        mutationFn: ({ posId, data }: { posId: number; data: PositionForm }) =>
            updateManualInvestmentPosition(id, posId, {
                name: data.name.trim(),
                current_value: parseFloat(data.current_value),
                quantity: data.quantity ? parseFloat(data.quantity) : null,
                avg_buy_price: data.avg_buy_price ? parseFloat(data.avg_buy_price) : null,
                currency: data.currency || 'CZK',
                note: data.note || null,
            }),
        onSuccess: () => { invalidate(); setEditingId(null); },
    });

    const deleteMutation = useMutation({
        mutationFn: (posId: number) => deleteManualInvestmentPosition(id, posId),
        onSuccess: () => invalidate(),
    });

    const fmt = (v: number, cur = 'CZK') => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
    const fmtDate = (d: string) => new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
    const fmtDateFull = (d: string) => new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });

    const startEdit = (pos: ManualInvestmentPosition) => {
        setEditingId(pos.id);
        setEditForm({
            name: pos.name,
            current_value: String(pos.current_value),
            quantity: pos.quantity != null ? String(pos.quantity) : '',
            avg_buy_price: pos.avg_buy_price != null ? String(pos.avg_buy_price) : '',
            currency: pos.currency,
            note: pos.note ?? '',
        });
    };


    if (isLoading || !account) {
        return <MainLayout><div style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítám…</div></MainLayout>;
    }

    const pieData = account.positions.map(p => ({ id: p.id, name: p.name, value: p.current_value }));

    // ── Odvozené údaje z historie hodnoty a pozic ──
    const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const lastPoint = sortedHistory[sortedHistory.length - 1];
    const dayMs = 86400000;
    const valueOnOrBefore = (daysAgo: number) => {
        if (!lastPoint) return null;
        const limit = new Date(lastPoint.date).getTime() - daysAgo * dayMs;
        const candidates = sortedHistory.filter(p => new Date(p.date).getTime() <= limit);
        return candidates.length ? candidates[candidates.length - 1] : null;
    };
    const base30 = valueOnOrBefore(30);
    const change30 = lastPoint && base30 && base30.value > 0
        ? { diff: lastPoint.value - base30.value, pct: ((lastPoint.value - base30.value) / base30.value) * 100 } : null;
    const sinceStart = sortedHistory.length > 1 && sortedHistory[0].value > 0
        ? { diff: lastPoint.value - sortedHistory[0].value, pct: ((lastPoint.value - sortedHistory[0].value) / sortedHistory[0].value) * 100 } : null;
    const largest = account.positions.length ? account.positions.reduce((a, b) => (b.current_value > a.current_value ? b : a)) : null;
    const largestPct = largest && account.total_value > 0 ? (largest.current_value / account.total_value) * 100 : 0;
    const concentrationLabel = !largest ? '—' : largestPct >= 70 ? 'vysoká koncentrace' : largestPct >= 40 ? 'střední koncentrace' : 'rozložené';

    const periodDays = PERIODS.find(p => p.key === period)?.days ?? null;
    const shownHistory = periodDays && lastPoint
        ? sortedHistory.filter(p => new Date(p.date).getTime() >= new Date(lastPoint.date).getTime() - periodDays * dayMs)
        : sortedHistory;

    // Poslední hodnota v každém měsíci → rozdíl oproti předchozímu měsíci
    const monthEnds = new Map<string, number>();
    for (const p of sortedHistory) monthEnds.set(p.date.slice(0, 7), p.value);
    const monthKeys = Array.from(monthEnds.keys());
    const monthly = monthKeys.slice(1).map((k, i) => ({
        label: new Date(`${k}-01`).toLocaleDateString('cs-CZ', { month: 'short' }),
        diff: (monthEnds.get(k) ?? 0) - (monthEnds.get(monthKeys[i]) ?? 0),
    }));

    const stats = sortedHistory.length > 1 ? {
        max: sortedHistory.reduce((a, b) => (b.value > a.value ? b : a)),
        min: sortedHistory.reduce((a, b) => (b.value < a.value ? b : a)),
        avg: sortedHistory.reduce((s, p) => s + p.value, 0) / sortedHistory.length,
        lastDate: lastPoint.date,
    } : null;
    const recentChanges = sortedHistory.slice(-7).map((p, i, arr) => {
        const prev = i > 0 ? arr[i - 1] : sortedHistory[sortedHistory.length - arr.length - 1];
        return prev ? { date: p.date, value: p.value, diff: p.value - prev.value } : null;
    }).filter((c): c is { date: string; value: number; diff: number } => c !== null).reverse();

    return (
        <MainLayout>
            <div className="page-container page-stack" style={{ gap: 'var(--spacing-lg)' }}>
                {/* Header */}
                <header className="account-detail-head inv2-head">
                    <div className="account-title-block">
                        <h1>{account.name}</h1>
                        <div className="account-detail-sub">Investiční účet · spravováno ručně</div>
                    </div>
                    <div className="inv2-actions">
                        <button type="button" className="btn inv2-manage"
                            onClick={() => { setRenameValue(account.name); setShowManage(v => !v); }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
                            Spravovat účet
                        </button>
                        <button type="button" onClick={() => router.back()} className="btn account-back-btn">← Zpět</button>
                    </div>
                </header>

                {showManage && (
                    <FormModal title="Spravovat účet" subtitle={account.name} onClose={() => setShowManage(false)}>
                        <div className="loan-form-grid">
                            <label className="loan-field loan-field-wide">
                                <span>Název účtu</span>
                                <input className="input" value={renameValue} onChange={e => setRenameValue(e.target.value)} />
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-md)' }}>
                            <button className="btn btn-primary" disabled={!renameValue.trim() || renameValue.trim() === account.name || renameMutation.isPending}
                                onClick={() => renameMutation.mutate(renameValue.trim())}>
                                {renameMutation.isPending ? 'Ukládám…' : 'Přejmenovat'}
                            </button>
                            <button className="btn" onClick={() => setShowManage(false)}>Zrušit</button>
                        </div>
                        <div className="inv2-manage-row danger" style={{ marginTop: 'var(--spacing-lg)' }}>
                            <span>Smazat účet i se všemi pozicemi a historií hodnoty.</span>
                            <button className="btn" disabled={deleteAccountMutation.isPending}
                                onClick={() => { if (confirm(`Smazat účet "${account.name}" včetně všech pozic?`)) deleteAccountMutation.mutate(); }}>
                                Smazat účet
                            </button>
                        </div>
                    </FormModal>
                )}

                {/* Hero: hodnota + graf */}
                <section className="surface inv2-hero">
                    <div className="inv2-hero-copy">
                        <div>
                            <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Celková hodnota</div>
                            <div className="num account-balance-value">{fmt(account.total_value, account.currency)}</div>
                        </div>
                        <div className="dip-kpis">
                            {change30 && (
                                <div>
                                    <span>Za posledních 30 dní</span>
                                    <strong className={`num ${change30.diff >= 0 ? 'pos' : 'neg'}`}>
                                        {change30.diff >= 0 ? '+' : '−'}{fmt(Math.abs(change30.diff), account.currency)}
                                    </strong>
                                    <em className={change30.diff >= 0 ? 'pos' : 'neg'}>{change30.diff >= 0 ? '+' : '−'}{Math.abs(change30.pct).toFixed(1).replace('.', ',')} %</em>
                                </div>
                            )}
                            {sinceStart && (
                                <div>
                                    <span>Od {fmtDateFull(history[0].date)}</span>
                                    <strong className={`num ${sinceStart.diff >= 0 ? 'pos' : 'neg'}`}>
                                        {sinceStart.diff >= 0 ? '+' : '−'}{fmt(Math.abs(sinceStart.diff), account.currency)}
                                    </strong>
                                    <em className={sinceStart.diff >= 0 ? 'pos' : 'neg'}>{sinceStart.diff >= 0 ? '+' : '−'}{Math.abs(sinceStart.pct).toFixed(1).replace('.', ',')} %</em>
                                </div>
                            )}
                            {largest && (
                                <div>
                                    <span>Největší pozice</span>
                                    <strong title={largest.name}>{largest.name}</strong>
                                    <em>{largestPct.toFixed(1).replace('.', ',')} % účtu · {fmt(largest.current_value, largest.currency)}</em>
                                </div>
                            )}
                            <div>
                                <span>Pozic</span>
                                <strong className="num">{account.positions.length}</strong>
                                <em>{concentrationLabel}</em>
                            </div>
                            {account.invested > 0 && (
                                <div>
                                    <span>Investováno / zisk</span>
                                    <strong className="num">{fmt(account.invested, account.currency)}</strong>
                                    <em className={account.pnl >= 0 ? 'pos' : 'neg'}>
                                        {account.pnl >= 0 ? '+' : '−'}{fmt(Math.abs(account.pnl), account.currency)} ({account.pnl_pct >= 0 ? '+' : ''}{account.pnl_pct.toFixed(1).replace('.', ',')} %)
                                    </em>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="inv2-hero-chart">
                {/* Value history chart */}
                {history.length > 1 && (
                    <div>
                        <div className="dip-chart-head">
                            <h3 style={{ margin: 0 }}>Vývoj hodnoty</h3>
                            <div className="seg">
                                {PERIODS.map(p => (
                                    <div key={p.key} className={`seg-item ${period === p.key ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>{p.key}</div>
                                ))}
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={shownHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="manualInvGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#9d92c9" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#9d92c9" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={v => fmt(v, account.currency)} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip
                                    contentStyle={{ background: '#2d3d5c', border: 'none', borderRadius: '8px', fontSize: '0.78rem', color: '#fff' }}
                                    formatter={(v: number | undefined) => [fmt(v ?? 0, account.currency), 'Hodnota']}
                                    labelFormatter={(l: string) => fmtDate(l)}
                                />
                                <Area type="monotone" dataKey="value" stroke="#9d92c9" strokeWidth={2} fill="url(#manualInvGrad)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                    </div>
                </section>

                {/* Pozice + alokace */}
                <div className="inv2-grid">
                    <div className="dip-left">
                    {/* Right column: Positions */}
                    <GlassCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, marginBottom: 'var(--spacing-md)' }}>
                            <h3 style={{ margin: 0 }}>Pozice</h3>
                            <button className="btn btn-primary" onClick={() => setShowAddForm(v => !v)} style={{ fontSize: '0.85rem' }}>
                                + Přidat pozici
                            </button>
                        </div>

                        {showAddForm && (
                            <FormModal title="Nová pozice" subtitle={account.name} onClose={() => { setShowAddForm(false); setAddForm(emptyForm); }}>
                                <PositionFormFields form={addForm} onChange={setAddForm} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-md)' }}>
                                    <button className="btn btn-primary" disabled={!addForm.name || !addForm.current_value || addMutation.isPending} onClick={() => addMutation.mutate(addForm)}>
                                        {addMutation.isPending ? 'Ukládám…' : 'Přidat pozici'}
                                    </button>
                                    <button className="btn" onClick={() => { setShowAddForm(false); setAddForm(emptyForm); }}>Zrušit</button>
                                </div>
                            </FormModal>
                        )}

                        {editingId != null && (
                            <FormModal title="Upravit pozici" subtitle={editForm.name} onClose={() => setEditingId(null)}>
                                <PositionFormFields form={editForm} onChange={setEditForm} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-md)' }}>
                                    <button className="btn btn-primary" disabled={!editForm.name || !editForm.current_value || updateMutation.isPending} onClick={() => updateMutation.mutate({ posId: editingId, data: editForm })}>
                                        {updateMutation.isPending ? 'Ukládám…' : 'Uložit změny'}
                                    </button>
                                    <button className="btn" onClick={() => setEditingId(null)}>Zrušit</button>
                                </div>
                            </FormModal>
                        )}

                        {/* Position list */}
                        {account.positions.length === 0 && !showAddForm && (
                            <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-secondary)' }}>
                                Zatím žádné pozice. Klikni na + Přidat pozici.
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {account.positions.map((pos, posIndex) => (
                                <div key={pos.id}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{pos.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    {pos.quantity != null && <span>{pos.quantity} ks</span>}
                                                    {pos.quantity != null && pos.avg_buy_price != null && <span> · nákup {fmt(pos.avg_buy_price, pos.currency)}/ks</span>}
                                                    {pos.note && <span> · {pos.note}</span>}
                                                    {account.total_value > 0 && <span>{pos.quantity != null ? ' · ' : ''}{((pos.current_value / account.total_value) * 100).toFixed(1)} % účtu</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 600 }}>{fmt(pos.current_value, pos.currency)}</div>
                                                    {pos.pnl != null && (
                                                        <div style={{ fontSize: '0.78rem', color: pos.pnl >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                                            {pos.pnl >= 0 ? '+' : ''}{fmt(pos.pnl, pos.currency)} ({pos.pnl_pct?.toFixed(2)} %)
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', position: 'relative' }}>
                                                    <button
                                                        className="btn"
                                                        onClick={(e) => { e.stopPropagation(); setColorPickerForId(prev => prev === pos.id ? null : pos.id); }}
                                                        style={{ width: 36, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                        title="Změnit barvu"
                                                        aria-label="Změnit barvu pozice"
                                                    >
                                                        <span style={{
                                                            width: 12, height: 12, borderRadius: '50%',
                                                            background: colorForIndex(pos.id, posIndex),
                                                            display: 'inline-block',
                                                            border: '1px solid rgba(0,0,0,0.1)',
                                                        }} />
                                                    </button>
                                                    {colorPickerForId === pos.id && (
                                                        <div style={{
                                                            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                                            zIndex: 10,
                                                            background: 'var(--surface-strong)',
                                                            border: '0.5px solid var(--border)',
                                                            borderRadius: 'var(--radius-md)',
                                                            padding: 10,
                                                            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                                                            minWidth: 200,
                                                        }} onClick={e => e.stopPropagation()}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                                                                {POSITION_COLOR_PALETTE.map(c => {
                                                                    const isActive = colors[pos.id] === c.value;
                                                                    return (
                                                                        <button
                                                                            key={c.value}
                                                                            type="button"
                                                                            onClick={() => { setPosColor(pos.id, c.value); setColorPickerForId(null); }}
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
                                                            {colors[pos.id] && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setPosColor(pos.id, null); setColorPickerForId(null); }}
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
                                                    <button className="btn" onClick={() => startEdit(pos)} style={{ width: 36, height: 36, padding: 0, fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Icons.action.edit}</button>
                                                    <button className="btn" onClick={() => { if (confirm(`Smazat pozici "${pos.name}"?`)) deleteMutation.mutate(pos.id); }} style={{ width: 36, height: 36, padding: 0, fontSize: '0.9rem', color: 'var(--accent-danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Icons.action.delete}</button>
                                                </div>
                                            </div>
                                        </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                    {/* Pod pozicemi: změny po měsících */}
                    {monthly.length >= 2 && (
                        <GlassCard className="dip-monthly">
                            <div className="dip-card-head">
                                <h3>Změna hodnoty po měsících</h3>
                                <span className="muted small">rozdíl oproti konci předchozího měsíce</span>
                            </div>
                            <div className="dip-monthly-chart"><ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => `${v > 0 ? '+' : ''}${Math.round(v / 1000)}k`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                                    <Tooltip
                                        cursor={{ fill: 'var(--surface-sunken)' }}
                                        contentStyle={{ background: '#2d3d5c', border: 'none', borderRadius: '8px', fontSize: '0.78rem', color: '#fff' }}
                                        formatter={(v: number | undefined) => [`${(v ?? 0) >= 0 ? '+' : '−'}${fmt(Math.abs(v ?? 0), account.currency)}`, 'Změna']}
                                    />
                                    <Bar dataKey="diff" radius={[6, 6, 0, 0]} maxBarSize={38}>
                                        {monthly.map((m, i) => <Cell key={i} fill={m.diff >= 0 ? '#7fbf9e' : '#d09a8a'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer></div>
                        </GlassCard>
                    )}
                    </div>

                    <div className="inv2-side">
                        {/* Allocation pie */}
                        {pieData.length > 0 && (
                            <GlassCard>
                                <div style={{ display: 'flex', alignItems: 'center', minHeight: 40, marginBottom: 'var(--spacing-md)' }}>
                                    <h3 style={{ margin: 0 }}>Alokace</h3>
                                </div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} dataKey="value" strokeWidth={0}>
                                            {pieData.map((p, i) => <Cell key={p.id} fill={colorForIndex(p.id, i)} />)}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: '#2d3d5c', border: 'none', borderRadius: '8px', fontSize: '0.78rem', color: '#fff' }}
                                            formatter={(v: number | undefined, name: string | undefined) => [fmt(v ?? 0, account.currency), name ?? '']}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                                    {pieData.map((p, i) => (
                                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: colorForIndex(p.id, i), flexShrink: 0 }} />
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                            <span className="text-secondary">{account.total_value ? ((p.value / account.total_value) * 100).toFixed(1) : 0} %</span>
                                        </div>
                                    ))}
                                </div>
                            </GlassCard>
                        )}

                        {/* Statistiky vývoje */}
                        {stats && (
                            <GlassCard>
                                <div className="dip-card-head"><h3>Statistiky</h3><span className="muted small">{history.length} záznamů</span></div>
                                <div className="dip-stats">
                                    <div><span>Nejvyšší hodnota</span><strong className="num">{fmt(stats.max.value, account.currency)}</strong><em>{fmtDateFull(stats.max.date)}</em></div>
                                    <div><span>Nejnižší hodnota</span><strong className="num">{fmt(stats.min.value, account.currency)}</strong><em>{fmtDateFull(stats.min.date)}</em></div>
                                    <div><span>Průměrná hodnota</span><strong className="num">{fmt(stats.avg, account.currency)}</strong></div>
                                    <div><span>Naposledy aktualizováno</span><strong>{fmtDateFull(stats.lastDate)}</strong></div>
                                </div>
                            </GlassCard>
                        )}

                        {/* Poslední změny hodnoty */}
                        {recentChanges.length > 0 && (
                            <GlassCard>
                                <div className="dip-card-head"><h3>Poslední změny</h3></div>
                                <div className="dip-changes">
                                    {recentChanges.map(c => (
                                        <div key={c.date}>
                                            <span>{fmtDateFull(c.date)}</span>
                                            <strong className={`num ${c.diff >= 0 ? 'pos' : 'neg'}`}>{c.diff >= 0 ? '+' : '−'}{fmt(Math.abs(c.diff), account.currency)}</strong>
                                            <em className="num">{fmt(c.value, account.currency)}</em>
                                        </div>
                                    ))}
                                </div>
                            </GlassCard>
                        )}

                    </div>
                </div>

            </div>
        </MainLayout>
    );
}
