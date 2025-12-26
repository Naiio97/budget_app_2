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
    const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
    const [accounts, setAccounts] = useState(demoAccounts);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedAccount, setSelectedAccount] = useState<string>('');

    useEffect(() => {
        async function fetchData() {
            try {
                const [txData, dashData] = await Promise.all([
                    getTransactions({ limit: 100 }),
                    getDashboard()
                ]);
                setTransactions(txData);
                setAccounts(dashData.accounts);
            } catch (err) {
                console.log('Using demo data');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const categories = [...new Set(transactions.map(tx => tx.category).filter(Boolean))];

    const filteredTransactions = transactions.filter(tx => {
        const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !selectedCategory || tx.category === selectedCategory;
        const matchesAccount = !selectedAccount || tx.account_id === selectedAccount;
        return matchesSearch && matchesCategory && matchesAccount;
    });

    const totalIncome = filteredTransactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const totalExpenses = filteredTransactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency: 'CZK',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <MainLayout accounts={accounts}>
            <header style={{ marginBottom: 'var(--spacing-xl)' }}>
                <h1>Transakce</h1>
                <p className="text-secondary" style={{ marginTop: 'var(--spacing-sm)' }}>
                    Přehled všech vašich transakcí
                </p>
            </header>

            {/* Filters */}
            <GlassCard className="animate-fade-in" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 'var(--spacing-md)'
                }}>
                    <div>
                        <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                            Hledat
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="Název transakce..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                            Kategorie
                        </label>
                        <select
                            className="input"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                            <option value="">Všechny kategorie</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                            Účet
                        </label>
                        <select
                            className="input"
                            value={selectedAccount}
                            onChange={(e) => setSelectedAccount(e.target.value)}
                        >
                            <option value="">Všechny účty</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </GlassCard>

            {/* Summary */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-lg)'
            }}>
                <div className="glass glass-card-compact" style={{ textAlign: 'center' }}>
                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: 'var(--spacing-xs)' }}>
                        Příjmy
                    </div>
                    <div style={{ color: 'var(--accent-success)', fontWeight: 600, fontSize: '1.25rem' }}>
                        +{formatCurrency(totalIncome)}
                    </div>
                </div>
                <div className="glass glass-card-compact" style={{ textAlign: 'center' }}>
                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: 'var(--spacing-xs)' }}>
                        Výdaje
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
                        -{formatCurrency(totalExpenses)}
                    </div>
                </div>
                <div className="glass glass-card-compact" style={{ textAlign: 'center' }}>
                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: 'var(--spacing-xs)' }}>
                        Počet transakcí
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
                        {filteredTransactions.length}
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <GlassCard hover={false}>
                <TransactionList transactions={filteredTransactions} showAccount />
            </GlassCard>
        </MainLayout>
    );
}
