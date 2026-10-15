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
    contribution_pattern: '',
};
type SubscriptionFormState = typeof emptyForm;

// Sdílený formulář pro vytvoření (karta nahoře) i inline editaci v kartě
// konkrétního předplatného.
function SubscriptionForm({ title, form, setForm, saving, isEdit, hasError, onSubmit, onCancel }: {
    title: string;
    form: SubscriptionFormState;
    setForm: (f: SubscriptionFormState) => void;
    saving: boolean;
    isEdit: boolean;
    hasError: boolean;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    return (
        <>
            <h3 style={{ marginBottom: 'var(--spacing-md)' }}>{title}</h3>
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
                <label className="loan-field">
                    <span>Vzor příchozího příspěvku (nepovinné)</span>
                    <input
                        className="input" placeholder="např. jméno / IBAN sestry"
                        value={form.contribution_pattern}
                        onChange={e => setForm({ ...form, contribution_pattern: e.target.value })}
                    />
                </label>
            </div>
            <p className="text-tertiary" style={{ fontSize: 12, marginTop: 8 }}>
                U sdíleného předplatného (např. s partnerkou nebo rodinou) nastav, kolik z celkové částky reálně platíš ty — buď procentem, nebo přímou částkou (ta má přednost).
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-md)' }}>
                <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>
                    {saving ? 'Ukládám…' : isEdit ? 'Uložit změny' : 'Vytvořit'}
                </button>
                <button className="btn" onClick={onCancel}>Zrušit</button>
            </div>
            {hasError && (
                <p style={{ color: 'var(--neg)', marginTop: 8, fontSize: 13 }}>Nepodařilo se uložit předplatné.</p>
            )}
        </>
    );
}

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

    // Editace se rozbalí přímo v kartě daného předplatného — horní formulář
    // slouží jen pro nové předplatné.
    const startEdit = (sub: Subscription) => {
        setShowForm(false);
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
            contribution_pattern: sub.contribution_pattern ?? '',
        });
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
            contribution_pattern: form.contribution_pattern.trim() || null,
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
                        <button className="btn btn-primary" onClick={() => (showForm ? closeForm() : (setEditingId(null), setForm(emptyForm), setShowForm(true)))}>
                            {showForm ? 'Zrušit' : '+ Přidat ručně'}
                        </button>
                    </div>
                </div>

                {/* Souhrn — "moje část" je hlavní číslo, celková částka jen jako kontext u sdílených */}
                {summary && summary.active_count > 0 && (() => {
                    const others = Math.max(summary.monthly_total - summary.my_monthly_total, 0);
                    const minePct = summary.monthly_total > 0 ? (summary.my_monthly_total / summary.monthly_total) * 100 : 100;
                    const cancelled = subs.filter(s => !s.is_active).length;
                    return (
                        <section className="surface sb-hero">
                            <div className="sb-hero-main">
                                <div className="sb-hero-label">Platím měsíčně</div>
                                <div className="sb-hero-value num">{formatCurrency(summary.my_monthly_total)}</div>
                                {others > 0 && (
                                    <div className="sb-hero-sub">z celkových {formatCurrency(summary.monthly_total)} (sdíleno s ostatními)</div>
                                )}
                            </div>
                            <div className="sb-hero-split">
                                <div className="sb-hero-label">Moje část z celkových plateb</div>
                                <div className="sb-split-bar">
                                    <span style={{ width: `${minePct}%`, background: 'var(--accent)' }} />
                                    {others > 0 && <span className="rest" style={{ width: `${100 - minePct}%` }} />}
                                </div>
                                <div className="sb-split-legend">
                                    <span><i style={{ background: 'var(--accent)' }} /><b>Moje část</b> {formatCurrency(summary.my_monthly_total)}</span>
                                    {others > 0 && <span><i className="rest" /><b>Platí ostatní</b> {formatCurrency(others)}</span>}
                                </div>
                            </div>
                            <div className="sb-hero-stat">
                                <div className="sb-hero-label">Platím ročně</div>
                                <div className="sb-hero-num num">{formatCurrency(summary.my_yearly_total)}</div>
                                <div className="sb-hero-sub">odhad z aktivních</div>
                            </div>
                            <div className="sb-hero-stat">
                                <div className="sb-hero-label">Aktivních předplatných</div>
                                <div className="sb-hero-num num">{summary.active_count}</div>
                                <div className="sb-hero-sub">{cancelled} zrušen{cancelled === 1 ? 'é' : 'á'}</div>
                            </div>
                        </section>
                    );
                })()}

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

                {/* Add form (create only — editace se rozbaluje v kartě předplatného) */}
                {showForm && (
                    <GlassCard>
                        <SubscriptionForm
                            title="Nové předplatné"
                            form={form}
                            setForm={setForm}
                            saving={saving}
                            isEdit={false}
                            hasError={createMutation.isError}
                            onSubmit={submit}
                            onCancel={closeForm}
                        />
                    </GlassCard>
                )}

                {/* Aktivní + zrušená předplatná */}
                {isLoading ? (
                    <p className="text-secondary">Načítám předplatná…</p>
                ) : subs.length === 0 ? (
                    <GlassCard>
                        <p className="text-secondary" style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
                            Zatím nesleduješ žádná předplatná. Zkus „Najít v historii“ — projdu transakce a navrhnu, co vypadá jako opakovaná platba.
                        </p>
                    </GlassCard>
                ) : (() => {
                    const active = subs.filter(s => s.is_active);
                    const cancelled = subs.filter(s => !s.is_active);
                    const editForm = (sub: Subscription) => (
                        <SubscriptionForm
                            title={`Upravit předplatné — ${sub.name}`}
                            form={form}
                            setForm={setForm}
                            saving={saving}
                            isEdit
                            hasError={updateMutation.isError}
                            onSubmit={submit}
                            onCancel={closeForm}
                        />
                    );
                    const handlers = (sub: Subscription) => ({
                        onEdit: () => startEdit(sub),
                        onToggleActive: () => updateMutation.mutate({ id: sub.id, data: { is_active: !sub.is_active } }),
                        onDelete: () => { if (confirm(`Smazat předplatné „${sub.name}"?`)) deleteMutation.mutate(sub.id); },
                        onAdoptPrice: () => { if (sub.price_change_to != null) updateMutation.mutate({ id: sub.id, data: { amount: sub.price_change_to } }); },
                    });
                    return (
                        <>
                            {active.length > 0 && (
                                <>
                                    <h2 className="sb-section-title">Aktivní</h2>
                                    <div className="sb-grid">
                                        {active.map(sub => editingId === sub.id ? (
                                            <GlassCard key={sub.id} className="subs-card-editing">{editForm(sub)}</GlassCard>
                                        ) : (
                                            <SubscriptionCard key={sub.id} sub={sub} {...handlers(sub)} />
                                        ))}
                                    </div>
                                </>
                            )}
                            {cancelled.length > 0 && (
                                <>
                                    <h2 className="sb-section-title">Zrušená</h2>
                                    <section className="surface sb-cancelled">
                                        {cancelled.map(sub => editingId === sub.id ? (
                                            <div key={sub.id} className="sb-cancelled-edit">{editForm(sub)}</div>
                                        ) : (
                                            <CancelledRow key={sub.id} sub={sub} {...handlers(sub)} />
                                        ))}
                                    </section>
                                </>
                            )}
                        </>
                    );
                })()}
            </div>
        </MainLayout>
    );
}

const AVATAR_COLORS = ['#d9534f', '#c73a7a', '#3b7dd8', '#2f9c78', '#7a67c4', '#c0794d', '#4a9db0'];
function avatarColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function avatarText(name: string): string {
    const words = name.trim().split(/[\s.]+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}
// Zobrazený název: velká písmena na začátku slov (NETFLIX.COM → Netflix.com)
function prettyName(name: string): string {
    if (name !== name.toUpperCase()) return name;
    return name.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
}

type CardHandlers = {
    onEdit: () => void;
    onToggleActive: () => void;
    onDelete: () => void;
    onAdoptPrice: () => void;
};

function SubActions({ sub, onEdit, onToggleActive, onDelete }: { sub: Subscription } & CardHandlers) {
    return (
        <div className="sb-actions">
            <button className="loan-delete-btn" onClick={onEdit} title="Upravit">{LineIcons.edit}</button>
            <button className="loan-delete-btn" onClick={onToggleActive} title={sub.is_active ? 'Označit jako zrušené' : 'Znovu aktivovat'}>
                {sub.is_active ? LineIcons.pause : LineIcons.play}
            </button>
            <button className="loan-delete-btn" onClick={onDelete} title="Smazat">{LineIcons.delete}</button>
        </div>
    );
}

function SubscriptionCard({ sub, onEdit, onToggleActive, onDelete, onAdoptPrice }: { sub: Subscription } & CardHandlers) {
    const isShared = sub.my_amount_override != null || sub.my_percentage !== 100;
    const color = avatarColor(sub.name);
    const minePct = sub.amount > 0 ? Math.min(100, (sub.my_amount / sub.amount) * 100) : 100;
    return (
        <GlassCard className="sb-card">
            <div className="sb-card-head">
                <span className="sb-avatar" style={{ background: color }}>{avatarText(sub.name)}</span>
                <div className="sb-card-title">
                    <strong title={sub.name}>{prettyName(sub.name)}</strong>
                    <div className="sb-chips">
                        {isShared && <span className="chip chip-accent">Sdíleno</span>}
                        {sub.renewing_soon && <span className="chip chip-accent">Obnovení do 7 dní</span>}
                        {sub.is_stale && <span className="chip chip-warn">Dlouho žádná platba — zrušené?</span>}
                        {sub.price_change_from != null && sub.price_change_to != null && (
                            <button
                                className={`chip chip-action ${sub.price_change_to > sub.price_change_from ? 'chip-danger' : 'chip-success'}`}
                                onClick={onAdoptPrice}
                                title="Kliknutím převezmeš novou cenu do předplatného — upozornění pak zmizí"
                            >
                                {sub.price_change_to > sub.price_change_from ? 'Zdraženo' : 'Zlevněno'}: {formatCurrency(sub.price_change_from)} → {formatCurrency(sub.price_change_to)}
                                <span className="chip-action-cta">Srovnat</span>
                            </button>
                        )}
                        {sub.contribution_received_this_period === true && (
                            <span className="chip chip-success" title={`Poslední příspěvek ${formatDate(sub.last_contribution_date)}${sub.last_contribution_amount != null ? ` · ${formatCurrency(sub.last_contribution_amount, sub.currency)}` : ''}`}>
                                Podíl přišel ✓
                            </span>
                        )}
                        {sub.contribution_received_this_period === false && (
                            <span className="chip chip-warn" title={sub.last_contribution_date ? `Poslední příspěvek ${formatDate(sub.last_contribution_date)}` : 'Zatím žádný příspěvek'}>
                                Podíl nepřišel
                            </span>
                        )}
                    </div>
                </div>
                <div className="sb-card-price">
                    <strong className="num">{formatCurrency(sub.amount, sub.currency)}</strong>
                    <span>{PERIOD_LABEL[sub.period]}</span>
                </div>
            </div>

            {isShared && (
                <div className="sb-mine">
                    <div className="sb-mine-row">
                        <span>Moje část</span>
                        <span className="num">
                            {formatCurrency(sub.my_amount, sub.currency)}
                            {sub.my_amount_override == null && ` (${sub.my_percentage} %)`}
                        </span>
                    </div>
                    <div className="sb-mine-bar"><span style={{ width: `${minePct}%`, background: color }} /></div>
                </div>
            )}

            <div className="sb-meta">
                <div>
                    <span>Příští platba</span>
                    <strong>{formatDate(sub.next_due_date)}</strong>
                </div>
                <div>
                    <span>Poslední platba</span>
                    <strong>
                        {formatDate(sub.last_charged_date)}
                        {sub.last_amount != null ? ` · ${formatCurrency(sub.last_amount, sub.currency)}` : ''}
                    </strong>
                </div>
                <div>
                    <span>Plateb celkem</span>
                    <strong>{sub.charges_count}×</strong>
                </div>
            </div>

            <SubActions sub={sub} onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} onAdoptPrice={onAdoptPrice} />
        </GlassCard>
    );
}

function CancelledRow({ sub, onEdit, onToggleActive, onDelete, onAdoptPrice }: { sub: Subscription } & CardHandlers) {
    const isShared = sub.my_amount_override != null || sub.my_percentage !== 100;
    return (
        <div className="sb-row">
            <span className="sb-avatar muted">{avatarText(sub.name)}</span>
            <div className="sb-row-title">
                <div className="sb-row-name">
                    <strong>{prettyName(sub.name)}</strong>
                    <span className="chip">Zrušené</span>
                    {isShared && <span className="chip chip-accent">Sdíleno</span>}
                </div>
                {isShared && (
                    <span className="sb-row-sub">
                        Moje část: {formatCurrency(sub.my_amount, sub.currency)}
                        {sub.my_amount_override == null && ` (${sub.my_percentage} %)`}
                    </span>
                )}
            </div>
            <div className="sb-row-meta">
                <span>Poslední platba</span>
                <strong>{formatDate(sub.last_charged_date)}{sub.last_amount != null ? ` · ${formatCurrency(sub.last_amount, sub.currency)}` : ''}</strong>
            </div>
            <div className="sb-row-meta">
                <span>Plateb celkem</span>
                <strong>{sub.charges_count}×</strong>
            </div>
            <div className="sb-row-price">
                <strong className="num">{formatCurrency(sub.amount, sub.currency)}</strong>
                <span>{PERIOD_LABEL[sub.period]}</span>
            </div>
            <SubActions sub={sub} onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} onAdoptPrice={onAdoptPrice} />
        </div>
    );
}
