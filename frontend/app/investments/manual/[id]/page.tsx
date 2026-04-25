'use client';

import { useState } from 'react';
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
    updateManualInvestment,
    deleteManualInvestment,
    ManualInvestmentPosition,
    ManualInvestmentAccount,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
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

export default function ManualInvestmentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params.id);
    const qc = useQueryClient();

    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState<PositionForm>(emptyForm);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<PositionForm>(emptyForm);
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState('');

    const { data: account, isLoading } = useQuery({
        queryKey: queryKeys.manualInvestment(id),
        queryFn: () => getManualInvestment(id),
    });

    const { data: history = [] } = useQuery({
        queryKey: queryKeys.manualInvestmentHistory(id),
        queryFn: () => getManualInvestmentHistory(id),
    });

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

    const renameMutation = useMutation({
        mutationFn: (name: string) => updateManualInvestment(id, { name }),
        onSuccess: () => { invalidate(); setEditingName(false); },
    });

    const deleteAccountMutation = useMutation({
        mutationFn: () => deleteManualInvestment(id),
        onSuccess: () => {
            qc.setQueryData<ManualInvestmentAccount[]>(queryKeys.manualInvestments, (old = []) => old.filter(a => a.id !== id));
            qc.invalidateQueries({ queryKey: queryKeys.dashboard });
            router.push('/investments');
        },
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

    const PositionFormFields = ({ form, onChange }: { form: PositionForm; onChange: (f: PositionForm) => void }) => (
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

    if (isLoading || !account) {
        return <MainLayout><div style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítám…</div></MainLayout>;
    }

    const pieData = account.positions.map(p => ({ name: p.name, value: p.current_value }));

    return (
        <MainLayout>
            <div className="page-container">
                {/* Header */}
                <header className="section-header-wrap" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                        {editingName ? (
                            <>
                                <input className="input" autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameMutation.mutate(nameInput); if (e.key === 'Escape') setEditingName(false); }} style={{ fontSize: '1.4rem', fontWeight: 600, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '4px 10px' }} />
                                <button className="btn btn-primary" onClick={() => renameMutation.mutate(nameInput)} style={{ fontSize: '0.85rem' }}>Uložit</button>
                                <button className="btn" onClick={() => setEditingName(false)} style={{ fontSize: '0.85rem' }}>Zrušit</button>
                            </>
                        ) : (
                            <>
                                <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{Icons.accountType.investment} {account.name}</h1>
                                <button className="btn" onClick={() => { setNameInput(account.name); setEditingName(true); }} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>{Icons.action.edit} Přejmenovat</button>
                                <button className="btn" onClick={() => { if (confirm(`Opravdu smazat účet "${account.name}" i se všemi pozicemi?`)) deleteAccountMutation.mutate(); }} style={{ fontSize: '0.8rem', padding: '4px 10px', color: 'var(--accent-danger)', borderColor: 'rgba(239,68,68,0.4)', marginLeft: 'auto' }}>
                                    Smazat účet
                                </button>
                            </>
                        )}
                    </div>
                </header>

                {/* Summary */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        <div>
                            <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Celková hodnota</div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{fmt(account.total_value, account.currency)}</div>
                        </div>
                        {account.invested > 0 && (
                            <>
                                <div>
                                    <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Investováno</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 500 }}>{fmt(account.invested, account.currency)}</div>
                                </div>
                                <div>
                                    <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Zisk / Ztráta</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 600, color: account.pnl >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                        {account.pnl >= 0 ? '+' : ''}{fmt(account.pnl, account.currency)}
                                        <span style={{ fontSize: '0.85rem', marginLeft: '6px', opacity: 0.8 }}>
                                            ({account.pnl_pct >= 0 ? '+' : ''}{account.pnl_pct.toFixed(2)} %)
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </GlassCard>

                {/* Charts row */}
                <div style={{ display: 'grid', gridTemplateColumns: history.length >= 2 ? '1fr 280px' : '1fr', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)', alignItems: 'start' }}>
                    {/* Value history */}
                    <GlassCard>
                        <h3 style={{ margin: '0 0 var(--spacing-md)' }}>{Icons.section.valueGrowth} Vývoj hodnoty</h3>
                        {history.length >= 2 ? (
                            <div style={{ height: '220px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history}>
                                        <defs>
                                            <linearGradient id="miGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={fmtDate} />
                                        <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={40} />
                                        <Tooltip
                                            contentStyle={{ background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px' }}
                                            labelFormatter={v => new Date(v).toLocaleDateString('cs-CZ')}
                                            formatter={(v: number | undefined) => [fmt(v ?? 0, account.currency), 'Hodnota']}
                                        />
                                        <Area type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={2} fill="url(#miGrad)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ fontSize: '1.5rem' }}>📈</span>
                                <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Graf se plní při každé aktualizaci hodnot</span>
                            </div>
                        )}
                    </GlassCard>

                    {/* Allocation pie */}
                    {pieData.length > 0 && (
                        <GlassCard>
                            <h3 style={{ margin: '0 0 var(--spacing-md)' }}>Alokace</h3>
                            <PieChart width={240} height={200}>
                                <Pie data={pieData} cx={115} cy={95} innerRadius={55} outerRadius={85} dataKey="value" strokeWidth={0}>
                                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.78rem', color: '#fff' }}
                                    formatter={(v: number | undefined, name: string | undefined) => [fmt(v ?? 0, account.currency), name ?? '']}
                                />
                            </PieChart>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                {pieData.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                        <span className="text-secondary">{account.total_value ? ((p.value / account.total_value) * 100).toFixed(1) : 0} %</span>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    )}
                </div>

                {/* Positions */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
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
                        {account.positions.map(pos => (
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
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button className="btn" onClick={() => startEdit(pos)} style={{ padding: '4px 8px', fontSize: '0.78rem' }}>{Icons.action.edit}</button>
                                                <button className="btn" onClick={() => { if (confirm(`Smazat pozici "${pos.name}"?`)) deleteMutation.mutate(pos.id); }} style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--accent-danger)' }}>✕</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </GlassCard>

            </div>
        </MainLayout>
    );
}
