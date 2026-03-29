'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import TransactionList from '@/components/TransactionList';
import StatCard from '@/components/StatCard';
import { getAccountDetail, AccountDetail } from '@/lib/api';

export default function AccountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const accountId = params.id as string;

    const [data, setData] = useState<AccountDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const detail = await getAccountDetail(accountId, page);
                setData(detail);
                setTotalPages(detail.pages);
                setTotalItems(detail.total);
            } catch (err) {
                console.error('Failed to load account:', err);
                setError('Nepodařilo se načíst účet');
            } finally {
                setLoading(false);
            }
        }

        if (accountId) {
            fetchData();
        }
    }, [accountId, page]);

    // ... (formatCurrency and formatDate functions remain same) ...

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('cs-CZ');
    };

    if (loading && !data) {
        // ... (loading spinner) ...
        return (
            <MainLayout>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100%',
                    flexDirection: 'column',
                    gap: 'var(--spacing-md)'
                }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        border: '3px solid var(--glass-border-light)',
                        borderTopColor: 'var(--accent-primary)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <span className="text-secondary">Načítám účet...</span>
                </div>
            </MainLayout>
        );
    }

    // ... (error handling) ...
    if (error || !data) {
        return (
            <MainLayout>
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    <GlassCard>
                        <h2>❌ Chyba</h2>
                        <p className="text-secondary">{error || 'Účet nenalezen'}</p>
                        <Link href="/" className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }}>
                            Zpět na dashboard
                        </Link>
                    </GlassCard>
                </div>
            </MainLayout>
        );
    }

    const { account, transactions } = data;

    return (
        <MainLayout disableScroll={true}>
            <div className="page-container" style={{ minHeight: 0 }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-lg)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {account.name}
                        </h1>
                        {!account.is_visible && (
                            <span style={{
                                fontSize: '0.75rem',
                                background: 'rgba(255,255,255,0.1)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontWeight: 500,
                                flexShrink: 0
                            }}>
                                Skrytý
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="btn"
                        style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
                    >
                        Zpět
                    </button>
                </div>

                {/* Account Info - Dashboard match */}
                <div className="dashboard-grid" style={{ marginBottom: 'var(--spacing-xl)', flexShrink: 0 }}>
                    <StatCard
                        label="ZŮSTATEK"
                        value={account.balance}
                        currency={account.currency}
                        icon="💰"
                    />

                    <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                            <span style={{ fontSize: '1.25rem' }}>🏦</span>
                            <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0, textTransform: 'uppercase', flex: 1, paddingTop: '2px' }}>Instituce</div>
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', marginTop: 'auto' }}>
                            {account.institution ? account.institution.replace(/_/g, ' ') : 'Neznámá'}
                        </div>
                    </div>

                    <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                            <span style={{ fontSize: '1.25rem' }}>🔄</span>
                            <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0, textTransform: 'uppercase', flex: 1, paddingTop: '2px' }}>Poslední synchronizace</div>
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 'auto' }}>
                            {account.last_synced ? formatDate(account.last_synced) : 'Nikdy'}
                        </div>
                    </div>
                </div>

                {/* Transactions with Pagination */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <GlassCard hover={false} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 'var(--spacing-md)',
                            flexShrink: 0,
                            flexWrap: 'wrap',
                            gap: 'var(--spacing-sm)'
                        }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                📋 Transakce <span style={{ opacity: 0.5, fontSize: '0.9rem', fontWeight: 500 }}>({totalItems})</span>
                            </h3>
                            <Link
                                href={`/transactions?account_id=${accountId}`}
                                className="btn"
                                style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}
                            >
                                Filtrovat transakce →
                            </Link>
                        </div>

                        {transactions.length === 0 ? (
                            <div style={{ padding: 'var(--spacing-xl) 0', textAlign: 'center' }}>
                                <p className="text-secondary">Zatím žádné transakce.</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', paddingBottom: 'var(--spacing-md)' }}>
                                    <TransactionList transactions={transactions} />
                                </div>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingTop: 'var(--spacing-md)',
                                        marginTop: 'auto',
                                        borderTop: '1px solid rgba(255,255,255,0.05)',
                                        flexShrink: 0,
                                        gap: '8px'
                                    }}>
                                        <button
                                            className="btn"
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            style={{ opacity: page <= 1 ? 0.3 : 1, padding: '8px 16px', fontSize: '0.9rem' }}
                                        >
                                            ← Předchozí
                                        </button>
                                        <span className="text-secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.9rem', fontWeight: 500 }}>
                                            {page} / {totalPages}
                                        </span>
                                        <button
                                            className="btn"
                                            disabled={page >= totalPages}
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            style={{ opacity: page >= totalPages ? 0.3 : 1, padding: '8px 16px', fontSize: '0.9rem' }}
                                        >
                                            Další →
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </GlassCard>
                </div>
            </div>
        </MainLayout>
    );
}
