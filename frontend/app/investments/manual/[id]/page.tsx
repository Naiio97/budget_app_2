'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import {
    getManualInvestment,
    getManualInvestmentHistory,
    createManualInvestmentPosition,
    updateManualInvestmentPosition,
    deleteManualInvestmentPosition,
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
} from 'recharts';

const COLORS = ['#2dd4bf', '#818cf8', '#fb923c', '#34d399', '#f472b6', '#60a5fa', '#facc15', '#a78bfa'];

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Název *</label>
                <input className="input" value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} placeholder="VWCE, Bitcoin…" style={{ width: '100%', marginTop: '4px' }} />
            </div>
            <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aktuální hodnota *</label>
                <input className="input" type="number" value={form.current_value} onChange={e => onChange({ ...form, current_value: e.target.value })} placeholder="15 000" style={{ width: '100%', marginTop: '4px' }} />
            </div>
            <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Měna</label>
                <input className="input" value={form.currency} onChange={e => onChange({ ...form, currency: e.target.value })} placeholder="CZK" style={{ width: '100%', marginTop: '4px' }} />
            </div>
            <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Počet ks (volitelné)</label>
                <input className="input" type="number" value={form.quantity} onChange={e => onChange({ ...form, quantity: e.target.value })} placeholder="10" style={{ width: '100%', marginTop: '4px' }} />
            </div>
            <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Nákupní cena/ks (volitelné)</label>
                <input className="input" type="number" value={form.avg_buy_price} onChange={e => onChange({ ...form, avg_buy_price: e.target.value })} placeholder="1 400" style={{ width: '100%', marginTop: '4px' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Poznámka</label>
                <input className="input" value={form.note} onChange={e => onChange({ ...form, note: e.target.value })} placeholder="" style={{ width: '100%', marginTop: '4px' }} />
            </div>
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

    return (
        <MainLayout>
            <div className="page-container">
                {/* Header */}
                <header className="account-detail-head" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <div className="account-title-block">
                        <h1>{account.name}</h1>
                        <div className="account-detail-sub">Investiční účet · spravováno ručně</div>
                    </div>
                    <button onClick={() => router.back()} className="btn account-back-btn">← Zpět</button>
                </header>
                {/* Two-column layout: left = summary + pie, right = positions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)', alignItems: 'start' }}>

                    {/* Left column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                        {/* Summary */}
                        <GlassCard>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                <div>
                                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Celková hodnota</div>
                                    <div className="num account-balance-value">{fmt(account.total_value, account.currency)}</div>
                                </div>
                                {account.invested > 0 && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', paddingTop: 'var(--spacing-sm)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                            <div>
                                                <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>Investováno</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 500 }}>{fmt(account.invested, account.currency)}</div>
                                            </div>
                                            <div>
                                                <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '2px' }}>Zisk / Ztráta</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 600, color: account.pnl >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                                    {account.pnl >= 0 ? '+' : ''}{fmt(account.pnl, account.currency)}
                                                    <span style={{ fontSize: '0.8rem', opacity: 0.8, fontWeight: 400, marginLeft: '4px' }}>
                                                        ({account.pnl_pct >= 0 ? '+' : ''}{account.pnl_pct.toFixed(2)} %)
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </GlassCard>

                        {/* Allocation pie */}
                        {pieData.length > 0 && (
                            <GlassCard>
                                <h3 style={{ margin: '0 0 var(--spacing-md)' }}>Alokace</h3>
                                <ResponsiveContainer width="100%" height={180}>
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} dataKey="value" strokeWidth={0}>
                                            {pieData.map((p, i) => <Cell key={p.id} fill={colorForIndex(p.id, i)} />)}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.78rem', color: '#fff' }}
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

                    </div>{/* end left column */}

                    {/* Right column: Positions */}
                    <GlassCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                            <h3 style={{ margin: 0 }}>Pozice</h3>
                            <button className="btn btn-primary" onClick={() => setShowAddForm(v => !v)} style={{ fontSize: '0.85rem' }}>
                                {showAddForm ? 'Zrušit' : '+ Přidat pozici'}
                            </button>
                        </div>

                        {/* Add form */}
                        {showAddForm && (
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                                <PositionFormFields form={addForm} onChange={setAddForm} />
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <button className="btn btn-primary" disabled={!addForm.name || !addForm.current_value || addMutation.isPending} onClick={() => addMutation.mutate(addForm)} style={{ fontSize: '0.85rem' }}>
                                        {addMutation.isPending ? 'Ukládám…' : 'Přidat'}
                                    </button>
                                    <button className="btn" onClick={() => { setShowAddForm(false); setAddForm(emptyForm); }} style={{ fontSize: '0.85rem' }}>Zrušit</button>
                                </div>
                            </div>
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
                                    {editingId === pos.id ? (
                                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-sm)', padding: 'var(--spacing-md)' }}>
                                            <PositionFormFields form={editForm} onChange={setEditForm} />
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                                <button className="btn btn-primary" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ posId: pos.id, data: editForm })} style={{ fontSize: '0.85rem' }}>
                                                    {updateMutation.isPending ? 'Ukládám…' : 'Uložit'}
                                                </button>
                                                <button className="btn" onClick={() => setEditingId(null)} style={{ fontSize: '0.85rem' }}>Zrušit</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{pos.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    {pos.quantity != null && <span>{pos.quantity} ks</span>}
                                                    {pos.quantity != null && pos.avg_buy_price != null && <span> · nákup {fmt(pos.avg_buy_price, pos.currency)}/ks</span>}
                                                    {pos.note && <span> · {pos.note}</span>}
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
                                    )}
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                </div>{/* end two-column layout */}

                {/* Value history chart */}
                {history.length > 1 && (
                    <GlassCard>
                        <h3 style={{ margin: '0 0 var(--spacing-md)' }}>Vývoj hodnoty</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="manualInvGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={v => fmt(v, account.currency)} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.78rem', color: '#fff' }}
                                    formatter={(v: number | undefined) => [fmt(v ?? 0, account.currency), 'Hodnota']}
                                    labelFormatter={(l: string) => fmtDate(l)}
                                />
                                <Area type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={2} fill="url(#manualInvGrad)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </GlassCard>
                )}

            </div>
        </MainLayout>
    );
}
