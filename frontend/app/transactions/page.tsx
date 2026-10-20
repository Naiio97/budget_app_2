'use client';

import { Suspense, useEffect, useState, useRef, useMemo, useReducer } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import PageLoader from '@/components/PageLoader';
import TransactionList from '@/components/TransactionList';
import CustomSelect from '@/components/CustomSelect';
import AccountsCard from '@/components/AccountsCard';
import { categoryLabel, getDisplayName } from '@/components/transaction-format';
import { Transaction, getTransactions, getDashboard, getTags, getTagSummary, apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import { getCategoryIcon } from '@/lib/category-icons';

interface Category {
    id: number;
    name: string;
    icon: string;
    is_active: boolean;
}

type TransactionAccumulatorState = {
    items: Transaction[];
    lastFetchedPage: number;
};

type TransactionAccumulatorAction = {
    transactions: Transaction[];
    page: number;
    loading: boolean;
};

function transactionAccumulatorReducer(
    state: TransactionAccumulatorState,
    action: TransactionAccumulatorAction
): TransactionAccumulatorState {
    if (action.loading) return state;
    if (action.page === 1) return { items: action.transactions, lastFetchedPage: 1 };
    if (action.transactions.length > 0 && action.page > state.lastFetchedPage) {
        const existingIds = new Set(state.items.map(t => t.id));
        const newItems = action.transactions.filter(t => !existingIds.has(t.id));
        return { items: [...state.items, ...newItems], lastFetchedPage: action.page };
    }
    return state;
}

function TransactionsPageContent() {
    const searchParams = useSearchParams();
    const initialAccount = searchParams.get('account_id') ?? '';
    // Deep-link z globálního hledání (Cmd+K): /transactions?search=lidl
    const initialSearch = searchParams.get('search') ?? '';

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedAccount, setSelectedAccount] = useState<string>(initialAccount);
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [amountType, setAmountType] = useState<string>('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [debouncedMinAmount, setDebouncedMinAmount] = useState('');
    const [debouncedMaxAmount, setDebouncedMaxAmount] = useState('');
    const [selectedTag, setSelectedTag] = useState<string>('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);

    const [mobileVisible, setMobileVisible] = useState(10);
    const [isMobile, setIsMobile] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 1200);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Nové hledání z palety, i když už na /transactions jsme — initial state
    // se podruhé nepřepočítá, URL ano
    useEffect(() => {
        const s = searchParams.get('search');
        if (s === null) return;
        const t = setTimeout(() => setSearchTerm(s), 0);
        return () => clearTimeout(t);
    }, [searchParams]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
            setMobileVisible(10);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedMinAmount(minAmount);
            setDebouncedMaxAmount(maxAmount);
            setPage(1);
            setMobileVisible(10);
        }, 500);
        return () => clearTimeout(timer);
    }, [minAmount, maxAmount]);

    const resetFilters = () => {
        setPage(1);
        setMobileVisible(10);
    };

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
        limit: pageSize,
        search: debouncedSearch || undefined,
        category: selectedCategory || undefined,
        account_id: selectedAccount || undefined,
        date_from,
        date_to,
        amount_type: amountType || undefined,
        min_amount: debouncedMinAmount !== '' ? Math.max(0, Number(debouncedMinAmount)) : undefined,
        max_amount: debouncedMaxAmount !== '' ? Math.max(0, Number(debouncedMaxAmount)) : undefined,
        tag_id: selectedTag ? Number(selectedTag) : undefined,
    };

    const { data: txData, isLoading: loading } = useQuery({
        queryKey: queryKeys.transactions(txFilters),
        queryFn: () => getTransactions(txFilters),
    });

    const { data: dashData } = useQuery({
        queryKey: queryKeys.dashboard,
        // Wrap so React Query's context object isn't passed as `includeHidden`.
        queryFn: () => getDashboard(),
    });

    const { data: categoriesData = [] } = useQuery<Category[]>({
        queryKey: queryKeys.categories,
        queryFn: () =>
            apiFetch(`/categories/`)
                .then(r => r.json())
                .then(d => Array.isArray(d) ? d : []),
        staleTime: 5 * 60 * 1000,
    });

    const { data: tagsData } = useQuery({
        queryKey: ['tags'],
        queryFn: getTags,
        staleTime: 60 * 1000,
    });
    const tags = tagsData?.tags ?? [];

    const { data: tagSummary } = useQuery({
        queryKey: ['tag-summary', selectedTag],
        queryFn: () => getTagSummary(Number(selectedTag)),
        enabled: !!selectedTag,
    });

    const allTransactions = useMemo(() => txData?.items ?? [], [txData]);
    const totalPages = txData?.pages || 1;
    const totalItems = txData?.total || 0;
    const accounts = dashData?.accounts || [];
    const rangeFrom = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
    const rangeTo = Math.min(page * pageSize, totalItems);
    const monthlyStats = dashData?.monthly || { income: 0, expenses: 0 };

    const [{ items: accumulatedTransactions }, dispatchTransactionAccumulator] = useReducer(
        transactionAccumulatorReducer,
        { items: [], lastFetchedPage: 0 }
    );

    useEffect(() => {
        dispatchTransactionAccumulator({ transactions: allTransactions, page, loading });
    }, [allTransactions, page, loading]);

    // Memoizované — nová reference při každém renderu by v TransactionList
    // resetovala lokální úpravy (kategorie, tagy) zpět na data z props.
    const finalDisplayTransactions = useMemo(
        () => isMobile ? accumulatedTransactions.slice(0, mobileVisible) : allTransactions,
        [isMobile, accumulatedTransactions, mobileVisible, allTransactions],
    );

    const finalMobileHasMore = isMobile && (
        mobileVisible < accumulatedTransactions.length || page < totalPages
    );

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


    // Export všech transakcí podle aktuálních filtrů do CSV (otevře se v Excelu)
    const [exporting, setExporting] = useState(false);
    const exportCsv = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const rows: Transaction[] = [];
            const PAGE = 1000;
            for (let p = 1; p <= 30; p++) {
                const res = await getTransactions({ ...txFilters, page: p, limit: PAGE });
                rows.push(...res.items);
                if (p >= (res.pages || 1)) break;
            }
            const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
            const lines = [
                ['Datum', 'Název', 'Kategorie', 'Účet', 'Částka', 'Měna'].join(';'),
                ...rows.map(t => [
                    t.date,
                    esc(getDisplayName(t)),
                    esc(categoryLabel(t.category)),
                    esc(t.account_name ?? ''),
                    String(t.amount).replace('.', ','),
                    t.currency,
                ].join(';')),
            ];
            const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transakce-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export se nepodařil.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <MainLayout>
            <div className="page-container" style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>

                {/* Page header */}
                <div className="page-head">
                    <div>
                        <h1>Transakce</h1>
                        <div className="sub">
                            {totalItems.toLocaleString('cs-CZ')} {totalItems === 1 ? 'transakce' : totalItems >= 2 && totalItems <= 4 ? 'transakce' : 'transakcí'} · Všechny vaše pohyby na jednom místě.
                        </div>
                    </div>
                    <div className="tx-head-actions">
                        <button className="btn" onClick={exportCsv} disabled={exporting || totalItems === 0}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
                            {exporting ? 'Exportuji…' : 'Exportovat'}
                        </button>
                    </div>
                </div>

                {/* Filter bar */}
                <div className="surface" style={{ padding: 'var(--spacing-md)', flexShrink: 0 }}>
                    {/* Row 1: search + type seg */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '1 1 200px' }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 14, pointerEvents: 'none' }}>
                                {Icons.action.search}
                            </span>
                            <input
                                type="text"
                                className="input"
                                placeholder="Hledat název, protistranu nebo poznámku…"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ paddingLeft: 36 }}
                            />
                        </div>
                        <div className="seg">
                            {([['', 'Vše'], ['income', 'Příjmy'], ['expense', 'Výdaje']] as [string, string][]).map(([val, label]) => (
                                <div
                                    key={val}
                                    className={`seg-item ${amountType === val ? 'active' : ''}`}
                                    onClick={() => { setAmountType(val); resetFilters(); }}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Row 2: dropdowns */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 160px' }}>
                            <CustomSelect
                                options={getMonthOptions().map(m => ({ value: m.value, label: m.label }))}
                                value={selectedMonth}
                                onChange={val => { setSelectedMonth(val); resetFilters(); }}
                                placeholder="Všechna období"
                            />
                        </div>
                        <div style={{ flex: '1 1 160px' }}>
                            <CustomSelect
                                options={categoriesData.filter((c: Category) => c.is_active).map((cat: Category) => ({
                                    value: cat.name,
                                    label: categoryLabel(cat.name),
                                    icon: getCategoryIcon(cat.icon, 15),
                                }))}
                                value={selectedCategory}
                                onChange={val => { setSelectedCategory(val); resetFilters(); }}
                                placeholder="Všechny kategorie"
                                searchable
                                searchPlaceholder="Hledat kategorii..."
                            />
                        </div>
                        <div style={{ flex: '1 1 160px' }}>
                            <CustomSelect
                                options={accounts.map(acc => ({ value: acc.id, label: acc.name }))}
                                value={selectedAccount}
                                onChange={val => { setSelectedAccount(val); resetFilters(); }}
                                placeholder="Všechny účty"
                            />
                        </div>
                        {tags.length > 0 && (
                            <div style={{ flex: '1 1 160px' }}>
                                <CustomSelect
                                    options={tags.map(tag => ({ value: String(tag.id), label: `#${tag.name}` }))}
                                    value={selectedTag}
                                    onChange={val => { setSelectedTag(val); resetFilters(); }}
                                    placeholder="Všechny tagy"
                                />
                            </div>
                        )}
                        <input
                            type="number"
                            className="input"
                            min={0}
                            inputMode="decimal"
                            placeholder="Od (Kč)"
                            value={minAmount}
                            onChange={e => setMinAmount(e.target.value)}
                            style={{ flex: '0 1 110px' }}
                        />
                        <input
                            type="number"
                            className="input"
                            min={0}
                            inputMode="decimal"
                            placeholder="Do (Kč)"
                            value={maxAmount}
                            onChange={e => setMaxAmount(e.target.value)}
                            style={{ flex: '0 1 110px' }}
                        />
                    </div>
                </div>

                {/* Tag summary — kolik stál "projekt" napříč kategoriemi */}
                {selectedTag && tagSummary && (
                    <div className="surface" style={{ padding: 'var(--spacing-md) var(--spacing-lg)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="chip chip-accent" style={{ fontSize: '0.85rem' }}>#{tagSummary.tag.name}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                {tagSummary.transaction_count} transakcí
                                {tagSummary.date_from && ` · ${new Date(tagSummary.date_from).toLocaleDateString('cs-CZ')} – ${tagSummary.date_to ? new Date(tagSummary.date_to).toLocaleDateString('cs-CZ') : ''}`}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--spacing-lg)', marginLeft: 'auto', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Výdaje</div>
                                <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{formatCurrency(tagSummary.total_expenses)}</div>
                            </div>
                            {tagSummary.total_income > 0 && (
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Příjmy</div>
                                    <div className="num" style={{ fontSize: 16, fontWeight: 600, color: 'var(--pos)' }}>{formatCurrency(tagSummary.total_income)}</div>
                                </div>
                            )}
                            {tagSummary.by_category.slice(0, 3).map(bc => (
                                <div key={bc.category}>
                                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{categoryLabel(bc.category)}</div>
                                    <div className="num" style={{ fontSize: 16 }}>{formatCurrency(bc.amount)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Transaction list + pravý sloupec */}
                <div className="tx-layout">
                <div className="surface tx-main">
                    <div className="card-body-nopad">
                        {loading && page === 1 ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl)' }}>
                                <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            </div>
                        ) : (
                            <TransactionList transactions={finalDisplayTransactions} showAccount variant={isMobile ? 'list' : 'table'} />
                        )}
                    </div>

                    {/* Mobile infinite scroll */}
                    {isMobile && !loading && (
                        <>
                            {finalMobileHasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
                            {!finalMobileHasMore && accumulatedTransactions.length > 0 && (
                                <div style={{ padding: 'var(--spacing-md)', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                                    Zobrazeny všechny transakce
                                </div>
                            )}
                        </>
                    )}
                    {isMobile && loading && page > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 'var(--spacing-md)', fontSize: 13, color: 'var(--text-3)' }}>
                            <div style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            Načítám další...
                        </div>
                    )}

                    {/* Desktop pagination */}
                    {!isMobile && (
                        <div className="tx-pager">
                            <span className="tx-pager-count">
                                {totalItems === 0 ? '0 transakcí' : `${rangeFrom}–${rangeTo} z ${totalItems.toLocaleString('cs-CZ')} transakcí`}
                            </span>
                            <div className="tx-pager-right">
                                <select
                                    className="tx-page-size"
                                    value={pageSize}
                                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                    aria-label="Počet na stránku"
                                >
                                    {[5, 10, 20, 50, 100].map(size => (
                                        <option key={size} value={size}>{size} na stránku</option>
                                    ))}
                                </select>
                                <button className="tx-page-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Předchozí stránka">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
                                </button>
                                <span className="tx-page-num">{page} / {totalPages}</span>
                                <button className="tx-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} aria-label="Další stránka">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {!isMobile && (
                    <aside className="dash tx-aside">
                        <div className="dash-card tx-summary">
                            <div className="dash-card-head"><h3>Souhrn transakcí</h3></div>
                            <div className="tx-summary-row">
                                <span>Příjmy</span>
                                <strong className="num pos">{formatCurrency(monthlyStats.income)}</strong>
                            </div>
                            <div className="tx-summary-row">
                                <span>Výdaje</span>
                                <strong className="num">{formatCurrency(monthlyStats.expenses)}</strong>
                            </div>
                            <div className="tx-summary-row">
                                <span>Bilance</span>
                                <strong className={`num ${monthlyStats.income - monthlyStats.expenses >= 0 ? 'pos' : 'neg'}`}>
                                    {monthlyStats.income - monthlyStats.expenses < 0 ? '−' : ''}{formatCurrency(Math.abs(monthlyStats.income - monthlyStats.expenses))}
                                </strong>
                            </div>
                            <div className="tx-summary-note">za aktuální výplatní období</div>
                        </div>
                        <AccountsCard accounts={accounts} />
                    </aside>
                )}
                </div>

            </div>
        </MainLayout>
    );
}

export default function TransactionsPage() {
    return (
        <Suspense fallback={<MainLayout><PageLoader /></MainLayout>}>
            <TransactionsPageContent />
        </Suspense>
    );
}
