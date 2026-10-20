'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSyncHistory, SyncRun } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { SurfaceCard, RefreshIcon, ChevronRightIcon, AlertCircleIcon } from './shared';

// ── Sync history ──────────────────────────────────────────────
// Okno do produkce: posledních N běhů synchronizace s per-účtovým rozpadem.
// Řádek s chybou ukazuje srozumitelnou hlášku i bez rozkliknutí.
export default function SyncHistoryCard() {
    const [expanded, setExpanded] = useState<number | null>(null);
    // React Query, ať se seznam obnoví po doběhnutí syncu — handleSync
    // (tady i v MainLayoutu) invaliduje queryKeys.syncHistory.
    const { data: runs, isError: loadError } = useQuery<SyncRun[]>({
        queryKey: queryKeys.syncHistory,
        queryFn: () => getSyncHistory(5).then(d => d.runs),
        staleTime: 30_000,
    });

    const fmtTime = (iso: string | null) =>
        iso ? new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    return (
        <SurfaceCard
            title="Historie synchronizací"
            sub="Poslední běhy — co se stáhlo a proč případně něco selhalo."
            className="set-side-card"
        >
            {loadError ? (
                <div style={{ color: 'var(--neg)', fontSize: 13 }}>Historii se nepodařilo načíst.</div>
            ) : runs === undefined ? (
                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Načítám…</div>
            ) : runs.length === 0 ? (
                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Zatím žádná synchronizace.</div>
            ) : (
                <div className="set-sync-list">
                    {runs.map((run, index) => {
                        const failed = run.accounts.filter(a => a.status === 'error');
                        const bad = run.status === 'failed';
                        const warn = !bad && failed.length > 0;
                        const isOpen = expanded === run.id;
                        return (
                            <div key={run.id} className="set-sync-item">
                                <div className="set-sync-row" onClick={() => setExpanded(isOpen ? null : run.id)}>
                                    <span className={`set-sync-icon ${bad ? 'bad' : warn ? 'warn' : index === 0 ? 'ok' : ''}`}>
                                        {bad || warn ? AlertCircleIcon : RefreshIcon}
                                    </span>
                                    <div className="set-sync-copy">
                                        <strong>{fmtTime(run.started_at)}</strong>
                                        <span>
                                            {bad
                                                ? 'sync selhal'
                                                : `${run.accounts_synced} ${run.accounts_synced === 1 ? 'účet' : run.accounts_synced < 5 ? 'účty' : 'účtů'} · ${run.transactions_synced} transakcí`}
                                            {run.duration_s != null && ` · ${run.duration_s.toLocaleString('cs-CZ')} s`}
                                        </span>
                                    </div>
                                    <span className="set-sync-chevron" style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}>{ChevronRightIcon}</span>
                                </div>
                                {/* Chyby jsou vidět hned — kvůli nim ta historie existuje */}
                                {!isOpen && (failed.length > 0 || bad) && (
                                    <div className="set-sync-error">
                                        {failed.length > 0
                                            ? `${failed[0].name}: ${failed[0].error}${failed.length > 1 ? ` (+${failed.length - 1} další)` : ''}`
                                            : run.error}
                                    </div>
                                )}
                                {isOpen && (
                                    <div className="set-sync-detail">
                                        {run.accounts.length === 0 && (
                                            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                                {run.error || 'Bez detailů (starší běh před zavedením historie).'}
                                            </div>
                                        )}
                                        {run.accounts.map((acc, i) => (
                                            <div key={`${acc.account_id ?? acc.name}-${i}`} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                                <span style={{ color: acc.status === 'ok' ? 'var(--pos)' : 'var(--neg)', fontWeight: 600, flexShrink: 0 }}>
                                                    {acc.status === 'ok' ? '✓' : '✕'} {acc.name}
                                                </span>
                                                {acc.status === 'ok' ? (
                                                    <span style={{ color: 'var(--text-3)' }}>
                                                        {acc.transactions ?? 0} transakcí{acc.duration_ms != null && ` · ${(acc.duration_ms / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} s`}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--neg)' }}>{acc.error}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </SurfaceCard>
    );
}
