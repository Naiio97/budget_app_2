import { fetchApi } from './core';
import type { Account } from './accounts';
import type { Transaction } from './transactions';

export interface DashboardData {
    summary: {
        total_balance: number;
        bank_balance: number;
        investment_balance: number;
        currency: string;
        accounts_count: number;
    };
    monthly: {
        income: number;
        expenses: number;
        savings: number;
    };
    categories: Record<string, number>;
    recent_transactions: Transaction[];
    accounts: Account[];
}

export async function getDashboard(includeHidden = false): Promise<DashboardData> {
    return fetchApi<DashboardData>(`/dashboard/${includeHidden ? '?include_hidden=true' : ''}`);
}

// Net Worth History
export interface NetWorthHistory {
    history: Array<{ date: string; bank: number; investment: number; total: number }>;
    currency: string;
}

export async function getNetWorthHistory(days: number = 30): Promise<NetWorthHistory> {
    return fetchApi<NetWorthHistory>(`/dashboard/net-worth-history?days=${days}`);
}

// === Budgets & Goals ===

export interface WrappedMonth {
    month: string;      // YYYY-MM
    income: number;
    expenses: number;
}

export interface WrappedMerchant {
    name: string;
    total: number;
    count: number;
}

export interface SpendingWrapped {
    year: number;
    available_years: number[];
    currency: string;
    totals: {
        income: number;
        expenses: number;
        saved: number;
        expense_count: number;
        no_spend_days: number;
        days_elapsed: number;
    };
    monthly: WrappedMonth[];
    top_month: WrappedMonth | null;
    top_merchants: WrappedMerchant[];
    top_categories: { category: string; total: number; count: number }[];
    biggest_expense: { description: string; amount: number; date: string; category: string } | null;
    tags: { name: string; color: string; total: number; count: number }[];
}

export async function getWrapped(year?: number): Promise<SpendingWrapped> {
    return fetchApi<SpendingWrapped>(`/dashboard/wrapped${year ? `?year=${year}` : ''}`);
}
