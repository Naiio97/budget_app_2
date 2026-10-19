'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import FormModal from '@/components/FormModal';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import {
    Loan, LoanPayment, LoansSummary, LoanCreateInput,
    getLoans, getLoansSummary, getLoanSchedule,
    createLoan, updateLoan, deleteLoan, toggleLoanPayment,
} from '@/lib/api';

const formatCurrency = (amount: number, currency = 'CZK') =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${parseInt(d)}. ${parseInt(m)}. ${y}`;
};

// Form date helpers — UI uses European dd.mm.yyyy, backend wants ISO yyyy-mm-dd.
const isoToEu = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
};
const euToIso = (eu: string): string | null => {
    const m = eu.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
    if (!m) return null;
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const iso = `${m[3]}-${mm}-${dd}`;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime()) || dt.getDate() !== Number(dd)) return null;
    return iso;
};

const LOAN_COLORS = ['#3b7dd8', '#7a67c4', '#2f9c78', '#c0794d', '#4a9db0'];

const emptyForm = {
    name: '',
    principal: '',
    interest_rate: '',
    term_months: '',
    monthly_payment: '',
    start_date: isoToEu(new Date().toISOString().slice(0, 10)),
    note: '',
};

export default function LoansPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    // Původní hodnoty upravovaného úvěru — kvůli rozhodnutí, zda přepočítat měsíční splátku
    const [editOriginal, setEditOriginal] = useState<typeof emptyForm | null>(null);

    const { data: loans = [], isLoading } = useQuery<Loan[]>({ queryKey: queryKeys.loans, queryFn: getLoans });
    const { data: summary } = useQuery<LoansSummary>({ queryKey: queryKeys.loansSummary, queryFn: getLoansSummary });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.loans });
        queryClient.invalidateQueries({ queryKey: queryKeys.loansSummary });
    };

    const closeForm = () => { setShowForm(false); setEditingId(null); setEditOriginal(null); setForm(emptyForm); };

    const createMutation = useMutation({
        mutationFn: (data: LoanCreateInput) => createLoan(data),
        onSuccess: () => { invalidate(); closeForm(); },
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: LoanCreateInput }) => updateLoan(id, data),
        onSuccess: () => {
            invalidate();
            if (editingId != null) queryClient.invalidateQueries({ queryKey: queryKeys.loanSchedule(editingId) });
            closeForm();
        },
    });
    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteLoan(id),
        onSuccess: () => { invalidate(); setExpandedId(null); },
    });

    const saving = createMutation.isPending || updateMutation.isPending;
    const saveError = createMutation.isError || updateMutation.isError;

    const startEdit = (loan: Loan) => {
        setEditingId(loan.id);
        const values = {
            name: loan.name,
            principal: String(loan.principal),
            interest_rate: String(loan.interest_rate),
            term_months: String(loan.term_months),
            monthly_payment: String(loan.monthly_payment),
            start_date: isoToEu(loan.start_date),
            note: loan.note ?? '',
        };
        setForm(values);
        setEditOriginal(values);
        setShowForm(true);
    };

    const submit = () => {
        const principal = parseFloat(form.principal);
        const term = parseInt(form.term_months);
        const startIso = euToIso(form.start_date);
        if (!form.name.trim() || !(principal > 0) || !(term > 0) || !startIso) return;
        // Při úpravě: pokud se změnila jistina / úrok / počet splátek a splátku jsem ručně
        // neměnil, nech ji dopočítat (jinak by zůstala stará částka).
        let monthlyPayment: number | null = form.monthly_payment ? parseFloat(form.monthly_payment) : null;
        if (editOriginal && form.monthly_payment === editOriginal.monthly_payment) {
            const paramsChanged = form.principal !== editOriginal.principal
                || form.interest_rate !== editOriginal.interest_rate
                || form.term_months !== editOriginal.term_months;
            if (paramsChanged) monthlyPayment = null;
        }
        const data: LoanCreateInput = {
            name: form.name.trim(),
            principal,
            interest_rate: parseFloat(form.interest_rate) || 0,
            term_months: term,
            monthly_payment: monthlyPayment,
            start_date: startIso,
            note: form.note.trim() || null,
        };
        if (editingId != null) updateMutation.mutate({ id: editingId, data });
        else createMutation.mutate(data);
    };

    return (
        <MainLayout>
            <div className="page-container" style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>
                <div className="page-head">
                    <div>
                        <h1>Úvěry</h1>
                        <p className="sub">Přehled splátek, kolik zbývá splatit a do kdy</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}>
                        + Přidat úvěr
                    </button>
                </div>

                {/* Souhrn */}
                {summary && summary.active_loans > 0 && (() => {
                    const active = loans.filter(l => l.remaining_balance > 0);
                    const total = summary.total_remaining_balance;
                    return (
                        <section className="surface ln-hero">
                            <div className="ln-hero-main">
                                <div className="ln-hero-label">Zbývá splatit</div>
                                <div className="ln-hero-value num">{formatCurrency(total)}</div>
                                <div className="ln-hero-sub">
                                    z {summary.active_loans} {summary.active_loans === 1 ? 'aktivního úvěru' : summary.active_loans < 5 ? 'aktivních úvěrů' : 'aktivních úvěrů'}
                                </div>
                            </div>
                            <div className="ln-hero-split">
                                <div className="ln-hero-label">Rozložení dluhu</div>
                                <div className="ln-split-bar">
                                    {active.map(l => (
                                        <span key={l.id} title={l.name} style={{ flexGrow: l.remaining_balance, background: LOAN_COLORS[loans.indexOf(l) % LOAN_COLORS.length] }} />
                                    ))}
                                </div>
                                <div className="ln-split-legend">
                                    {active.map(l => (
                                        <span key={l.id}>
                                            <i style={{ background: LOAN_COLORS[loans.indexOf(l) % LOAN_COLORS.length] }} />
                                            {l.name} <b className="num">{total > 0 ? ((l.remaining_balance / total) * 100).toFixed(1).replace('.', ',') : 0} %</b>
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="ln-hero-side">
                                <div className="ln-hero-label">Měsíční splátky celkem</div>
                                <div className="ln-hero-value small num">{formatCurrency(summary.total_monthly_payment)}</div>
                                <div className="ln-hero-sub">z {summary.active_loans} aktivních úvěrů</div>
                            </div>
                        </section>
                    );
                })()}

                {showForm && (
                    <FormModal
                        title={editingId != null ? 'Upravit úvěr' : 'Nový úvěr'}
                        subtitle={editingId != null ? form.name : 'Zadejte parametry úvěru, splátkový kalendář se dopočítá.'}
                        onClose={closeForm}
                    >
                    <div className="loan-form-grid">
                        <label className="loan-field">
                            <span>Název</span>
                            <input className="input" placeholder="Hypotéka" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        </label>
                        <label className="loan-field">
                            <span>Jistina (Kč)</span>
                            <input className="input" type="number" placeholder="2 500 000" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} />
                        </label>
                        <label className="loan-field">
                            <span>Úrok (% p.a.)</span>
                            <input className="input" type="number" step="0.01" placeholder="5.9" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} />
                        </label>
                        <label className="loan-field">
                            <span>Počet splátek</span>
                            <input className="input" type="number" placeholder="360" value={form.term_months} onChange={e => setForm({ ...form, term_months: e.target.value })} />
                        </label>
                        <label className="loan-field">
                            <span>Měsíční splátka (nepovinné)</span>
                            <input className="input" type="number" placeholder="dopočítá se" value={form.monthly_payment} onChange={e => setForm({ ...form, monthly_payment: e.target.value })} />
                        </label>
                        <label className="loan-field">
                            <span>První splátka</span>
                            <input className="input" type="text" inputMode="numeric" placeholder="dd.mm.rrrr" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                        </label>
                        <label className="loan-field loan-field-wide">
                            <span>Poznámka (nepovinné)</span>
                            <input className="input" placeholder="Banka, číslo smlouvy…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-md)' }}>
                        <button className="btn btn-primary" onClick={submit} disabled={saving}>
                            {saving ? 'Ukládám…' : editingId != null ? 'Uložit změny' : 'Vytvořit úvěr'}
                        </button>
                        <button className="btn" onClick={closeForm}>Zrušit</button>
                    </div>
                    {saveError && (
                        <p style={{ color: 'var(--neg)', marginTop: 8, fontSize: 13 }}>
                            {editingId != null ? 'Nepodařilo se uložit změny.' : 'Nepodařilo se vytvořit úvěr.'}
                        </p>
                    )}
                    </FormModal>
                )}

                {/* Loans list */}
                {isLoading ? (
                    <p className="text-secondary">Načítám úvěry…</p>
                ) : loans.length === 0 ? (
                    <GlassCard>
                        <p className="text-secondary" style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
                            Zatím nemáš žádné úvěry. Přidej první přes „+ Přidat úvěr“.
                        </p>
                    </GlassCard>
                ) : (
                    <div className="ln-grid">
                        {loans.map((loan, index) => (
                            <LoanCard
                                key={loan.id}
                                loan={loan}
                                color={LOAN_COLORS[index % LOAN_COLORS.length]}
                                expanded={expandedId === loan.id}
                                onToggle={() => setExpandedId(expandedId === loan.id ? null : loan.id)}
                                onEdit={() => startEdit(loan)}
                                onDelete={() => { if (confirm(`Smazat úvěr „${loan.name}"?`)) deleteMutation.mutate(loan.id); }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </MainLayout>
    );
}

function LoanCard({ loan, color, expanded, onToggle, onEdit, onDelete }: {
    loan: Loan;
    color: string;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const queryClient = useQueryClient();
    const { data: schedule = [], isLoading } = useQuery<LoanPayment[]>({
        queryKey: queryKeys.loanSchedule(loan.id),
        queryFn: () => getLoanSchedule(loan.id),
        enabled: expanded,
    });

    // Escape zavře okno kalendáře
    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [expanded, onToggle]);

    const toggleMutation = useMutation({
        mutationFn: ({ paymentId, isPaid }: { paymentId: number; isPaid: boolean }) =>
            toggleLoanPayment(loan.id, paymentId, isPaid),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.loanSchedule(loan.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.loans });
            queryClient.invalidateQueries({ queryKey: queryKeys.loansSummary });
            // Loan paid state is shared with the budget (live-linked rows).
            queryClient.invalidateQueries({ queryKey: ['monthly-budget'] });
            queryClient.invalidateQueries({ queryKey: ['annual-overview'] });
        },
    });

    return (
        <GlassCard className="ln-card">
            <div className="loan-card-head">
                <span className="ln-icon" style={{ background: color }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></svg>
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="loan-card-title">{loan.name}</div>
                    <div className="text-tertiary" style={{ fontSize: 12, marginTop: 2 }}>
                        {formatCurrency(loan.monthly_payment, loan.currency)}/měs · {loan.interest_rate}% p.a. · do {formatDate(loan.end_date)}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="loan-delete-btn" onClick={onEdit} title="Upravit úvěr">{Icons.action.edit}</button>
                    <button className="loan-delete-btn" onClick={onDelete} title="Smazat úvěr">{Icons.action.delete}</button>
                </div>
            </div>

            {loan.current_due_date && (
                <button
                    onClick={() => loan.current_payment_id != null && toggleMutation.mutate({ paymentId: loan.current_payment_id, isPaid: !loan.current_paid })}
                    disabled={loan.current_payment_id == null || toggleMutation.isPending}
                    title="Přepnout zaplacení splátky za tento měsíc"
                    style={{
                        marginTop: 'var(--spacing-sm)',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: 600, padding: '4px 10px',
                        borderRadius: 999, cursor: 'pointer',
                        border: '0.5px solid var(--border)',
                        background: loan.current_paid
                            ? 'color-mix(in srgb, var(--pos) 15%, transparent)'
                            : 'color-mix(in srgb, var(--warn) 15%, transparent)',
                        color: loan.current_paid ? 'var(--pos)' : 'var(--warn)',
                    }}
                >
                    {loan.current_paid ? '✓ Splátka za tento měsíc zaplacena' : '○ Splátka za tento měsíc nezaplacena'}
                </button>
            )}

            <div className="loan-progress-row">
                <div className="progress" style={{ flex: 1 }}>
                    <span style={{ width: `${loan.progress_percentage}%` }} />
                </div>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {loan.paid_count}/{loan.term_months} splátek
                </span>
            </div>

            <div className="loan-stats-grid">
                <div>
                    <div className="loan-stat-label">Zbývá splatit</div>
                    <div className="loan-stat-value" style={{ color: 'var(--warn)' }}>{formatCurrency(loan.remaining_balance, loan.currency)}</div>
                </div>
                <div>
                    <div className="loan-stat-label">Splaceno z jistiny</div>
                    <div className="loan-stat-value">{formatCurrency(loan.paid_principal, loan.currency)}</div>
                </div>
                <div>
                    <div className="loan-stat-label">Další splátka</div>
                    <div className="loan-stat-value">{formatDate(loan.next_due_date)}</div>
                </div>
                <div>
                    <div className="loan-stat-label">Úrok celkem</div>
                    <div className="loan-stat-value">{formatCurrency(loan.total_interest, loan.currency)}</div>
                </div>
            </div>

            <button className="btn btn-sm ln-cal-btn" onClick={onToggle}>
                Zobrazit splátkový kalendář
            </button>

            {expanded && createPortal(
                <div className="modal-backdrop tx-modal-overlay" onClick={onToggle}>
                    <div className="modal ln-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Splátkový kalendář — ${loan.name}`}>
                        <div className="ln-modal-head">
                            <span className="ln-icon" style={{ background: color }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></svg>
                            </span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div className="loan-card-title">{loan.name}</div>
                                <div className="text-tertiary" style={{ fontSize: 12, marginTop: 2 }}>
                                    Splátkový kalendář · {loan.paid_count}/{loan.term_months} splátek
                                </div>
                            </div>
                            <button onClick={onToggle} className="btn btn-icon btn-ghost" aria-label="Zavřít">×</button>
                        </div>
                        <div className="loan-schedule ln-modal-body">
            {isLoading ? (
                <p className="text-secondary" style={{ padding: 'var(--spacing-md)' }}>Načítám kalendář…</p>
            ) : (
                <div className="loan-schedule-scroll">
                    <div className="loan-schedule-row loan-schedule-head">
                        <span>#</span>
                        <span>Datum</span>
                        <span style={{ textAlign: 'right' }}>Splátka</span>
                        <span style={{ textAlign: 'right' }}>Jistina</span>
                        <span style={{ textAlign: 'right' }}>Úrok</span>
                        <span style={{ textAlign: 'right' }}>Zůstatek</span>
                        <span style={{ textAlign: 'center' }}>Zapl.</span>
                    </div>
                    {schedule.map(p => (
                        <div key={p.id} className={`loan-schedule-row ${p.is_paid ? 'paid' : ''}`}>
                            <span>{p.installment_number}</span>
                            <span>{formatDate(p.due_date)}</span>
                            <span className="num" style={{ textAlign: 'right' }}>{formatCurrency(p.amount, loan.currency)}</span>
                            <span className="num" style={{ textAlign: 'right' }}>{formatCurrency(p.principal_part, loan.currency)}</span>
                            <span className="num" style={{ textAlign: 'right', color: 'var(--text-3)' }}>{formatCurrency(p.interest_part, loan.currency)}</span>
                            <span className="num" style={{ textAlign: 'right' }}>{formatCurrency(p.remaining_balance, loan.currency)}</span>
                            <span style={{ textAlign: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={p.is_paid}
                                    disabled={toggleMutation.isPending}
                                    onChange={e => toggleMutation.mutate({ paymentId: p.id, isPaid: e.target.checked })}
                                />
                            </span>
                        </div>
                    ))}
                </div>
            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </GlassCard>
    );
}
