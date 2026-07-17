'use client';

import { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Transaction, apiFetch } from '@/lib/api';
import { Icons } from '@/lib/icons';
import { getCategoryIcon } from '@/lib/category-icons';
import { getLineIcon } from '@/lib/line-icons';
import TransactionDetailModal from './TransactionDetailModal';
import { formatCurrency, getDisplayName, type Category } from './transaction-format';

interface TransactionListProps {
    transactions: Transaction[];
    showAccount?: boolean;
    onCategoryChange?: (id: string, newCategory: string) => void;
}

// Fallback icons for special categories
const FALLBACK_ICONS: Record<string, string> = {
    'Internal Transfer': Icons.category.internalTransfer,
    'Family Transfer': Icons.category.familyTransfer,
};

// Barvy pro kategorie mimo DB — stejná šedá jako v CategoryChart
const FALLBACK_COLORS: Record<string, string> = {
    'Internal Transfer': '#6b7280',
    'Family Transfer': '#6b7280',
};

export default function TransactionList({ transactions: initialTransactions, showAccount = false, onCategoryChange }: TransactionListProps) {
    const [transactions, setTransactions] = useState(initialTransactions);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

    // Build icon map from categories
    useEffect(() => {
        apiFetch(`/categories/`)
            .then(res => res.json())
            .then(data => setCategories(Array.isArray(data) ? data : []))
            .catch(err => console.error('Failed to load categories:', err));
    }, []);

    const categoryIcons: Record<string, string> = useMemo(() =>
        categories.reduce((acc, cat) => {
            acc[cat.name] = cat.icon;
            return acc;
        }, { ...FALLBACK_ICONS } as Record<string, string>),
        [categories]
    );

    // Barva kategorie (hex z DB) — decentní podbarvení ikony jako v CategoryChart
    const categoryColors: Record<string, string> = useMemo(() =>
        categories.reduce((acc, cat) => {
            if (cat.color) acc[cat.name] = cat.color;
            return acc;
        }, { ...FALLBACK_COLORS } as Record<string, string>),
        [categories]
    );

    // Návrhy protistran pro rozdělení/vypořádání — z reálně použitých hodnot,
    // seřazené podle četnosti. "Žena" jen jako fallback pro první použití.
    const counterpartySuggestions = useMemo(() => {
        const freq = new Map<string, number>();
        for (const tx of transactions) {
            const name = tx.share_counterparty?.trim();
            if (name) freq.set(name, (freq.get(name) || 0) + 1);
        }
        const names = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
        return names.length > 0 ? names : ['Žena'];
    }, [transactions]);

    // Update local state when props change. If the open transaction dropped out
    // of the new list (e.g. recategorized out of a filtered view), close the
    // modal instead of showing it frozen on stale data.
    useEffect(() => {
        setTransactions(initialTransactions);
        setSelectedTx(prev => (prev && !initialTransactions.some(t => t.id === prev.id)) ? null : prev);
    }, [initialTransactions]);

    // Group transactions by date, sorted newest first
    const { groupedByDate, sortedDates } = useMemo(() => {
        const groups: Record<string, Transaction[]> = {};
        transactions.forEach(tx => {
            if (!groups[tx.date]) groups[tx.date] = [];
            groups[tx.date].push(tx);
        });
        const sorted = Object.keys(groups).sort((a, b) => b.localeCompare(a));
        return { groupedByDate: groups, sortedDates: sorted };
    }, [transactions]);

    const getDayLabel = (dateStr: string): string => {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (dateStr === today) return 'Dnes';
        if (dateStr === yesterday) return 'Včera';
        return new Intl.DateTimeFormat('cs-CZ', {
            weekday: 'long', day: 'numeric', month: 'long',
        }).format(new Date(dateStr + 'T12:00:00'));
    };

    const getDailySummary = (txs: Transaction[]) => {
        // Mirrors backend aggregation: settlements from wife don't count as income,
        // shared expenses count only my part (my_share_amount).
        const income = txs.filter(t => !t.is_excluded && t.transaction_type === 'normal' && t.amount > 0 && !t.settlement_flag)
            .reduce((s, t) => s + t.amount, 0);
        const expense = txs.filter(t => !t.is_excluded && t.transaction_type === 'normal' && t.amount < 0)
            .reduce((s, t) => s + (t.my_share_amount != null ? -Math.min(t.my_share_amount, Math.abs(t.amount)) : t.amount), 0);
        return { income, expense };
    };

    const handleCategorySelect = async (txId: string, newCategory: string) => {
        setUpdatingId(txId);
        try {
            const response = await apiFetch(`/transactions/${txId}/category`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: newCategory, learn: true })
            });
            if (response.ok) {
                setTransactions(prev => prev.map(tx =>
                    tx.id === txId ? { ...tx, category: newCategory } : tx
                ));
                if (onCategoryChange) onCategoryChange(txId, newCategory);
            }
        } catch (err) {
            console.error('Failed to update category:', err);
        } finally {
            setUpdatingId(null);
        }
    };

    // Modal propisuje změny (share, tagy, vyřazení) zpět do seznamu — bez refetche
    const patchTx = useCallback((id: string, patch: Partial<Transaction>) => {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    }, []);

    const patchContact = useCallback((iban: string, direction: 'creditor' | 'debtor', name: string) => {
        setTransactions(prev => prev.map(tx => {
            const matches = direction === 'creditor'
                ? tx.creditor_iban === iban
                : tx.debtor_iban === iban;
            if (!matches) return tx;
            return {
                ...tx,
                creditor_name: direction === 'creditor' ? name : tx.creditor_name,
                debtor_name: direction === 'debtor' ? name : tx.debtor_name,
                counterparty_name_source: 'contact_manual',
            };
        }));
    }, []);

    const closeModal = useCallback(() => setSelectedTx(null), []);

    const modalTx = selectedTx ? transactions.find(t => t.id === selectedTx.id) || selectedTx : null;

    // useSyncExternalStore: server returns false, client returns true — gate portal until mounted
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );

    if (transactions.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-3)' }}>
                Žádné transakce k zobrazení
            </div>
        );
    }

    return (
        <>
        {mounted && modalTx && createPortal(
            <TransactionDetailModal
                tx={modalTx}
                categories={categories}
                categoryIcons={categoryIcons}
                categoryColors={categoryColors}
                counterpartySuggestions={counterpartySuggestions}
                updatingCategory={updatingId === modalTx.id}
                onCategorySelect={handleCategorySelect}
                onPatchTx={patchTx}
                onContactSaved={patchContact}
                onClose={closeModal}
            />,
            document.body,
        )}

        {/* Grouped transaction list */}
        <div className="transaction-list">
            {sortedDates.map(date => {
                const dayTxs = groupedByDate[date];
                const { income, expense } = getDailySummary(dayTxs);

                return (
                    <div key={date} className="tx-day-group">
                        {/* Day header */}
                        <div className="tx-day-header">
                            <span className="tx-day-label">{getDayLabel(date)}</span>
                            <span className="tx-day-summary">
                                {expense !== 0 && (
                                    <span className="tx-day-expense">{formatCurrency(expense)}</span>
                                )}
                                {income !== 0 && (
                                    <span className="tx-day-income">+{formatCurrency(income)}</span>
                                )}
                            </span>
                        </div>

                        {/* Transactions for this day */}
                        {dayTxs.map((tx) => {
                            const isExcluded = tx.is_excluded || tx.transaction_type !== 'normal';
                            const catIcon = getCategoryIcon(categoryIcons[tx.category || 'Other'], 18);
                            const catColor = categoryColors[tx.category || 'Other'];
                            return (
                                <div
                                    key={tx.id}
                                    className="transaction-item animate-fade-in"
                                    onClick={() => setSelectedTx(tx)}
                                    style={{
                                        opacity: isExcluded || tx.settlement_flag ? 0.55 : 1,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div className="transaction-icon" style={{
                                        position: 'relative',
                                        ...(catColor ? { background: catColor + '22', color: catColor } : {}),
                                    }}>
                                        {catIcon}
                                        {isExcluded && (
                                            <span style={{
                                                position: 'absolute', bottom: '-4px', right: '-4px',
                                                fontSize: '0.6rem', color: 'var(--text)',
                                                background: tx.transaction_type === 'internal_transfer'
                                                    ? 'rgba(45,212,191,0.3)' : 'rgba(168,85,247,0.3)',
                                                borderRadius: '50%', width: '14px', height: '14px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {tx.transaction_type === 'internal_transfer' ? getCategoryIcon(Icons.category.internalTransfer, 9) : getCategoryIcon(Icons.category.familyTransfer, 9)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="transaction-details">
                                        <div className="transaction-name">
                                            {getDisplayName(tx)}
                                        </div>
                                        <div className="transaction-meta">
                                            <span className="tx-category-label">
                                                {tx.category || 'Other'}
                                            </span>
                                            {(tx.tags ?? []).map(tag => (
                                                <span key={tag.id} className="tx-tag-label" style={{ color: tag.color ?? 'var(--text-3)' }}>
                                                    #{tag.name}
                                                </span>
                                            ))}
                                            {showAccount && tx.account_name && (
                                                <span className="tx-account-label">• {tx.account_name}</span>
                                            )}
                                            {tx.my_share_amount != null && tx.amount < 0 && (
                                                <span className="tx-account-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>• {getLineIcon('users', 11)} moje {formatCurrency(tx.my_share_amount, tx.currency)}</span>
                                            )}
                                            {tx.settlement_flag && (
                                                <span className="tx-account-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>• {getLineIcon('handshake', 11)} vypořádání</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`transaction-amount ${tx.amount >= 0 ? 'income' : 'expense'}`}
                                        style={updatingId === tx.id ? { opacity: 0.5 } : undefined}>
                                        {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
        </>
    );
}
