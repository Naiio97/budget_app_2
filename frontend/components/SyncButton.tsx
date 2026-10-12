'use client';

import { useSync } from '@/lib/use-sync';

// Malé tlačítko „Sync" — ruční synchronizace účtů s bankami
export default function SyncButton() {
    const { sync, isSyncing } = useSync();

    return (
        <button
            type="button"
            className={`dash-sync${isSyncing ? ' syncing' : ''}`}
            onClick={sync}
            disabled={isSyncing}
            title="Synchronizovat účty s bankami"
            aria-label={isSyncing ? 'Synchronizuji účty' : 'Synchronizovat účty'}
        >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
            </svg>
            <span>{isSyncing ? 'Synchronizuji…' : 'Sync'}</span>
        </button>
    );
}
