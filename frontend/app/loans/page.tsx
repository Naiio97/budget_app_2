'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import {
    Loan, LoanPayment, LoansSummary, LoanCreateInput,
    getLoans, getLoansSummary, getLoanSchedule,
    createLoan, deleteLoan, toggleLoanPayment,
} from '@/lib/api';

const formatCurrency = (amount: number, currency = 'CZK') =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${parseInt(d)}. ${parseInt(m)}. ${y}`;
};

const emptyForm = {
    name: '',
    principal: '',
    interest_rate: '',
    term_months: '',
    monthly_payment: '',
    start_date: new Date().toISOString().slice(0, 10),
    note: '',
};

export default function LoansPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const { data: loans = [], isLoading } = useQuery<Loan[]>({ queryKey: queryKeys.loans, queryFn: getLoans });
    const { data: summary } = useQuery<LoansSummary>({ queryKey: queryKeys.loansSummary, queryFn: getLoansSummary });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.loans });
        queryClient.invalidateQueries({ queryKey: queryKeys.loansSummary });
    };

    const createMutation = useMutation({
        mutationFn: (data: LoanCreateInput) => createLoan(data),
        onSuccess: () => { invalidate(); setForm(emptyForm); setShowForm(false); },
    });
    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteLoan(id),
        onSuccess: () => { invalidate(); setExpandedId(null); },
    });

    const submit = () => {
        const principal = parseFloat(form.principal);
        const term = parseInt(form.term_months);
        if (!form.name.trim() || !(principal > 0) || !(term > 0)) return;
        createMutation.mutate({
            name: form.name.trim(),
            principal,
            interest_rate: parseFloat(form.interest_rate) || 0,
            term_months: term,
            monthly_payment: form.monthly_payment ? parseFloat(form.monthly_payment) : null,
            start_date: form.start_date,
            note: form.note.trim() || null,
        });
    };

    return (
        <MainLayout>
            <div className="page-container">
                <header className="section-header-wrap">
                    <div>
                        <h1 style={{ margin: 0 }}>{Icons.nav.loans} Úvěry</h1>
                        <p className="text-secondary" style={{ marginTop: 4 }}>Přehled splátek, kolik zbývá splatit a do kdy</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
                        {showForm ? 'Zrušit' : '+ Přidat úvěr'}
                    </button>
                </header>

                {/* Summary */}
                {summary && summary.active_loans > 0 && (
                    <div className="dashboard-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <GlassCard>
                            <div className="stat-label">Měsíční splátky celkem</div>
                            <div className="stat-value" style={{ fontSize: '1.8rem' }}>{formatCurrency(summary.total_monthly_payment)}</div>
                        </GlassCard>
                        <GlassCard>
                            <div className="stat-label">Zbývá splatit</div>
                            <div className="stat-value" style={{ fontSize: '1.8rem', color: 'var(--warn)' }}>{formatCurrency(summary.total_remaining_balance)}</div>
                        </GlassCard>
                        <GlassCard>
                            <div className="stat-label">Aktivní úvěry</div>
                            <div className="stat-value" style={{ fontSize: '1.8rem' }}>{summary.active_loans}</div>
                        </GlassCard>
                    </div>
                )}

                {/* Add form */}
                {showForm && (
                    <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Nový úvěr</h3>
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
                                <input className="input" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                            </label>
                            <label className="loan-field loan-field-wide">
                                <span>Poznámka (nepovinné)</span>
                                <input className="input" placeholder="Banka, číslo smlouvy…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 'var(--spacing-md)' }}>
                            <button className="btn btn-primary" onClick={submit} disabled={createMutation.isPending}>
                                {createMutation.isPending ? 'Ukládám…' : 'Vytvořit úvěr'}
                            </button>
                            <button className="btn" onClick={() => { setShowForm(false); setForm(emptyForm); }}>Zrušit</button>
                        </div>
                        {createMutation.isError && (
                            <p style={{ color: 'var(--neg)', marginTop: 8, fontSize: 13 }}>Nepodařilo se vytvořit úvěr.</p>
                        )}
                    </GlassCard>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {loans.map(loan => (
                            <LoanCard
                                key={loan.id}
                                loan={loan}
                                expanded={expandedId === loan.id}
                                onToggle={() => setExpandedId(expandedId === loan.id ? null : loan.id)}
                                onDelete={() => { if (confirm(`Smazat úvěr „${loan.name}"?`)) deleteMutation.mutate(loan.id); }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </MainLayout>
    );
}

function LoanCard({ loan, expanded, onToggle, onDelete }: {
    loan: Loan;
    expanded: boolean;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const queryClient = useQueryClient();
    const { data: schedule = [], isLoading } = useQuery<LoanPayment[]>({
        queryKey: queryKeys.loanSchedule(loan.id),
        queryFn: () => getLoanSchedule(loan.id),
        enabled: expanded,
    });

    const toggleMutation = useMutation({
        mutationFn: ({ paymentId, isPaid }: { paymentId: number; isPaid: boolean }) =>
            toggleLoanPayment(loan.id, paymentId, isPaid),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.loanSchedule(loan.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.loans });
            queryClient.invalidateQueries({ queryKey: queryKeys.loansSummary });
        },
    });

    return (
        <GlassCard>
            <div className="loan-card-head">
                <div style={{ minWidth: 0 }}>
                    <div className="loan-card-title">{loan.name}</div>
                    <div className="text-tertiary" style={{ fontSize: 12, marginTop: 2 }}>
                        {formatCurrency(loan.monthly_payment, loan.currency)}/měs · {loan.interest_rate}% p.a. · do {formatDate(loan.end_date)}
                    </div>
                </div>
                <button className="loan-delete-btn" onClick={onDelete} title="Smazat úvěr">{Icons.action.delete}</button>
            </div>

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

            <button className="btn btn-sm" style={{ marginTop: 'var(--spacing-md)' }} onClick={onToggle}>
                {expanded ? 'Skrýt splátkový kalendář' : 'Zobrazit splátkový kalendář'}
            </button>

            {expanded && (
                <div className="loan-schedule">
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
            )}
        </GlassCard>
    );
}
