const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface Account {
    id: string;
    name: string;
    type: 'bank' | 'investment';
    balance: number;
    currency: string;
    institution?: string;
    is_visible?: boolean;
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
    account_name?: string;
    transaction_type?: 'normal' | 'internal_transfer' | 'family_transfer';
    is_excluded?: boolean;
    creditor_name?: string;
    debtor_name?: string;
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

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    size: number;
    pages: number;
}

export async function getTransactions(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    account_id?: string;
    date_from?: string;
    date_to?: string;
    amount_type?: string;
}): Promise<PaginatedResponse<Transaction>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.account_id) searchParams.set('account_id', params.account_id);
    if (params?.date_from) searchParams.set('date_from', params.date_from);
    if (params?.date_to) searchParams.set('date_to', params.date_to);
    if (params?.amount_type) searchParams.set('amount_type', params.amount_type);

    const query = searchParams.toString();
    return fetchApi<PaginatedResponse<Transaction>>(`/transactions/${query ? `?${query}` : ''}`);
}

export async function getBalanceHistory(days: number = 30): Promise<BalanceHistory> {
    return fetchApi<BalanceHistory>(`/dashboard/balance-history?days=${days}`);
}

export async function getPortfolio(): Promise<Portfolio> {
    return fetchApi<Portfolio>('/dashboard/portfolio');
}

// Net Worth History
export interface NetWorthHistory {
    history: Array<{ date: string; bank: number; investment: number; total: number }>;
    currency: string;
}

export async function getNetWorthHistory(days: number = 30): Promise<NetWorthHistory> {
    return fetchApi<NetWorthHistory>(`/dashboard/net-worth-history?days=${days}`);
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

export async function updateAccount(id: string, data: { name?: string; is_visible?: boolean }): Promise<{ status: string; id: string }> {
    const response = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('Failed to update account');
    return response.json();
}

export async function deleteAccount(id: string): Promise<{ status: string; id: string }> {
    const response = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'DELETE',
    });

    if (!response.ok) throw new Error('Failed to delete account');
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

// API Keys management
export interface ApiKeysResponse {
    gocardless_secret_id: string | null;
    gocardless_secret_key: string | null;
    trading212_api_key: string | null;
    has_gocardless: boolean;
    has_trading212: boolean;
}

export interface ApiKeysRequest {
    gocardless_secret_id?: string;
    gocardless_secret_key?: string;
    trading212_api_key?: string;
}

export async function getApiKeys(): Promise<ApiKeysResponse> {
    return fetchApi<ApiKeysResponse>('/settings/api-keys');
}

export async function saveApiKeys(keys: ApiKeysRequest): Promise<{ status: string; updated_keys: string[] }> {
    const response = await fetch(`${API_BASE}/settings/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys),
    });

    if (!response.ok) throw new Error('Failed to save API keys');
    return response.json();
}

// Account detail
export interface AccountDetail {
    account: {
        id: string;
        name: string;
        type: string;
        balance: number;
        currency: string;
        institution: string | null;
        is_visible: boolean;
        last_synced: string | null;
    };
    transactions: Transaction[];
    total: number;
    pages: number;
    current_page: number;
}

export async function getAccountDetail(accountId: string, page: number = 1, limit: number = 20): Promise<AccountDetail> {
    return fetchApi<AccountDetail>(`/accounts/${accountId}/detail?page=${page}&limit=${limit}`);
}

// Investment portfolio (from database)
export interface InvestmentPortfolio {
    total_value: number;
    currency: string;
    last_synced: string | null;
    transactions: Array<{
        id: string;
        date: string;
        description: string;
        amount: number;
        currency: string;
        category: string;
    }>;
}

export interface PortfolioHistory {
    history: Array<{ date: string; value: number }>;
    currency: string;
}

export interface Dividend {
    date: string;
    ticker: string;
    amount: number;
    currency: string;
}

export async function getInvestmentPortfolio(): Promise<InvestmentPortfolio> {
    return fetchApi<InvestmentPortfolio>('/investments/portfolio');
}

export async function getPortfolioHistory(period: string = '1M'): Promise<PortfolioHistory> {
    return fetchApi<PortfolioHistory>(`/investments/history?period=${period}`);
}

export async function getDividends(limit: number = 50): Promise<{ dividends: Dividend[] }> {
    return fetchApi<{ dividends: Dividend[] }>(`/investments/dividends?limit=${limit}`);
}

// === Budgets & Goals ===

export interface Budget {
    id: number;
    category: string;
    amount: number;
    currency: string;
    is_active: boolean;
    spent: number;
    percentage: number;
}

export interface BudgetOverview {
    month: string;
    month_name: string;
    total_budget: number;
    total_spent: number;
    total_percentage: number;
    categories: Array<{
        category: string;
        amount: number;
        spent: number;
        percentage: number;
    }>;
    categories_count: number;
}

export interface SavingsGoal {
    id: number;
    name: string;
    target_amount: number;
    current_amount: number;
    currency: string;
    deadline: string | null;
    is_completed: boolean;
    percentage: number;
}

export async function getBudgets(): Promise<Budget[]> {
    return fetchApi<Budget[]>('/budgets/');
}

export async function getBudgetOverview(): Promise<BudgetOverview> {
    return fetchApi<BudgetOverview>('/budgets/overview');
}

export async function createBudget(data: { category: string; amount: number }): Promise<Budget> {
    const response = await fetch(`${API_BASE}/budgets/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create budget');
    return response.json();
}

export async function updateBudget(id: number, data: { category?: string; amount?: number; is_active?: boolean }): Promise<Budget> {
    const response = await fetch(`${API_BASE}/budgets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update budget');
    return response.json();
}

export async function deleteBudget(id: number): Promise<{ status: string; id: number }> {
    const response = await fetch(`${API_BASE}/budgets/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete budget');
    return response.json();
}

export async function getGoals(): Promise<SavingsGoal[]> {
    return fetchApi<SavingsGoal[]>('/budgets/goals');
}

export async function createGoal(data: { name: string; target_amount: number; deadline?: string }): Promise<SavingsGoal> {
    const response = await fetch(`${API_BASE}/budgets/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create goal');
    return response.json();
}

export async function updateGoal(id: number, data: { name?: string; target_amount?: number; current_amount?: number; add_amount?: number; deadline?: string; is_completed?: boolean }): Promise<SavingsGoal> {
    const response = await fetch(`${API_BASE}/budgets/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update goal');
    return response.json();
}

export async function deleteGoal(id: number): Promise<{ status: string; id: number }> {
    const response = await fetch(`${API_BASE}/budgets/goals/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete goal');
    return response.json();
}
