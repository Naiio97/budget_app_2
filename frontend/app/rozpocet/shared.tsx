'use client';

export interface MonthlyExpense {
    id: number; name: string; amount: number;
    my_percentage: number; my_amount: number; my_amount_override: number | null;
    is_paid: boolean; is_auto_paid: boolean;
    matched_transaction_id: string | null; recurring_expense_id: number | null;
    is_loan?: boolean; loan_id?: number | null; loan_payment_id?: number | null;
    is_subscription?: boolean; subscription_id?: number | null;
    due_day?: number | null;
}
export interface IncomeItem { id: number; name: string; amount: number; order_index: number; is_salary: boolean; }
export interface MonthlyBudget {
    id: number; year_month: string;
    income_items: IncomeItem[];
    investment_amount: number; surplus_to_savings: number; is_closed: boolean;
    total_income: number; total_expenses: number; remaining: number;
    expenses: MonthlyExpense[];
}
export interface RecurringExpense { id: number; name: string; default_amount: number; is_auto_paid: boolean; match_pattern: string | null; category: string | null; order_index: number; is_active: boolean; due_day: number | null; }
export interface Envelope { id: number; name: string; amount: number; is_mine: boolean; note: string | null; }
export interface ManualAccount { id: number; name: string; balance: number; currency: string; my_balance: number; envelopes: Envelope[]; }
export interface AnnualData {
    year: number;
    months: Array<{ month: number; year_month: string; income: number; expenses: number; investments: number; savings: number; remaining: number; }>;
    totals: { income: number; expenses: number; investments: number; savings: number; net: number; };
    previous_year?: { income: number; expenses: number; investments: number; savings: number; net: number; };
    expense_breakdown: Record<string, number>;
    averages: { income: number; expenses: number; investments: number; };
}

export const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
export type Tab = 'overview' | 'expenses' | 'accounts';

export const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export function Ring({ pct, size = 160 }: { pct: number; size?: number }) {
    const r = (size / 2) - 12;
    const circ = 2 * Math.PI * r;
    const color = pct >= 100 ? 'var(--neg)' : pct >= 80 ? 'var(--warn)' : 'var(--pos)';
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="10" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={color} strokeWidth="10"
                strokeDasharray={`${Math.min(pct, 100) / 100 * circ} ${circ}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.2,0.9,0.3,1)' }}
            />
        </svg>
    );
}
