'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import TransactionList from '@/components/TransactionList';
import GlassCard from '@/components/GlassCard';
import CustomSelect from '@/components/CustomSelect';
import { Transaction, getTransactions, getDashboard } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface Category {
    id: number;
    name: string;
    icon: string;
    is_active: boolean;
}

export default function TransactionsPage() {
    // Filters & Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedAccount, setSelectedAccount] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [amountType, setAmountType] = useState<string>('');
    const [page, setPage] = useState(1);

    // Mobile infinite scroll
    const [mobileVisible, setMobileVisible] = useState(10);
    const [isMobile, setIsMobile] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Detect mobile
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
            setMobileVisible(10);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Compute date range from selected month
    const getDateRange = () => {
        if (!selectedMonth) return { date_from: undefined, date_to: undefined };
        const [year, month] = selectedMonth.split('-').map(Number);
        const date_from = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const date_to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        return { date_from, date_to };
    };

    const { date_from, date_to } = getDateRange();

    const txFilters = {
        page,
        search: debouncedSearch || undefined,
        category: selectedCategory || undefined,
        account_id: selectedAccount || undefined,
        date_from,
        date_to,
        amount_type: amountType || undefined,
    };

    const { data: txData, isLoading: loading } = useQuery({
        queryKey: queryKeys.transactions(txFilters),
        queryFn: () => getTransactions({ ...txFilters, limit: 20 }),
    });

    const { data: dashData } = useQuery({
        queryKey: queryKeys.dashboard,
        queryFn: getDashboard,
    });

    const { data: categoriesData = [] } = useQuery<Category[]>({
        queryKey: queryKeys.categories,
        queryFn: () =>
            fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io'}/categories/`)
                .then(r => r.json())
                .then(d => Array.isArray(d) ? d : []),
        staleTime: 5 * 60 * 1000, // kategorie se mění zřídka
    });

    const allTransactions = useMemo(() => txData?.items ?? [], [txData]);
    const totalPages = txData?.pages || 1;
    const totalItems = txData?.total || 0;
    const accounts = dashData?.accounts || [];
    const monthlyStats = dashData?.monthly || { income: 0, expenses: 0 };

    const [accumulatedTransactions, setAccumulatedTransactions] = useState<Transaction[]>([]);
    const [lastFetchedPage, setLastFetchedPage] = useState(0);

    // Accumulate transactions as pages load on mobile.
    useEffect(() => {
        if (allTransactions.length === 0) return;
        if (page === 1) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAccumulatedTransactions(allTransactions);
            setLastFetchedPage(1);
        } else if (page > lastFetchedPage) {
            setAccumulatedTransactions(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                const newItems = allTransactions.filter(t => !existingIds.has(t.id));
                return [...prev, ...newItems];
            });
            setLastFetchedPage(page);
        }
    }, [allTransactions, page, lastFetchedPage]);

    // The actual displayed transactions
    const finalDisplayTransactions = isMobile
        ? accumulatedTransactions.slice(0, mobileVisible)
        : allTransactions;

    const finalMobileHasMore = isMobile && (
        mobileVisible < accumulatedTransactions.length || page < totalPages
    );

    // Mobile: IntersectionObserver for infinite scroll
    useEffect(() => {
        if (!isMobile || loading || !sentinelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    if (mobileVisible < accumulatedTransactions.length) {
                        setMobileVisible(prev => prev + 10);
                    } else if (page < totalPages && !loading) {
                        setPage(prev => prev + 1);
                    }
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [isMobile, loading, mobileVisible, accumulatedTransactions.length, page, totalPages]);

    const getMonthOptions = () => {
        const months = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
            months.push({ value, label });
        }
        return months;
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency: 'CZK',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <MainLayout>
            <div className="page-container">
                <div style={{ marginBottom: 'var(--spacing-md)', flexShrink: 0 }}>
                    <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Transakce</h1>
                </div>

                {/* Compact Filters */}
                <GlassCard className="animate-fade-in" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)', flexShrink: 0, zIndex: 10, position: 'relative' }}>
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--spacing-md)',
                        paddingBottom: '4px'
                    }}>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <input
                                type="text"
                                className="input"
                                placeholder="🔍 Hledat..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ padding: '10px 16px', fontSize: '0.9rem' }}
                            />
                        </div>
                        <div style={{ width: '180px' }}>
                            <CustomSelect
                                options={getMonthOptions().map(m => ({
                                    value: m.value,
                                    label: m.label,
                                }))}
                                value={selectedMonth}
                                onChange={(val) => { setSelectedMonth(val); setPage(1); setMobileVisible(10); }}
                                placeholder="Všechny měsíce"
                            />
                        </div>
                        <div style={{ width: '150px' }}>
                            <CustomSelect
                                options={[
                                    { value: 'income', label: 'Příjmy', icon: '💰' },
                                    { value: 'expense', label: 'Výdaje', icon: '💸' },
                                ]}
                                value={amountType}
                                onChange={(val) => { setAmountType(val); setPage(1); setMobileVisible(10); }}
                                placeholder="Vše"
                            />
                        </div>
                        <div style={{ width: '180px' }}>
                            <CustomSelect
                                options={categoriesData.filter((c: Category) => c.is_active).map((cat: Category) => ({
                                    value: cat.name,
                                    label: cat.name,
                                    icon: cat.icon,
                                }))}
                                value={selectedCategory}
                                onChange={(val) => { setSelectedCategory(val); setPage(1); setMobileVisible(10); }}
                                placeholder="Všechny kategorie"
                                searchable={true}
                                searchPlaceholder="🔍 Hledat kategorii..."
                            />
                        </div>
                        <div style={{ width: '180px' }}>
                            <CustomSelect
                                options={accounts.map(acc => ({
                                    value: acc.id,
                                    label: acc.name,
                                }))}
                                value={selectedAccount}
                                onChange={(val) => { setSelectedAccount(val); setPage(1); setMobileVisible(10); }}
                                placeholder="Všechny účty"
                            />
                        </div>
                    </div>
                </GlassCard>

                {/* Summary Stats Bar */}
                <div className="tx-summary-bar animate-fade-in">
                    <div className="tx-summary-item">
                        <span className="tx-summary-label">Položek</span>
                        <span className="tx-summary-value">{totalItems}</span>
                    </div>
                    <div className="tx-summary-divider" />
                    <div className="tx-summary-item">
                        <span className="tx-summary-label">Příjmy</span>
                        <span className="tx-summary-value" style={{ color: 'var(--accent-success)' }}>+{formatCurrency(monthlyStats.income)}</span>
                    </div>
                    <div className="tx-summary-divider" />
                    <div className="tx-summary-item">
                        <span className="tx-summary-label">Výdaje</span>
                        <span className="tx-summary-value" style={{ color: 'var(--accent-danger)' }}>{formatCurrency(monthlyStats.expenses)}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 'calc(var(--spacing-xl) * 2)' }}>
                    <GlassCard hover={false} style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                        <div style={{ paddingBottom: 'var(--spacing-md)' }}>
                            <TransactionList transactions={finalDisplayTransactions} showAccount />
                        </div>

                        {/* Mobile: Infinite scroll sentinel + loading */}
                        {isMobile && !loading && (
                            <>
                                {finalMobileHasMore && <div ref={sentinelRef} style={{ height: '1px' }} />}
                                {!finalMobileHasMore && accumulatedTransactions.length > 0 && (
                                    <div className="tx-mobile-end">
                                        Zobrazeny všechny transakce
                                    </div>
                                )}
                            </>
                        )}
                        {isMobile && loading && page > 1 && (
                            <div className="tx-mobile-loader">
                                <div className="tx-mobile-spinner" />
                                <span>Načítám další...</span>
                            </div>
                        )}

                        {/* Desktop: Pagination Controls */}
                        {!isMobile && totalPages > 1 && (
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
                    </GlassCard>
                </div>
            </div>
        </MainLayout>
    );
}
