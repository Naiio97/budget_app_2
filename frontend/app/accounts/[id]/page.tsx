'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import TransactionList from '@/components/TransactionList';
import { getAccountDetail, AccountDetail, getDashboard } from '@/lib/api';

export default function AccountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const accountId = params.id as string;

    const [data, setData] = useState<AccountDetail | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const [detail, dashboard] = await Promise.all([
                    getAccountDetail(accountId, page),
                    getDashboard()
                ]);
                setData(detail);
                setTotalPages(detail.pages);
                setTotalItems(detail.total);
                setAccounts(dashboard.accounts);
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

    const formatCurrency = (amount: number, currency: string = 'CZK') => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

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
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-md)',
                    flexShrink: 0
                }}>
                    <button
                        onClick={() => router.back()}
                        className="btn"
                        style={{ padding: '8px 12px' }}
                    >
                        ← Zpět
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{account.name}</h1>
                    {!account.is_visible && (
                        <span style={{
                            fontSize: '0.75rem',
                            background: 'rgba(255,255,255,0.1)',
                            padding: '4px 8px',
                            borderRadius: '4px'
                        }}>
                            Skrytý
                        </span>
                    )}
                </div>

                {/* Account Info */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-md)',
                    flexShrink: 0
                }}>
                    <GlassCard>
                        <div className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                            Zůstatek
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                            {formatCurrency(account.balance, account.currency)}
                        </div>
                    </GlassCard>

                    <GlassCard>
                        <div className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                            Instituce
                        </div>
                        <div style={{ fontSize: '1.1rem' }}>
                            {account.institution || 'Neznámá'}
                        </div>
                    </GlassCard>

                    <GlassCard>
                        <div className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                            Poslední synchronizace
                        </div>
                        <div style={{ fontSize: '1.1rem' }}>
                            {account.last_synced ? formatDate(account.last_synced) : 'Nikdy'}
                        </div>
                    </GlassCard>
                </div>

                {/* Transactions with Pagination */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <GlassCard hover={false} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 'var(--spacing-md)',
                            flexShrink: 0
                        }}>
                            <h3 style={{ margin: 0 }}>📋 Transakce ({totalItems})</h3>
                            <Link
                                href={`/transactions?account_id=${accountId}`}
                                className="btn"
                                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                            >
                                Filtrovat transakce →
                            </Link>
                        </div>

                        {transactions.length === 0 ? (
                            <p className="text-secondary">Žádné transakce</p>
                        ) : (
                            <>
                                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', paddingBottom: 'var(--spacing-md)' }}>
                                    <TransactionList transactions={transactions} />
                                </div>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-lg)',
                                        paddingTop: 'var(--spacing-md)',
                                        marginTop: 'auto',
                                        borderTop: '1px solid rgba(255,255,255,0.1)',
                                        flexShrink: 0
                                    }}>
                                        <button
                                            className="btn"
                                            disabled={page <= 1}
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            style={{ opacity: page <= 1 ? 0.5 : 1 }}
                                        >
                                            ← Předchozí
                                        </button>
                                        <span className="text-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            Stránka {page} z {totalPages}
                                        </span>
                                        <button
                                            className="btn"
                                            disabled={page >= totalPages}
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            style={{ opacity: page >= totalPages ? 0.5 : 1 }}
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
