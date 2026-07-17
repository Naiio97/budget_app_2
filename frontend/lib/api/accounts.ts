import { apiFetch, fetchApi } from './core';
import type { Transaction } from './transactions';

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

export interface Institution {
    id: string;
    name: string;
    logo?: string;
}

export async function getInstitutions(country: string = 'CZ'): Promise<{ institutions: Institution[] }> {
    return fetchApi<{ institutions: Institution[] }>(`/accounts/institutions?country=${country}`);
}

export async function connectBank(institutionId: string, redirectUrl: string): Promise<{ link: string; requisition_id: string }> {
    const response = await apiFetch(`/accounts/connect/bank`, {
        method: 'POST',
        body: JSON.stringify({ institution_id: institutionId, redirect_url: redirectUrl }),
    });

    if (!response.ok) throw new Error('Failed to connect bank');
    return response.json();
}

export async function updateAccount(id: string, data: { name?: string; is_visible?: boolean }): Promise<{ status: string; id: string }> {
    const response = await apiFetch(`/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('Failed to update account');
    return response.json();
}

export async function deleteAccount(id: string): Promise<{ status: string; id: string }> {
    const response = await apiFetch(`/accounts/${id}`, {
        method: 'DELETE',
    });

    if (!response.ok) throw new Error('Failed to delete account');
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
