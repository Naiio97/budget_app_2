'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import { queryKeys } from '@/lib/queryKeys';
import { LineIcons } from '@/lib/line-icons';
import {
    Subscription, DetectedSubscription, SubscriptionsSummary, SubscriptionCreateInput,
    getSubscriptions, getSubscriptionsSummary, detectSubscriptions,
    createSubscription, updateSubscription, deleteSubscription,
} from '@/lib/api';

const formatCurrency = (amount: number, currency = 'CZK') =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${parseInt(d)}. ${parseInt(m)}. ${y}`;
};

const PERIOD_LABEL: Record<Subscription['period'], string> = {
    monthly: 'měsíčně',
    quarterly: 'čtvrtletně',
    yearly: 'ročně',
};

const emptyForm = {
    name: '',
    merchant_pattern: '',
    amount: '',
    period: 'monthly' as Subscription['period'],
    category: '',
    note: '',
    my_percentage: '100',
    my_amount_override: '',
};

export default function SubscriptionsPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [showDetect, setShowDetect] = useState(false);

    const { data: subs = [], isLoading } = useQuery<Subscription[]>({
        queryKey: queryKeys.subscriptions, queryFn: getSubscriptions,
    });
    const { data: summary } = useQuery<SubscriptionsSummary>({
        queryKey: queryKeys.subscriptionsSummary, queryFn: getSubscriptionsSummary,
    });
    const { data: suggestions = [], isFetching: detecting, refetch: runDetect } = useQuery<DetectedSubscription[]>({
        queryKey: queryKeys.subscriptionsDetect,
        queryFn: detectSubscriptions,
        enabled: false, // spouští se jen tlačítkem
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions });
        queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionsSummary });
    };

    const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

    const createMutation = useMutation({
        mutationFn: (data: SubscriptionCreateInput) => createSubscription(data),
        onSuccess: () => {
            invalidate();
            closeForm();
            // Přijatý návrh zmizí ze seznamu návrhů (pattern už je sledovaný)
            queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionsDetect });
        },
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<SubscriptionCreateInput> & { is_active?: boolean } }) =>
            updateSubscription(id, data),
        onSuccess: () => { invalidate(); closeForm(); },
    });
    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteSubscription(id),
        onSuccess: invalidate,
    });

    const saving = createMutation.isPending || updateMutation.isPending;

    const startEdit = (sub: Subscription) => {
        setEditingId(sub.id);
        setForm({
            name: sub.name,
            merchant_pattern: sub.merchant_pattern,
            amount: String(sub.amount),
            period: sub.period,
            category: sub.category ?? '',
            note: sub.note ?? '',
            my_percentage: String(sub.my_percentage),
            my_amount_override: sub.my_amount_override != null ? String(sub.my_amount_override) : '',
        });
        setShowForm(true);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const submit = () => {
        const amount = parseFloat(form.amount);
        if (!form.name.trim() || !form.merchant_pattern.trim() || !(amount > 0)) return;
        const data: SubscriptionCreateInput = {
            name: form.name.trim(),
            merchant_pattern: form.merchant_pattern.trim(),
            amount,
            period: form.period,
            category: form.category.trim() || null,
            note: form.note.trim() || null,
            my_percentage: form.my_percentage.trim() ? parseInt(form.my_percentage, 10) : 100,
            my_amount_override: form.my_amount_override.trim() ? parseFloat(form.my_amount_override) : null,
        };
        if (editingId != null) updateMutation.mutate({ id: editingId, data });
        else createMutation.mutate(data);
    };

    const acceptSuggestion = (s: DetectedSubscription) => {
        createMutation.mutate({
            name: s.name,
            merchant_pattern: s.merchant_pattern,
            amount: s.amount,
            period: s.period,
            category: s.category,
            first_seen_date: s.first_seen_date,
        });
    };

    // Návrhy, jejichž pattern už mezitím sledujeme, nezobrazuj
    const trackedPatterns = subs.map(s => s.merchant_pattern);
    const visibleSuggestions = suggestions.filter(
        s => !trackedPatterns.some(p => p.includes(s.merchant_pattern) || s.merchant_pattern.includes(p))
    );

    return (
        <MainLayout>
            <div className="page-container" style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>
                <div className="page-head">
                    <div>
                        <h1>Předplatné</h1>
                        <p className="sub">Kolik a za co platíš v opakovaných platbách</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            className="btn"
                            onClick={() => { setShowDetect(true); runDetect(); }}
                            disabled={detecting}
                        >
                            {detecting ? 'Hledám…' : <>{LineIcons.search} Najít v historii</>}
                        </button>
                        <button className="btn btn-primary" onClick={() => (showForm ? closeForm() : setShowForm(true))}>
                            {showForm ? 'Zrušit' : '+ Přidat ručně'}
                        </button>
                    </div>
                </div>

                {/* Summary — "moje část" je hlavní číslo, celková částka jen jako kontext u sdílených */}
                {summary && summary.active_count > 0 && (
                    <div className="dashboard-grid" style={{ marginBottom: 'var(--spacing-sm)' }}>
                        <GlassCard>
                            <div className="stat-label">Platím měsíčně</div>
                            <div className="stat-value" style={{ fontSize: '1.8rem' }}>{formatCurrency(summary.my_monthly_total)}</div>
                            {summary.my_monthly_total !== summary.monthly_total && (
                                <div className="text-tertiary" style={{ fontSize: 12, marginTop: 2 }}>
                                    z celkových {formatCurrency(summary.monthly_total)} (sdíleno s ostatními)
                                </div>
                            )}
                        </GlassCard>
                        <GlassCard>
                            <div className="stat-label">Platím ročně</div>
                            <div className="stat-value" style={{ fontSize: '1.8rem', color: 'var(--warn)' }}>{formatCurrency(summary.my_yearly_total)}</div>
                        </GlassCard>
                        <GlassCard>
                            <div className="stat-label">Aktivních předplatných</div>
                            <div className="stat-value" style={{ fontSize: '1.8rem' }}>{summary.active_count}</div>
                        </GlassCard>
                    </div>
                )}

                {/* Detected suggestions */}
                {showDetect && (
                    <GlassCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                            <h3>Nalezené opakované platby</h3>
                            <button className="btn btn-sm" onClick={() => setShowDetect(false)}>Zavřít</button>
                        </div>
                        {detecting ? (
                            <p className="text-secondary">Procházím historii transakcí…</p>
                        ) : visibleSuggestions.length === 0 ? (
                            <p className="text-secondary">
                                Žádné nové opakované platby jsem nenašel. Vše, co vypadá jako předplatné, už nejspíš sleduješ.
                            </p>
                        ) : (
                            <div className="subs-suggestion-list">
                                {visibleSuggestions.map(s => (
                                    <div key={s.merchant_pattern} className="subs-suggestion-row">
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontWeight: 590, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                                            <div className="text-tertiary" style={{ fontSize: 12, marginTop: 2 }}>
                                                {s.occurrences}× · ~{s.avg_interval_days} dní · naposledy {formatDate(s.last_charged_date)}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div className="num" style={{ fontWeight: 620 }}>{formatCurrency(s.amount)}</div>
                                            <div className="text-tertiary" style={{ fontSize: 12 }}>{PERIOD_LABEL[s.period]}</div>
                                        </div>
                                        <button
                                            className="btn btn-sm btn-primary"
                                            style={{ flexShrink: 0 }}
                                            disabled={createMutation.isPending}
                                            onClick={() => acceptSuggestion(s)}
                                        >
                                            Přidat
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </GlassCard>
                )}

                {/* Add / edit form */}
                {showForm && (
                    <GlassCard>
                        <h3 style={{ marginBottom: 'var(--spacing-md)' }}>{editingId != null ? 'Upravit předplatné' : 'Nové předplatné'}</h3>
                        <div className="loan-form-grid">
                            <label className="loan-field">
                                <span>Název</span>
                                <input className="input" placeholder="Netflix" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                            </label>
                            <label className="loan-field">
                                <span>Text pro párování plateb</span>
                                <input className="input" placeholder="netflix" value={form.merchant_pattern} onChange={e => setForm({ ...form, merchant_pattern: e.target.value })} />
                            </label>
                            <label className="loan-field">
                                <span>Částka (Kč)</span>
                                <input className="input" type="number" placeholder="269" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                            </label>
                            <label className="loan-field">
                                <span>Perioda</span>
                                <select className="input" value={form.period} onChange={e => setForm({ ...form, period: e.target.value as Subscription['period'] })}>
                                    <option value="monthly">Měsíčně</option>
                                    <option value="quarterly">Čtvrtletně</option>
                                    <option value="yearly">Ročně</option>
                                </select>
                            </label>
                            <label className="loan-field">
                                <span>Kategorie (nepovinné)</span>
                                <input className="input" placeholder="Entertainment" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                            </label>
                            <label className="loan-field">
                                <span>Poznámka (nepovinné)</span>
                                <input className="input" placeholder="Sdílené s rodinou…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                            </label>
                            <label className="loan-field">
                                <span>Kolik z toho platím já (%)</span>
                                <input
                                    className="input" type="number" min={0} max={100} placeholder="100"
                                    value={form.my_percentage}
                                    disabled={!!form.my_amount_override.trim()}
                                    onChange={e => setForm({ ...form, my_percentage: e.target.value })}
                                />
                            </label>
                            <label className="loan-field">
                                <span>Nebo moje částka přímo (Kč, nepovinné)</span>
                                <input
                                    className="input" type="number" placeholder="např. platím jen půlku"
                                    value={form.my_amount_override}
                                    onChange={e => setForm({ ...form, my_amount_override: e.target.value })}
                                />
                            </label>
                        </div>
                        <p className="text-tertiary" style={{ fontSize: 12, marginTop: 8 }}>
                            U sdíleného předplatného (např. s partnerkou nebo rodinou) nastav, kolik z celkové částky reálně platíš ty — buď procentem, nebo přímou částkou (ta má přednost).
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-md)' }}>
                            <button className="btn btn-primary" onClick={submit} disabled={saving}>
                                {saving ? 'Ukládám…' : editingId != null ? 'Uložit změny' : 'Vytvořit'}
                            </button>
                            <button className="btn" onClick={closeForm}>Zrušit</button>
                        </div>
                        {(createMutation.isError || updateMutation.isError) && (
                            <p style={{ color: 'var(--neg)', marginTop: 8, fontSize: 13 }}>Nepodařilo se uložit předplatné.</p>
                        )}
                    </GlassCard>
                )}

                {/* Subscription cards */}
                {isLoading ? (
                    <p className="text-secondary">Načítám předplatná…</p>
                ) : subs.length === 0 ? (
                    <GlassCard>
                        <p className="text-secondary" style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
                            Zatím nesleduješ žádná předplatná. Zkus „Najít v historii“ — projdu transakce a navrhnu, co vypadá jako opakovaná platba.
                        </p>
                    </GlassCard>
                ) : (
                    <div className="subs-grid">
                        {subs.map(sub => (
                            <SubscriptionCard
                                key={sub.id}
                                sub={sub}
                                onEdit={() => startEdit(sub)}
                                onToggleActive={() => updateMutation.mutate({ id: sub.id, data: { is_active: !sub.is_active } })}
                                onDelete={() => { if (confirm(`Smazat předplatné „${sub.name}"?`)) deleteMutation.mutate(sub.id); }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </MainLayout>
    );
}

function SubscriptionCard({ sub, onEdit, onToggleActive, onDelete }: {
    sub: Subscription;
    onEdit: () => void;
    onToggleActive: () => void;
    onDelete: () => void;
}) {
    const isShared = sub.my_amount_override != null || sub.my_percentage !== 100;
    return (
        <GlassCard className={sub.is_active ? '' : 'subs-card-inactive'}>
            <div className="loan-card-head" style={{ marginBottom: 'var(--spacing-sm)' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="subs-card-title" title={sub.name}>{sub.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="loan-delete-btn" onClick={onEdit} title="Upravit">{LineIcons.edit}</button>
                    <button className="loan-delete-btn" onClick={onToggleActive} title={sub.is_active ? 'Označit jako zrušené' : 'Znovu aktivovat'}>
                        {sub.is_active ? LineIcons.pause : LineIcons.play}
                    </button>
                    <button className="loan-delete-btn" onClick={onDelete} title="Smazat">{LineIcons.delete}</button>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="num" style={{ fontSize: '1.5rem', fontWeight: 650 }}>{formatCurrency(sub.amount, sub.currency)}</span>
                <span className="text-tertiary" style={{ fontSize: 13 }}>{PERIOD_LABEL[sub.period]}</span>
                {sub.period !== 'monthly' && (
                    <span className="text-tertiary" style={{ fontSize: 12 }}>(≈ {formatCurrency(sub.monthly_equivalent)}/měs)</span>
                )}
            </div>
            {isShared && (
                <div className="num" style={{ fontSize: 13, color: 'var(--accent)', marginTop: 3 }}>
                    Moje část: {formatCurrency(sub.my_amount, sub.currency)}
                    {sub.my_amount_override == null && ` (${sub.my_percentage} %)`}
                </div>
            )}

            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'var(--spacing-sm)', minHeight: 20 }}>
                {!sub.is_active && <span className="chip">Zrušené</span>}
                {isShared && <span className="chip chip-accent">Sdíleno</span>}
                {sub.is_active && sub.renewing_soon && <span className="chip chip-accent">Obnovení do 7 dní</span>}
                {sub.is_active && sub.is_stale && <span className="chip chip-warn">Dlouho žádná platba — zrušené?</span>}
                {sub.price_change_from != null && sub.price_change_to != null && (
                    <span className={`chip ${sub.price_change_to > sub.price_change_from ? 'chip-danger' : 'chip-success'}`}>
                        {sub.price_change_to > sub.price_change_from ? 'Zdraženo' : 'Zlevněno'}: {formatCurrency(sub.price_change_from)} → {formatCurrency(sub.price_change_to)}
                    </span>
                )}
            </div>

            <div className="subs-meta-row">
                <div>
                    <div className="loan-stat-label">Příští platba</div>
                    <div className="loan-stat-value" style={{ fontSize: 14 }}>{formatDate(sub.next_due_date)}</div>
                </div>
                <div>
                    <div className="loan-stat-label">Poslední platba</div>
                    <div className="loan-stat-value" style={{ fontSize: 14 }}>
                        {formatDate(sub.last_charged_date)}
                        {sub.last_amount != null ? ` · ${formatCurrency(sub.last_amount, sub.currency)}` : ''}
                    </div>
                </div>
                <div>
                    <div className="loan-stat-label">Plateb celkem</div>
                    <div className="loan-stat-value" style={{ fontSize: 14 }}>{sub.charges_count}×</div>
                </div>
            </div>
        </GlassCard>
    );
}
