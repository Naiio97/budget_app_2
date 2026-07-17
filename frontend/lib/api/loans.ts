import { apiFetch, fetchApi } from './core';

// === Loans ===

export interface Loan {
    id: number;
    name: string;
    principal: number;
    interest_rate: number;
    term_months: number;
    monthly_payment: number;
    start_date: string;
    currency: string;
    match_pattern: string | null;
    note: string | null;
    is_active: boolean;
    paid_count: number;
    paid_principal: number;
    remaining_balance: number;
    total_interest: number;
    next_due_date: string | null;
    end_date: string | null;
    progress_percentage: number;
    current_payment_id: number | null;
    current_due_date: string | null;
    current_paid: boolean;
}

export interface LoanPayment {
    id: number;
    installment_number: number;
    due_date: string;
    amount: number;
    principal_part: number;
    interest_part: number;
    remaining_balance: number;
    is_paid: boolean;
    matched_transaction_id: string | null;
}

export interface LoansSummary {
    active_loans: number;
    total_monthly_payment: number;
    total_remaining_balance: number;
    total_principal: number;
    currency: string;
}

export interface LoanCreateInput {
    name: string;
    principal: number;
    interest_rate: number;
    term_months: number;
    monthly_payment?: number | null;
    start_date: string;
    currency?: string;
    match_pattern?: string | null;
    note?: string | null;
}

export async function getLoans(): Promise<Loan[]> {
    return fetchApi<Loan[]>('/loans/');
}

export async function getLoansSummary(): Promise<LoansSummary> {
    return fetchApi<LoansSummary>('/loans/summary');
}

export async function getLoanSchedule(id: number): Promise<LoanPayment[]> {
    return fetchApi<LoanPayment[]>(`/loans/${id}/schedule`);
}

export async function createLoan(data: LoanCreateInput): Promise<Loan> {
    const r = await apiFetch('/loans/', { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to create loan');
    return r.json();
}

export async function updateLoan(id: number, data: Partial<LoanCreateInput> & { is_active?: boolean }): Promise<Loan> {
    const r = await apiFetch(`/loans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to update loan');
    return r.json();
}

export async function deleteLoan(id: number): Promise<{ status: string; id: number }> {
    const r = await apiFetch(`/loans/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete loan');
    return r.json();
}

export async function toggleLoanPayment(loanId: number, paymentId: number, isPaid: boolean): Promise<LoanPayment> {
    const r = await apiFetch(`/loans/${loanId}/payments/${paymentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_paid: isPaid }),
    });
    if (!r.ok) throw new Error('Failed to update payment');
    return r.json();
}
