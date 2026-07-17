import { apiFetch, fetchApi } from './core';

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
    const response = await apiFetch(`/settings/api-keys`, {
        method: 'POST',
        body: JSON.stringify(keys),
    });

    if (!response.ok) throw new Error('Failed to save API keys');
    return response.json();
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
    const response = await apiFetch(`/settings/share-rules`, {
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
    const response = await apiFetch(`/settings/share-rules/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete share rule');
}
