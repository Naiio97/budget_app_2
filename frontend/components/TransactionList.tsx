'use client';

import { useState, useEffect, useRef } from 'react';
import { Transaction } from '@/lib/api';

interface TransactionListProps {
    transactions: Transaction[];
    showAccount?: boolean;
    onCategoryChange?: (id: string, newCategory: string) => void;
}

interface Category {
    id: number;
    name: string;
    icon: string;
    color: string;
    is_income: boolean;
    is_active: boolean;
}

// Fallback icons for special categories
const FALLBACK_ICONS: Record<string, string> = {
    'Internal Transfer': '🔄',
    'Family Transfer': '👨‍👩‍👧',
};

export default function TransactionList({ transactions: initialTransactions, showAccount = false, onCategoryChange }: TransactionListProps) {
    const [transactions, setTransactions] = useState(initialTransactions);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>('below');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Load categories from API
    useEffect(() => {
        fetch('http://localhost:8000/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error('Failed to load categories:', err));
    }, []);

    // Build icon map from categories
    const categoryIcons: Record<string, string> = categories.reduce((acc, cat) => {
        acc[cat.name] = cat.icon;
        return acc;
    }, { ...FALLBACK_ICONS } as Record<string, string>);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setEditingId(null);
            }
        };

        if (editingId) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [editingId]);

    // Update local state when props change
    useEffect(() => {
        setTransactions(initialTransactions);
    }, [initialTransactions]);

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

    const handleCategoryClick = (txId: string, event: React.MouseEvent) => {
        if (editingId === txId) {
            setEditingId(null);
        } else {
            // Calculate if dropdown should appear above or below
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = 280; // Approximate dropdown height

            setDropdownPosition(spaceBelow < dropdownHeight ? 'above' : 'below');
            setEditingId(txId);
        }
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
                // Update local state immediately
                setTransactions(prev => prev.map(tx =>
                    tx.id === txId ? { ...tx, category: newCategory } : tx
                ));

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
            {transactions.map((tx) => {
                const isExcluded = tx.is_excluded || tx.transaction_type !== 'normal';
                return (
                    <div
                        key={tx.id}
                        className="transaction-item animate-fade-in"
                        style={{ opacity: isExcluded ? 0.6 : 1 }}
                    >
                        <div className="transaction-icon" style={{ position: 'relative' }}>
                            {categoryIcons[tx.category || 'Other'] || '📋'}
                            {isExcluded && (
                                <span style={{
                                    position: 'absolute',
                                    bottom: '-4px',
                                    right: '-4px',
                                    fontSize: '0.6rem',
                                    background: tx.transaction_type === 'internal_transfer' ? 'rgba(45, 212, 191, 0.3)' : 'rgba(168, 85, 247, 0.3)',
                                    borderRadius: '50%',
                                    width: '14px',
                                    height: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {tx.transaction_type === 'internal_transfer' ? '🔄' : '👨‍👩‍👧'}
                                </span>
                            )}
                        </div>
                        <div className="transaction-details">
                            <div className="transaction-name">
                                {/* Prefer creditor_name for outgoing payments, debtor_name for incoming, fallback to description */}
                                {tx.amount < 0
                                    ? (tx.creditor_name || tx.description)
                                    : (tx.debtor_name || tx.creditor_name || tx.description)
                                }
                            </div>
                            <div className="transaction-date">
                                {formatDate(tx.date)}
                                {showAccount && tx.account_type && (
                                    <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                                        • {tx.account_name || (tx.account_type === 'bank' ? '🏦' : '📈')}
                                    </span>
                                )}
                                {/* Category Badge - Clickable */}
                                <span ref={editingId === tx.id ? dropdownRef : null} style={{ position: 'relative', display: 'inline-block' }}>
                                    <span
                                        onClick={(e) => handleCategoryClick(tx.id, e)}
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
                                            ...(dropdownPosition === 'above'
                                                ? { bottom: '100%', marginBottom: '4px' }
                                                : { top: '100%', marginTop: '4px' }),
                                            left: 0,
                                            background: 'rgba(30, 30, 40, 0.98)',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: '8px',
                                            padding: '4px',
                                            zIndex: 100,
                                            minWidth: '180px',
                                            maxHeight: '250px',
                                            overflowY: 'auto',
                                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                                        }}>
                                            {[...categories.filter(c => c.is_active),
                                            { id: -1, name: 'Internal Transfer', icon: '🔄', color: '#6b7280', is_income: false, is_active: true },
                                            { id: -2, name: 'Family Transfer', icon: '👨‍👩‍👧', color: '#6b7280', is_income: false, is_active: true }
                                            ].map((cat: Category) => (
                                                <div
                                                    key={cat.name}
                                                    onClick={() => handleCategorySelect(tx.id, cat.name)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        cursor: 'pointer',
                                                        borderRadius: '4px',
                                                        fontSize: '0.85rem',
                                                        background: tx.category === cat.name ? 'rgba(45, 212, 191, 0.2)' : 'transparent',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = tx.category === cat.name ? 'rgba(45, 212, 191, 0.2)' : 'transparent'}
                                                >
                                                    {cat.icon} {cat.name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </span>
                            </div>
                        </div>
                        <div className={`transaction-amount ${tx.amount >= 0 ? 'income' : 'expense'}`}>
                            {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
