import { apiFetch, fetchApi, type PaginatedResponse } from './core';
import type { Tag } from './tags';

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

export async function getTransactions(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    categories?: string[];
    account_id?: string;
    date_from?: string;
    date_to?: string;
    amount_type?: string;
    min_amount?: number;
    max_amount?: number;
    tag_id?: number;
}): Promise<PaginatedResponse<Transaction>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.categories) params.categories.forEach(c => searchParams.append('categories', c));
    if (params?.account_id) searchParams.set('account_id', params.account_id);
    if (params?.date_from) searchParams.set('date_from', params.date_from);
    if (params?.date_to) searchParams.set('date_to', params.date_to);
    if (params?.amount_type) searchParams.set('amount_type', params.amount_type);
    if (params?.min_amount != null) searchParams.set('min_amount', params.min_amount.toString());
    if (params?.max_amount != null) searchParams.set('max_amount', params.max_amount.toString());
    if (params?.tag_id) searchParams.set('tag_id', params.tag_id.toString());

    const query = searchParams.toString();
    return fetchApi<PaginatedResponse<Transaction>>(`/transactions/${query ? `?${query}` : ''}`);
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
    const response = await apiFetch(`/transactions/${id}/share`, {
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
    const response = await apiFetch(`/transactions/${id}/exclude`, {
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
