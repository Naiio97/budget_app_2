const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface Account {
    id: string;
    name: string;
    type: 'bank' | 'investment';
    balance: number;
    currency: string;
    institution?: string;
}

export interface Transaction {
    id: string;
    date: string;
    description: string;
    amount: number;
    currency: string;
    category?: string;
    account_id: string;
    account_type: string;
}

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

export interface BalanceHistory {
    history: Array<{ date: string; balance: number }>;
}

export interface Portfolio {
    total_value: number;
    total_profit: number;
    positions: Array<{
        ticker: string;
        quantity: number;
        average_price: number;
        current_price: number;
        value: number;
        profit: number;
        profit_percent: number;
    }>;
}

async function fetchApi<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    return response.json();
}

export async function getDashboard(): Promise<DashboardData> {
    return fetchApi<DashboardData>('/dashboard/');
}

export async function getAccounts(): Promise<Account[]> {
    return fetchApi<Account[]>('/accounts/');
}

export async function getTransactions(params?: {
    date_from?: string;
    date_to?: string;
    account_id?: string;
    limit?: number;
}): Promise<Transaction[]> {
    const searchParams = new URLSearchParams();
    if (params?.date_from) searchParams.set('date_from', params.date_from);
    if (params?.date_to) searchParams.set('date_to', params.date_to);
    if (params?.account_id) searchParams.set('account_id', params.account_id);
    if (params?.limit) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return fetchApi<Transaction[]>(`/transactions/${query ? `?${query}` : ''}`);
}

export async function getBalanceHistory(days: number = 30): Promise<BalanceHistory> {
    return fetchApi<BalanceHistory>(`/dashboard/balance-history?days=${days}`);
}

export async function getPortfolio(): Promise<Portfolio> {
    return fetchApi<Portfolio>('/dashboard/portfolio');
}

export async function getInstitutions(country: string = 'CZ'): Promise<{ institutions: any[] }> {
    return fetchApi<{ institutions: any[] }>(`/accounts/institutions?country=${country}`);
}

export async function connectBank(institutionId: string, redirectUrl: string): Promise<{ link: string; requisition_id: string }> {
    const response = await fetch(`${API_BASE}/accounts/connect/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution_id: institutionId, redirect_url: redirectUrl }),
    });

    if (!response.ok) throw new Error('Failed to connect bank');
    return response.json();
}

export interface SyncStatus {
    status: 'never' | 'running' | 'completed' | 'failed';
    last_sync: string | null;
    accounts_synced: number;
    transactions_synced: number;
    error?: string;
}

export interface SyncResult {
    status: 'completed' | 'failed';
    accounts_synced: number;
    transactions_synced: number;
}

export async function syncData(): Promise<SyncResult> {
    const response = await fetch(`${API_BASE}/sync/`, {
        method: 'POST',
    });

    if (!response.ok) throw new Error('Sync failed');
    return response.json();
}

export async function getSyncStatus(): Promise<SyncStatus> {
    return fetchApi<SyncStatus>('/sync/status');
}

