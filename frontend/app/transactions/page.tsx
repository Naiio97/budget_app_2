'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import TransactionList from '@/components/TransactionList';
import GlassCard from '@/components/GlassCard';
import CustomSelect from '@/components/CustomSelect';
import { Transaction, getTransactions, DashboardData, getDashboard } from '@/lib/api';

interface Category {
    id: number;
    name: string;
    icon: string;
    is_active: boolean;
}

export default function TransactionsPage() {
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<{ id: string; name: string; type: 'bank' | 'investment'; balance: number; currency: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<Category[]>([]);

    // Filters & Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedAccount, setSelectedAccount] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [amountType, setAmountType] = useState<string>('');

    const [monthlyStats, setMonthlyStats] = useState({ income: 0, expenses: 0 });

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

    // Mobile infinite scroll: how many items to show
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

    // Generate last 12 months for dropdown
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

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
        setMobileVisible(10);
    }, [selectedCategory, selectedAccount, selectedMonth, amountType, debouncedSearch]);

    // Fetch Data — single unified effect, always fetches with limit=20
    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            setLoading(true);
            try {
                let date_from: string | undefined;
                let date_to: string | undefined;
                if (selectedMonth) {
                    const [year, month] = selectedMonth.split('-').map(Number);
                    date_from = `${year}-${String(month).padStart(2, '0')}-01`;
                    const lastDay = new Date(year, month, 0).getDate();
                    date_to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
                }

                const [txResponse, dashData] = await Promise.all([
                    getTransactions({
                        page,
                        limit: 20,
                        search: debouncedSearch || undefined,
                        category: selectedCategory || undefined,
                        account_id: selectedAccount || undefined,
                        date_from,
                        date_to,
                        amount_type: amountType || undefined
                    }),
                    getDashboard()
                ]);

                if (cancelled) return;

                setAllTransactions(txResponse.items);
                setTotalPages(txResponse.pages);
                setTotalItems(txResponse.total);
                if (dashData.accounts.length > 0) setAccounts(dashData.accounts);
                setMonthlyStats(dashData.monthly);
            } catch (err) {
                console.log('Error fetching data:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchData();
        return () => { cancelled = true; };
    }, [page, debouncedSearch, selectedCategory, selectedAccount, selectedMonth, amountType]);

    // On mobile: the displayed transactions are sliced from allTransactions
    const displayTransactions = isMobile
        ? allTransactions.slice(0, mobileVisible)
        : allTransactions;

    const mobileHasMore = isMobile && mobileVisible < allTransactions.length;

    // When we finish the current page's items on mobile, load the next API page
    const mobileNeedsMoreFromApi = isMobile && mobileVisible >= allTransactions.length && page < totalPages;

    // Mobile: show more items or fetch next page
    const showMoreMobile = useCallback(() => {
        if (mobileVisible < allTransactions.length) {
            // Show 10 more from already fetched items
            setMobileVisible(prev => Math.min(prev + 10, allTransactions.length));
        } else if (page < totalPages) {
            // Need to fetch next page from API
            setPage(prev => prev + 1);
        }
    }, [mobileVisible, allTransactions.length, page, totalPages]);

    // When new page of transactions is loaded, append to allTransactions
    // (We need a special handler since the effect above replaces allTransactions)
    // Actually, let's use a different approach: accumulate on mobile
    const [accumulatedTransactions, setAccumulatedTransactions] = useState<Transaction[]>([]);
    const [lastFetchedPage, setLastFetchedPage] = useState(0);

    // Accumulate transactions when page changes on mobile
    useEffect(() => {
        if (allTransactions.length === 0) return;
        if (page === 1) {
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

    // Reset accumulated on filter changes
    useEffect(() => {
        setAccumulatedTransactions([]);
        setLastFetchedPage(0);
    }, [debouncedSearch, selectedCategory, selectedAccount, selectedMonth, amountType]);

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

    // Load categories
    useEffect(() => {
        fetch(`${API_BASE}/categories/`)
            .then(res => res.json())
            .then(data => setCategories(Array.isArray(data) ? data : []))
            .catch(err => console.error('Failed to load categories:', err));
    }, []);

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
                                onChange={(val) => setSelectedMonth(val)}
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
                                onChange={(val) => setAmountType(val)}
                                placeholder="Vše"
                            />
                        </div>
                        <div style={{ width: '180px' }}>
                            <CustomSelect
                                options={categories.filter(c => c.is_active).map(cat => ({
                                    value: cat.name,
                                    label: cat.name,
                                    icon: cat.icon,
                                }))}
                                value={selectedCategory}
                                onChange={(val) => setSelectedCategory(val)}
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
                                onChange={(val) => setSelectedAccount(val)}
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
