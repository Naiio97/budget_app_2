'use client';

import { useState } from 'react';
import { Transaction } from '@/lib/api';

interface TransactionListProps {
    transactions: Transaction[];
    showAccount?: boolean;
    onCategoryChange?: (id: string, newCategory: string) => void;
}

const categoryIcons: Record<string, string> = {
    'Food': '🍔',
    'Transport': '🚗',
    'Utilities': '💡',
    'Entertainment': '🎬',
    'Shopping': '🛒',
    'Salary': '💰',
    'Investment': '📈',
    'Dividend': '💵',
    'Health': '🏥',
    'Other': '📋',
};

const CATEGORIES = [
    { value: 'Food', label: '🍔 Jídlo' },
    { value: 'Transport', label: '🚗 Doprava' },
    { value: 'Utilities', label: '💡 Služby' },
    { value: 'Entertainment', label: '🎬 Zábava' },
    { value: 'Shopping', label: '🛒 Nákupy' },
    { value: 'Health', label: '🏥 Zdraví' },
    { value: 'Salary', label: '💰 Příjem' },
    { value: 'Investment', label: '📈 Investice' },
    { value: 'Other', label: '📦 Ostatní' },
];

export default function TransactionList({ transactions, showAccount = false, onCategoryChange }: TransactionListProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const formatCurrency = (amount: number, currency: string = 'CZK') => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('cs-CZ', {
            day: 'numeric',
            month: 'short',
        }).format(date);
    };

    const handleCategoryClick = (txId: string) => {
        setEditingId(editingId === txId ? null : txId);
    };

    const handleCategorySelect = async (txId: string, newCategory: string) => {
        setUpdatingId(txId);
        setEditingId(null);

        try {
            const response = await fetch(`http://localhost:8000/api/transactions/${txId}/category`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: newCategory, learn: true })
            });

            if (response.ok) {
                // Call parent callback if provided
                if (onCategoryChange) {
                    onCategoryChange(txId, newCategory);
                }
            }
        } catch (err) {
            console.error('Failed to update category:', err);
        } finally {
            setUpdatingId(null);
        }
    };

    if (transactions.length === 0) {
        return (
            <div className="glass glass-card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                <p className="text-secondary">Žádné transakce k zobrazení</p>
            </div>
        );
    }

    return (
        <div className="transaction-list">
            {transactions.map((tx) => (
                <div key={tx.id} className="transaction-item animate-fade-in">
                    <div className="transaction-icon">
                        {categoryIcons[tx.category || 'Other'] || '📋'}
                    </div>
                    <div className="transaction-details">
                        <div className="transaction-name">{tx.description}</div>
                        <div className="transaction-date">
                            {formatDate(tx.date)}
                            {showAccount && tx.account_type && (
                                <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                                    • {tx.account_name || (tx.account_type === 'bank' ? '🏦' : '📈')}
                                </span>
                            )}
                            {/* Category Badge - Clickable */}
                            <span
                                onClick={() => handleCategoryClick(tx.id)}
                                style={{
                                    marginLeft: '8px',
                                    padding: '2px 8px',
                                    background: updatingId === tx.id
                                        ? 'rgba(255,255,255,0.2)'
                                        : 'rgba(255,255,255,0.1)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    transition: 'background 0.2s'
                                }}
                            >
                                {updatingId === tx.id ? '...' : (tx.category || 'Other')}
                                <span style={{ marginLeft: '4px', fontSize: '0.6rem', opacity: 0.7 }}>✏️</span>
                            </span>

                            {/* Category Dropdown */}
                            {editingId === tx.id && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '4px',
                                    background: 'rgba(30, 30, 40, 0.98)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '8px',
                                    padding: '4px',
                                    zIndex: 100,
                                    minWidth: '150px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                                }}>
                                    {CATEGORIES.map(cat => (
                                        <div
                                            key={cat.value}
                                            onClick={() => handleCategorySelect(tx.id, cat.value)}
                                            style={{
                                                padding: '8px 12px',
                                                cursor: 'pointer',
                                                borderRadius: '4px',
                                                fontSize: '0.85rem',
                                                background: tx.category === cat.value ? 'rgba(45, 212, 191, 0.2)' : 'transparent',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = tx.category === cat.value ? 'rgba(45, 212, 191, 0.2)' : 'transparent'}
                                        >
                                            {cat.label}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={`transaction-amount ${tx.amount >= 0 ? 'income' : 'expense'}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                    </div>
                </div>
            ))}
        </div>
    );
}
