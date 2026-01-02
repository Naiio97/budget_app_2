'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import TransactionList from '@/components/TransactionList';
import GlassCard from '@/components/GlassCard';
import { Transaction, getTransactions, DashboardData, getDashboard } from '@/lib/api';

// Demo transactions
const demoTransactions: Transaction[] = [
    { id: '1', date: '2024-12-26', description: 'Lidl - nákup potravin', amount: -1250, currency: 'CZK', category: 'Food', account_id: 'demo', account_type: 'bank' },
    { id: '2', date: '2024-12-25', description: 'Výplata - prosinec', amount: 65000, currency: 'CZK', category: 'Salary', account_id: 'demo', account_type: 'bank' },
    { id: '3', date: '2024-12-24', description: 'Netflix předplatné', amount: -299, currency: 'CZK', category: 'Entertainment', account_id: 'demo', account_type: 'bank' },
    { id: '4', date: '2024-12-24', description: 'Uber - cesta do práce', amount: -185, currency: 'CZK', category: 'Transport', account_id: 'demo', account_type: 'bank' },
    { id: '5', date: '2024-12-23', description: 'Dividenda AAPL', amount: 450, currency: 'CZK', category: 'Dividend', account_id: 'trading212', account_type: 'investment' },
    { id: '6', date: '2024-12-22', description: 'Alza.cz - elektronika', amount: -4999, currency: 'CZK', category: 'Shopping', account_id: 'demo', account_type: 'bank' },
    { id: '7', date: '2024-12-21', description: 'ČEZ - elektřina', amount: -2850, currency: 'CZK', category: 'Utilities', account_id: 'demo', account_type: 'bank' },
    { id: '8', date: '2024-12-20', description: 'Pražské vodovody', amount: -650, currency: 'CZK', category: 'Utilities', account_id: 'demo', account_type: 'bank' },
    { id: '9', date: '2024-12-19', description: 'Albert hypermarket', amount: -890, currency: 'CZK', category: 'Food', account_id: 'demo', account_type: 'bank' },
    { id: '10', date: '2024-12-18', description: 'Spotify Premium', amount: -169, currency: 'CZK', category: 'Entertainment', account_id: 'demo', account_type: 'bank' },
    { id: '11', date: '2024-12-17', description: 'Benzina - palivo', amount: -1850, currency: 'CZK', category: 'Transport', account_id: 'demo', account_type: 'bank' },
    { id: '12', date: '2024-12-16', description: 'Nákup MSFT akcie', amount: -8500, currency: 'CZK', category: 'Investment', account_id: 'trading212', account_type: 'investment' },
];

const demoAccounts = [
    { id: '1', name: 'Hlavní účet', type: 'bank' as const, balance: 125420, currency: 'CZK' },
    { id: '2', name: 'Spořicí účet', type: 'bank' as const, balance: 60000, currency: 'CZK' },
    { id: '3', name: 'Trading 212', type: 'investment' as const, balance: 60360, currency: 'EUR' },
];

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState(demoAccounts);
    const [loading, setLoading] = useState(true);

    // Filters & Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedAccount, setSelectedAccount] = useState<string>('');

    const [monthlyStats, setMonthlyStats] = useState({ income: 0, expenses: 0 });

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

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
    }, [selectedCategory, selectedAccount]);

    // Fetch Data
    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const [txResponse, dashData] = await Promise.all([
                    getTransactions({
                        page,
                        limit: 20,
                        search: debouncedSearch,
                        category: selectedCategory,
                        account_id: selectedAccount
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
                // Fallback to demo data if API fails completely (optional)
                setTransactions(demoTransactions);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [page, debouncedSearch, selectedCategory, selectedAccount]);

    const categories = [
        "Food", "Transport", "Utilities", "Entertainment", "Shopping", "Salary", "Investment", "Dividend", "Other"
    ];

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency: 'CZK',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <MainLayout accounts={accounts} disableScroll={true}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
                    <div style={{
                        display: 'flex',
                        gap: 'var(--spacing-md)',
                        overflowX: 'auto',
                        paddingBottom: '4px'
                    }}>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <input
                                type="text"
                                className="input"
                                placeholder="🔍 Hledat..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                            />
                        </div>
                        <div style={{ width: '180px' }}>
                            <select
                                className="input"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                            >
                                <option value="">Všechny kategorie</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ width: '180px' }}>
                            <select
                                className="input"
                                value={selectedAccount}
                                onChange={(e) => setSelectedAccount(e.target.value)}
                                style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                            >
                                <option value="">Všechny účty</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </GlassCard>

                {/* Transaction List */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <GlassCard hover={false} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', paddingBottom: 'var(--spacing-md)' }}>
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
