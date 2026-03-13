'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import TransactionList from '@/components/TransactionList';
import GlassCard from '@/components/GlassCard';
import { Transaction, getTransactions, DashboardData, getDashboard } from '@/lib/api';

interface Category {
    id: number;
    name: string;
    icon: string;
    is_active: boolean;
}

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
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

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

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
            setPage(1); // Reset to page 1 on search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [selectedCategory, selectedAccount, selectedMonth, amountType]);

    // Fetch Data
    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                // Calculate date range for selected month
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

                setTransactions(txResponse.items);
                setTotalPages(txResponse.pages);
                setTotalItems(txResponse.total);

                if (dashData.accounts.length > 0) {
                    setAccounts(dashData.accounts);
                }
                setMonthlyStats(dashData.monthly);
            } catch (err) {
                console.log('Error fetching data:', err);
                // API failed - just show empty state
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [page, debouncedSearch, selectedCategory, selectedAccount, selectedMonth, amountType]);

    // Load categories
    useEffect(() => {
        fetch('http://localhost:8000/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
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
                <div style={{ alignItems: 'baseline', marginBottom: 'var(--spacing-md)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Transakce</h1>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            {totalItems} položek • <span style={{ color: 'var(--accent-success)' }}>+{formatCurrency(monthlyStats.income)}</span> • <span>{formatCurrency(monthlyStats.expenses)}</span>
                        </div>
                    </div>
                </div>

                {/* Compact Filters */}
                <GlassCard className="animate-fade-in" style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)', flexShrink: 0 }}>
                    <div className="filters-grid">
                        <div style={{ flex: '2 1 250px' }}>
                            <input
                                type="text"
                                className="input"
                                placeholder="🔍 Hledat..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                            />
                        </div>
                        <div style={{ flex: '1 1 160px' }}>
                            <CustomSelect
                                value={selectedMonth}
                                onChange={setSelectedMonth}
                                options={[
                                    { value: '', label: 'Všechny měsíce' },
                                    ...getMonthOptions()
                                ]}
                            />
                        </div>
                        <div style={{ flex: '1 1 160px' }}>
                            <CustomSelect
                                value={amountType}
                                onChange={setAmountType}
                                options={[
                                    { value: '', label: 'Vše' },
                                    { value: 'income', label: '💰 Příjmy' },
                                    { value: 'expense', label: '💸 Výdaje' }
                                ]}
                            />
                        </div>
                        <div style={{ flex: '1 1 190px' }}>
                            <CustomSelect
                                value={selectedCategory}
                                onChange={setSelectedCategory}
                                options={[
                                    { value: '', label: 'Všechny kategorie' },
                                    ...categories.filter(c => c.is_active).map(cat => ({
                                        value: cat.name,
                                        label: <>{cat.icon} {cat.name}</>
                                    }))
                                ]}
                            />
                        </div>
                        <div style={{ flex: '1 1 160px' }}>
                            <CustomSelect
                                value={selectedAccount}
                                onChange={setSelectedAccount}
                                options={[
                                    { value: '', label: 'Všechny účty' },
                                    ...accounts.map(acc => ({
                                        value: acc.id,
                                        label: acc.name
                                    }))
                                ]}
                            />
                        </div>
                    </div>
                </GlassCard>

                {/* Transaction List */}
                <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 'calc(var(--spacing-xl) * 2)' }}>
                    <GlassCard hover={false} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ paddingBottom: 'var(--spacing-md)' }}>
                            <TransactionList transactions={transactions} showAccount />
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
                    </GlassCard>
                </div>
            </div>
        </MainLayout>
    );
}
