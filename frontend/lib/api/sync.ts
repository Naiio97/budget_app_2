import { apiFetch, fetchApi } from './core';
import { isDemoMode } from '../demo-mode';

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

// Historie synchronizací — per-účtové výsledky každého běhu (viz /sync/history)
export interface SyncRunAccount {
    account_id?: string;
    name: string;
    status: 'ok' | 'error';
    transactions?: number;
    error?: string;
    duration_ms?: number;
}

export interface SyncRun {
    id: number;
    started_at: string | null;
    completed_at: string | null;
    duration_s: number | null;
    status: 'running' | 'completed' | 'failed';
    accounts_synced: number;
    transactions_synced: number;
    error: string | null;
    accounts: SyncRunAccount[];
}

export async function getSyncHistory(limit = 10): Promise<{ runs: SyncRun[] }> {
    return fetchApi<{ runs: SyncRun[] }>(`/sync/history?limit=${limit}`);
}
