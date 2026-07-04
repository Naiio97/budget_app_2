// Backend API client.
//
// One `apiFetch` helper is the single chokepoint for ALL backend traffic — it
// attaches the JWT from the Auth.js session, redirects to /login on 401, and
// (when demo mode is on) synthesizes a Response from mock-data.ts instead of
// touching the network. Every page hits the backend through apiFetch, so just
// flipping the demo cookie is enough to swap the whole app to canned data.

import { getSession } from "next-auth/react";
import { isDemoMode } from "./demo-mode";
import { dispatchDemoGet } from "./mock-data";

const API_BASE =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io";

// 10s cache so we don't hit getSession() on every request — it goes through
// Next.js's /api/auth/session endpoint which has its own server round-trip.
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_CACHE_MS = 10_000;

async function getBackendToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) return cachedToken;
    try {
        const session = await getSession();
        cachedToken = session?.backendToken ?? null;
    } catch {
        cachedToken = null;
    }
    tokenExpiresAt = now + TOKEN_CACHE_MS;
    return cachedToken;
}

export function clearBackendTokenCache(): void {
    cachedToken = null;
    tokenExpiresAt = 0;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body ?? {}), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function synthesizeDemoResponse(path: string, init: RequestInit): Response {
    const method = (init.method || "GET").toUpperCase();
    if (method === "GET") {
        const body = dispatchDemoGet(path);
        if (body === undefined) {
            console.warn("[DEMO] no fixture for GET", path, "— returning {}");
            return jsonResponse({});
        }
        return jsonResponse(body);
    }
    // Mutations: always synthesize a 200 OK with a permissive body so the UI
    // never gets stuck on an error. Nothing is persisted — that's the contract.
    return jsonResponse({ status: "ok", id: 1, deleted: 1 });
}

/** Single chokepoint for backend traffic. In demo mode, synthesizes a Response
 * from mock-data.ts instead of going to the network. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    if (isDemoMode()) {
        // Tiny artificial delay so loading states still get to render.
        await new Promise((r) => setTimeout(r, 60));
        return synthesizeDemoResponse(path, init);
    }
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const token = await getBackendToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        cache: init.cache ?? "no-store",
    });
    if (res.status === 401 && typeof window !== "undefined") {
        // Skip the redirect when we're already on /login — global providers
        // (AccountsProvider's getDashboard query) keep firing here while the
        // user is signed out, and bouncing /login → /login?from=<encoded URL>
        // recursively nests the URL until the address bar explodes.
        // Use just pathname (no search) so we never encode the previous from.
        const { pathname } = window.location;
        if (!pathname.startsWith("/login")) {
            window.location.href = `/login?from=${encodeURIComponent(pathname)}`;
        }
    }
    return res;
}

// Compat shim — older callers still pass a custom demoResponse; route through
// apiFetch which now handles demo synthesis itself.
async function apiMutate(path: string, init: RequestInit): Promise<Response> {
    return apiFetch(path, init);
}

export interface Account {
    id: string;
    name: string;
    type: 'bank' | 'investment';
    balance: number;
    currency: string;
    institution?: string;
    is_visible?: boolean;
    consent_expires_at?: string | null;
    last_synced?: string | null;
    last_sync_error?: string | null;
}

export interface Tag {
    id: number;
    name: string;
    color?: string | null;
    usage_count?: number;
}

export interface TagSummary {
    tag: Tag;
    transaction_count: number;
    total_expenses: number;
    total_income: number;
    net: number;
    by_category: { category: string; amount: number }[];
    date_from: string | null;
    date_to: string | null;
    currency: string;
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
    user_excluded?: boolean;
    my_share_amount?: number | null;
    settlement_flag?: boolean;
    settlement_note?: string | null;
    share_counterparty?: string | null;
    creditor_name?: string;
    debtor_name?: string;
    creditor_iban?: string | null;
    debtor_iban?: string | null;
    counterparty_name_source?: 'bank' | 'contact_auto' | 'contact_manual' | null;
    tags?: Tag[];
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
    const response = await apiFetch(endpoint);

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    return response.json();
}

export async function getDashboard(includeHidden = false): Promise<DashboardData> {
    return fetchApi<DashboardData>(`/dashboard/${includeHidden ? '?include_hidden=true' : ''}`);
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
    tag_id?: number;
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
    if (params?.tag_id) searchParams.set('tag_id', params.tag_id.toString());

    const query = searchParams.toString();
    return fetchApi<PaginatedResponse<Transaction>>(`/transactions/${query ? `?${query}` : ''}`);
}

// ── Tags ────────────────────────────────────────────────────────

export async function getTags(): Promise<{ tags: Tag[] }> {
    return fetchApi<{ tags: Tag[] }>('/tags/');
}

export async function createTag(name: string, color?: string): Promise<Tag> {
    const response = await apiMutate('/tags/', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Failed to create tag');
    return response.json();
}

export async function updateTag(id: number, name: string, color?: string): Promise<void> {
    const response = await apiMutate(`/tags/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color }),
    });
    if (!response.ok) throw new Error('Failed to update tag');
}

export async function deleteTag(id: number): Promise<void> {
    const response = await apiMutate(`/tags/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete tag');
}

export async function getTagSummary(id: number): Promise<TagSummary> {
    return fetchApi<TagSummary>(`/tags/${id}/summary`);
}

export async function setTransactionTags(transactionId: string, tagIds: number[]): Promise<{ id: string; tags: Tag[] }> {
    const response = await apiMutate(`/transactions/${transactionId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tag_ids: tagIds }),
    });
    if (!response.ok) throw new Error('Failed to set transaction tags');
    return response.json();
}

// ── Push notifications ──────────────────────────────────────────

export async function getVapidPublicKey(): Promise<string> {
    const data = await fetchApi<{ key: string }>('/notifications/vapid-public-key');
    return data.key;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
    const response = await apiMutate('/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
    });
    if (!response.ok) throw new Error('Failed to subscribe to push notifications');
}

export async function unsubscribePush(endpoint: string): Promise<void> {
    const response = await apiMutate('/notifications/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
    });
    if (!response.ok) throw new Error('Failed to unsubscribe from push notifications');
}

export async function sendTestPush(): Promise<{ sent: number }> {
    const response = await apiMutate('/notifications/test', { method: 'POST' });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Failed to send test notification');
    return response.json();
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

export interface Institution {
    id: string;
    name: string;
    logo?: string;
}

export async function getInstitutions(country: string = 'CZ'): Promise<{ institutions: Institution[] }> {
    return fetchApi<{ institutions: Institution[] }>(`/accounts/institutions?country=${country}`);
}

export async function connectBank(institutionId: string, redirectUrl: string): Promise<{ link: string; requisition_id: string }> {
    const response = await apiMutate(`/accounts/connect/bank`, {
        method: 'POST',
        body: JSON.stringify({ institution_id: institutionId, redirect_url: redirectUrl }),
    });

    if (!response.ok) throw new Error('Failed to connect bank');
    return response.json();
}

export async function updateAccount(id: string, data: { name?: string; is_visible?: boolean }): Promise<{ status: string; id: string }> {
    const response = await apiMutate(`/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('Failed to update account');
    return response.json();
}

export async function deleteAccount(id: string): Promise<{ status: string; id: string }> {
    const response = await apiMutate(`/accounts/${id}`, {
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
    syncs_today: number;
}

export interface SyncResult {
    status: 'completed' | 'failed';
    accounts_synced: number;
    transactions_synced: number;
    failed_accounts?: string[];
    error?: string | null;
}

export async function syncData(): Promise<SyncResult> {
    if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 1000));
        return { status: 'completed', accounts_synced: 3, transactions_synced: 42 };
    }
    const response = await apiFetch(`/sync/`, {
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
    const response = await apiMutate(`/settings/api-keys`, {
        method: 'POST',
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

export interface InvestmentPortfolioDetail {
    total_value: number;
    invested: number;
    result: number;
    cash_free: number;
    currency: string;
    last_synced: string | null;
}

export async function getPortfolioDetail(): Promise<InvestmentPortfolioDetail> {
    return fetchApi<InvestmentPortfolioDetail>('/investments/portfolio-detail');
}

export interface PortfolioPosition {
    ticker: string;
    quantity: number;
    average_price_eur: number;
    current_price_eur: number;
    value_czk: number;
    invested_czk: number;
    ppl_czk: number;
    ppl_pct: number;
}

export async function getPositions(): Promise<{ positions: PortfolioPosition[]; currency: string }> {
    return fetchApi<{ positions: PortfolioPosition[]; currency: string }>('/investments/positions');
}

export interface PieInstrument {
    ticker: string;
    current_share: number;  // percentage
    value_czk: number;
    result_czk: number;
}

export interface Pie {
    id: number;
    name: string;
    icon: string;
    goal: number | null;
    invested_czk: number;
    value_czk: number;
    result_czk: number;
    result_pct: number;
    instruments: PieInstrument[];
}

export async function getPies(): Promise<{ pies: Pie[]; currency: string }> {
    return fetchApi<{ pies: Pie[]; currency: string }>('/investments/pies');
}

export interface TransactionDetail {
    id: string;
    date: string;
    value_date: string | null;
    booking_date_time: string | null;
    description: string;
    amount: number;
    currency: string;
    category: string | null;
    account_id: string;
    account_name: string | null;
    account_type: string;
    transaction_type: string;
    is_excluded: boolean;
    user_excluded: boolean;
    my_share_amount: number | null;
    settlement_flag: boolean;
    settlement_note: string | null;
    share_counterparty: string | null;
    creditor_name: string | null;
    debtor_name: string | null;
    creditor_iban: string | null;
    debtor_iban: string | null;
    counterparty_name_source: 'bank' | 'contact_auto' | 'contact_manual' | null;
    remittance_info: string | null;
    end_to_end_id: string | null;
    bank_tx_code: string | null;
    additional_info: string | null;
    balance_after: number | null;
    balance_after_currency: string | null;
    fx_rate: string | null;
    fx_source_currency: string | null;
    fx_target_currency: string | null;
}

export async function getTransactionDetail(id: string): Promise<TransactionDetail> {
    return fetchApi<TransactionDetail>(`/transactions/${id}`);
}

// === Shared costs & settlement (VYLEPSENI.md 3.1) ===

export interface TransactionShare {
    my_share_amount: number | null;
    settlement_flag: boolean;
    settlement_note: string | null;
    share_counterparty?: string | null;
}

export interface TransactionShareResult extends TransactionShare {
    transaction_type?: 'normal' | 'internal_transfer' | 'family_transfer';
    is_excluded?: boolean;
    category?: string;
}

export async function updateTransactionShare(id: string, share: TransactionShare): Promise<TransactionShareResult> {
    const response = await apiMutate(`/transactions/${id}/share`, {
        method: 'PATCH',
        body: JSON.stringify(share),
    });
    if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || 'Failed to update transaction share');
    }
    return response.json();
}

export async function setTransactionExcluded(id: string, excluded: boolean): Promise<{ id: string; user_excluded: boolean; is_excluded: boolean }> {
    const response = await apiMutate(`/transactions/${id}/exclude`, {
        method: 'PATCH',
        body: JSON.stringify({ excluded }),
    });
    if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || 'Failed to update transaction exclusion');
    }
    return response.json();
}

export interface SettlementTxSnippet {
    id: string;
    date: string;
    description: string;
    amount: number;
    currency: string;
    category: string | null;
    my_share_amount: number | null;
    their_amount: number | null;
    note: string | null;
    counterparty: string | null;
}

export interface SettlementSummary {
    total_owed: number;
    total_received: number;
    balance: number;
    counterparties: Array<{ name: string | null; owed: number; received: number; balance: number }>;
    months: Array<{ month: string; owed: number; received: number }>;
    expenses: SettlementTxSnippet[];
    settlements: SettlementTxSnippet[];
    currency: string;
}

export async function getSettlementSummary(months = 12): Promise<SettlementSummary> {
    return fetchApi<SettlementSummary>(`/transactions/settlement-summary?months=${months}`);
}

export interface ShareRule {
    id: number;
    pattern: string;
    my_percentage: number | null;
    my_amount_override: number | null;
    counterparty: string | null;
    note: string | null;
    is_active: boolean;
    match_count: number;
}

export async function getShareRules(): Promise<ShareRule[]> {
    const data = await fetchApi<{ rules: ShareRule[] }>(`/settings/share-rules`);
    return data.rules || [];
}

export async function createShareRule(rule: {
    pattern: string;
    my_percentage?: number | null;
    my_amount_override?: number | null;
    counterparty?: string | null;
    note?: string | null;
    apply_retroactively?: boolean;
}): Promise<{ rule: ShareRule; applied_to: number }> {
    const response = await apiMutate(`/settings/share-rules`, {
        method: 'POST',
        body: JSON.stringify(rule),
    });
    if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || 'Failed to create share rule');
    }
    return response.json();
}

export async function deleteShareRule(id: number): Promise<void> {
    const response = await apiMutate(`/settings/share-rules/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete share rule');
}

// === Contacts (IBAN address book) ===

export interface Contact {
    iban: string;
    name: string;
    source: 'auto' | 'manual';
    note?: string | null;
}

export async function saveContact(iban: string, name: string, note?: string): Promise<Contact> {
    const response = await apiMutate(`/contacts/${encodeURIComponent(iban)}`, {
        method: 'PUT',
        body: JSON.stringify({ name, note: note ?? null }),
    });
    if (!response.ok) throw new Error('Failed to save contact');
    return response.json();
}

export async function deleteContact(iban: string): Promise<{ deleted: string }> {
    const response = await apiMutate(`/contacts/${encodeURIComponent(iban)}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete contact');
    return response.json();
}

// === Budgets & Goals ===

export interface DailySpendingPoint {
    day: number;
    spent: number;
}

export interface Budget {
    id: number;
    category: string;
    amount: number;
    currency: string;
    is_active: boolean;
    spent: number;
    percentage: number;
    // Tempo utrácení — jen v GET /budgets/ (create/update vrací defaulty)
    projected: number;
    days_elapsed: number;
    days_in_month: number;
    daily_cumulative: DailySpendingPoint[];
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
    const response = await apiMutate(`/budgets/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create budget');
    return response.json();
}

export async function updateBudget(id: number, data: { category?: string; amount?: number; is_active?: boolean }): Promise<Budget> {
    const response = await apiMutate(`/budgets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update budget');
    return response.json();
}

export async function deleteBudget(id: number): Promise<{ status: string; id: number }> {
    const response = await apiMutate(`/budgets/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete budget');
    return response.json();
}

export async function getGoals(): Promise<SavingsGoal[]> {
    return fetchApi<SavingsGoal[]>('/budgets/goals');
}

export async function createGoal(data: { name: string; target_amount: number; deadline?: string }): Promise<SavingsGoal> {
    const response = await apiMutate(`/budgets/goals`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create goal');
    return response.json();
}

export async function updateGoal(id: number, data: { name?: string; target_amount?: number; current_amount?: number; add_amount?: number; deadline?: string; is_completed?: boolean }): Promise<SavingsGoal> {
    const response = await apiMutate(`/budgets/goals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update goal');
    return response.json();
}

export async function deleteGoal(id: number): Promise<{ status: string; id: number }> {
    const response = await apiMutate(`/budgets/goals/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete goal');
    return response.json();
}

// === Manual Investments ===

export interface ManualInvestmentPosition {
    id: number;
    name: string;
    quantity: number | null;
    avg_buy_price: number | null;
    current_value: number;
    currency: string;
    note: string | null;
    invested: number | null;
    pnl: number | null;
    pnl_pct: number | null;
}

export interface ManualInvestmentAccount {
    id: number;
    name: string;
    currency: string;
    note: string | null;
    is_visible: boolean;
    total_value: number;
    invested: number;
    pnl: number;
    pnl_pct: number;
    positions: ManualInvestmentPosition[];
}

export interface ManualInvestmentHistoryPoint {
    date: string;
    value: number;
}

export async function getManualInvestments(): Promise<ManualInvestmentAccount[]> {
    const r = await apiFetch(`/manual-investments/`);
    if (!r.ok) throw new Error('Failed to fetch manual investments');
    return r.json();
}

export async function getManualInvestment(id: number): Promise<ManualInvestmentAccount> {
    const r = await apiFetch(`/manual-investments/${id}`);
    if (!r.ok) throw new Error('Failed to fetch manual investment');
    return r.json();
}

export async function createManualInvestment(data: { name: string; currency?: string; note?: string }): Promise<ManualInvestmentAccount> {
    const r = await apiMutate(`/manual-investments/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to create manual investment');
    return r.json();
}

export async function updateManualInvestment(id: number, data: { name?: string; currency?: string; note?: string; is_visible?: boolean }): Promise<ManualInvestmentAccount> {
    const r = await apiMutate(`/manual-investments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to update manual investment');
    return r.json();
}

export async function deleteManualInvestment(id: number): Promise<void> {
    const r = await apiMutate(`/manual-investments/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete manual investment');
}

export async function getManualInvestmentHistory(id: number): Promise<ManualInvestmentHistoryPoint[]> {
    const r = await apiFetch(`/manual-investments/${id}/history`);
    if (!r.ok) throw new Error('Failed to fetch history');
    return r.json();
}

export async function createManualInvestmentPosition(accountId: number, data: { name: string; quantity?: number | null; avg_buy_price?: number | null; current_value: number; currency?: string; note?: string | null }): Promise<ManualInvestmentPosition> {
    const r = await apiMutate(`/manual-investments/${accountId}/positions`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to create position');
    return r.json();
}

export async function updateManualInvestmentPosition(accountId: number, positionId: number, data: { name?: string; quantity?: number | null; avg_buy_price?: number | null; current_value?: number; currency?: string; note?: string | null }): Promise<ManualInvestmentPosition> {
    const r = await apiMutate(`/manual-investments/${accountId}/positions/${positionId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to update position');
    return r.json();
}

export async function deleteManualInvestmentPosition(accountId: number, positionId: number): Promise<void> {
    const r = await apiMutate(`/manual-investments/${accountId}/positions/${positionId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete position');
}

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
    const r = await apiMutate('/loans/', { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to create loan');
    return r.json();
}

export async function updateLoan(id: number, data: Partial<LoanCreateInput> & { is_active?: boolean }): Promise<Loan> {
    const r = await apiMutate(`/loans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to update loan');
    return r.json();
}

export async function deleteLoan(id: number): Promise<{ status: string; id: number }> {
    const r = await apiMutate(`/loans/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete loan');
    return r.json();
}

export async function toggleLoanPayment(loanId: number, paymentId: number, isPaid: boolean): Promise<LoanPayment> {
    const r = await apiMutate(`/loans/${loanId}/payments/${paymentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_paid: isPaid }),
    });
    if (!r.ok) throw new Error('Failed to update payment');
    return r.json();
}

// === Subscriptions ===

export interface Subscription {
    id: number;
    name: string;
    merchant_pattern: string;
    amount: number;
    currency: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    category: string | null;
    first_seen_date: string | null;
    note: string | null;
    is_active: boolean;
    my_percentage: number;
    my_amount_override: number | null;
    my_amount: number;
    monthly_equivalent: number;
    yearly_cost: number;
    my_monthly_equivalent: number;
    my_yearly_cost: number;
    last_charged_date: string | null;
    last_amount: number | null;
    charges_count: number;
    next_due_date: string | null;
    renewing_soon: boolean;
    is_stale: boolean;
    price_change_from: number | null;
    price_change_to: number | null;
    contribution_pattern: string | null;
    last_contribution_date: string | null;
    last_contribution_amount: number | null;
    contribution_received_this_period: boolean | null;
}

export interface DetectedSubscription {
    name: string;
    merchant_pattern: string;
    amount: number;
    currency: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    category: string | null;
    occurrences: number;
    avg_interval_days: number;
    first_seen_date: string;
    last_charged_date: string;
    next_due_estimate: string;
}

export interface SubscriptionsSummary {
    active_count: number;
    monthly_total: number;
    yearly_total: number;
    my_monthly_total: number;
    my_yearly_total: number;
    currency: string;
}

export interface SubscriptionCreateInput {
    name: string;
    merchant_pattern: string;
    amount: number;
    currency?: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    category?: string | null;
    first_seen_date?: string | null;
    note?: string | null;
    my_percentage?: number | null;
    my_amount_override?: number | null;
    contribution_pattern?: string | null;
}

export async function getSubscriptions(): Promise<Subscription[]> {
    return fetchApi<Subscription[]>('/subscriptions/');
}

export async function getSubscriptionsSummary(): Promise<SubscriptionsSummary> {
    return fetchApi<SubscriptionsSummary>('/subscriptions/summary');
}

export async function detectSubscriptions(): Promise<DetectedSubscription[]> {
    return fetchApi<DetectedSubscription[]>('/subscriptions/detect');
}

export async function createSubscription(data: SubscriptionCreateInput): Promise<Subscription> {
    const r = await apiMutate('/subscriptions/', { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to create subscription');
    return r.json();
}

export async function updateSubscription(id: number, data: Partial<SubscriptionCreateInput> & { is_active?: boolean }): Promise<Subscription> {
    const r = await apiMutate(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to update subscription');
    return r.json();
}

export async function deleteSubscription(id: number): Promise<{ status: string; id: number }> {
    const r = await apiMutate(`/subscriptions/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete subscription');
    return r.json();
}
