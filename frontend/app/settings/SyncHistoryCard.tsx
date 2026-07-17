'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSyncHistory, SyncRun } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { SurfaceCard } from './shared';

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
            className="settings-category-card"
        >
            {loadError ? (
                <div style={{ color: 'var(--neg)', fontSize: 13 }}>Historii se nepodařilo načíst.</div>
            ) : runs === undefined ? (
                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Načítám…</div>
            ) : runs.length === 0 ? (
                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Zatím žádná synchronizace.</div>
            ) : (
                <div className="settings-scroll-list">
                    {runs.map(run => {
                        const failed = run.accounts.filter(a => a.status === 'error');
                        const dotColor = run.status === 'failed' ? 'var(--neg)' : failed.length > 0 ? 'var(--warn)' : 'var(--pos)';
                        const isOpen = expanded === run.id;
                        return (
                            <div key={run.id}
                                onClick={() => setExpanded(isOpen ? null : run.id)}
                                style={{ padding: '9px 2px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, fontWeight: 510, flexShrink: 0 }}>{fmtTime(run.started_at)}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {run.status === 'failed'
                                            ? 'sync selhal'
                                            : `${run.accounts_synced} ${run.accounts_synced === 1 ? 'účet' : run.accounts_synced < 5 ? 'účty' : 'účtů'} · ${run.transactions_synced} transakcí`}
                                        {run.duration_s != null && ` · ${run.duration_s.toLocaleString('cs-CZ')} s`}
                                    </span>
                                    <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11, flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }}>›</span>
                                </div>
                                {/* Chyby jsou vidět hned — kvůli nim ta historie existuje */}
                                {!isOpen && (failed.length > 0 || run.status === 'failed') && (
                                    <div style={{ marginTop: 4, marginLeft: 16, fontSize: 12, color: 'var(--neg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {failed.length > 0
                                            ? `${failed[0].name}: ${failed[0].error}${failed.length > 1 ? ` (+${failed.length - 1} další)` : ''}`
                                            : run.error}
                                    </div>
                                )}
                                {isOpen && (
                                    <div style={{ marginTop: 6, marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
