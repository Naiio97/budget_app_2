import { fetchApi } from './core';

// === Cashflow kalendář (VYLEPSENI.md 4.5) ===

export interface CashflowEvent {
    date: string;                // YYYY-MM-DD
    name: string;
    amount: number;              // záporné = odchozí
    source: 'budget' | 'loan' | 'subscription' | 'salary';
    date_estimated: boolean;
    overdue: boolean;
}

export interface CashflowDailyPoint {
    date: string;
    balance: number;
}

export interface Cashflow {
    year_month: string;
    today: string;
    currency: string;
    current_balance: number;
    history: CashflowDailyPoint[];     // 1. den měsíce → dnešek
    projection: CashflowDailyPoint[];  // dnešek → konec měsíce
    events: CashflowEvent[];
    expected_out: number;
    expected_in: number;
    projected_eom: number;
    projected_min: CashflowDailyPoint | null;
}

export async function getCashflowCurrent(): Promise<Cashflow> {
    return fetchApi<Cashflow>('/cashflow/current');
}
