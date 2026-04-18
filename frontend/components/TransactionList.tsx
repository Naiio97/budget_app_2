'use client';

import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Transaction, TransactionDetail, getTransactionDetail } from '@/lib/api';
import { Icons } from '@/lib/icons';

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

// Fallback icons for special categories
const FALLBACK_ICONS: Record<string, string> = {
    'Internal Transfer': Icons.category.internalTransfer,
    'Family Transfer': Icons.category.familyTransfer,
};

export default function TransactionList({ transactions: initialTransactions, showAccount = false, onCategoryChange }: TransactionListProps) {
    const [transactions, setTransactions] = useState(initialTransactions);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    const [txDetail, setTxDetail] = useState<TransactionDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [modalPickingCategory, setModalPickingCategory] = useState(false);

    // Build icon map from categories
    useEffect(() => {
        fetch(`${API_BASE}/categories/`)
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

    // Close modal on Escape + lock body scroll while open
    useEffect(() => {
        if (!selectedTx) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedTx(null); };
        document.addEventListener('keydown', handleKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [selectedTx]);

    // Fetch rich detail when modal opens
    useEffect(() => {
        if (!selectedTx) { setTxDetail(null); setModalPickingCategory(false); return; }
        setDetailLoading(true);
        getTransactionDetail(selectedTx.id)
            .then(setTxDetail)
            .catch(() => setTxDetail(null))
            .finally(() => setDetailLoading(false));
    }, [selectedTx]);

    // Update local state when props change
    useEffect(() => {
        setTransactions(initialTransactions);
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

    const formatCurrency = (amount: number, currency: string = 'CZK') =>
        new Intl.NumberFormat('cs-CZ', {
            style: 'currency', currency,
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        }).format(amount);

    const formatDateFull = (dateStr: string) =>
        new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateStr));

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
        const income = txs.filter(t => !t.is_excluded && t.transaction_type === 'normal' && t.amount > 0)
            .reduce((s, t) => s + t.amount, 0);
        const expense = txs.filter(t => !t.is_excluded && t.transaction_type === 'normal' && t.amount < 0)
            .reduce((s, t) => s + t.amount, 0);
        return { income, expense };
    };

    const getDisplayName = (tx: Transaction) =>
        tx.amount < 0
            ? (tx.creditor_name || tx.description)
            : (tx.debtor_name || tx.creditor_name || tx.description);

    const handleCategorySelect = async (txId: string, newCategory: string) => {
        setUpdatingId(txId);
        try {
            const response = await fetch(`${API_BASE}/transactions/${txId}/category`, {
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

    // Convert Czech IBAN to human-readable account number
    const ibanToCzAccount = (iban: string): string | null => {
        if (!iban || !iban.startsWith('CZ') || iban.length !== 24) return null;
        const bankCode = iban.slice(4, 8);
        const prefix = parseInt(iban.slice(8, 14), 10);
        const account = iban.slice(14).replace(/^0+/, '') || '0';
        return prefix > 0 ? `${prefix}-${account}/${bankCode}` : `${account}/${bankCode}`;
    };

    const formatAccount = (iban: string | null | undefined): { display: string } | null => {
        if (!iban) return null;
        const czAccount = ibanToCzAccount(iban);
        if (czAccount) return { display: czAccount };
        return { display: iban.replace(/(.{4})/g, '$1 ').trim() };
    };

    const modalTx = selectedTx ? transactions.find(t => t.id === selectedTx.id) || selectedTx : null;

    // useSyncExternalStore: server returns false, client returns true — gate portal until mounted
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );

    if (transactions.length === 0) {
        return (
            <div className="glass glass-card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                <p className="text-secondary">Žádné transakce k zobrazení</p>
            </div>
        );
    }

    const modalEl = modalTx ? (
            <div
                onClick={() => setSelectedTx(null)}
                className="tx-modal-overlay"
                style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 'var(--spacing-md)',
                    overscrollBehavior: 'contain',
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="tx-modal-card"
                    style={{
                        width: '100%', maxWidth: '480px',
                        maxHeight: '90vh', overflowY: 'auto',
                        padding: 'var(--spacing-xl)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
                        position: 'relative',
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={() => setSelectedTx(null)}
                        style={{
                            position: 'absolute', top: 'var(--spacing-md)', right: 'var(--spacing-md)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-secondary)', fontSize: '1.2rem', lineHeight: 1,
                        }}
                    >✕</button>

                    {/* Header: icon + name + amount */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)', paddingRight: 'var(--spacing-xl)' }}>
                        <div className="transaction-icon" style={{ flexShrink: 0, fontSize: '1.5rem' }}>
                            {categoryIcons[modalTx.category || 'Other'] || Icons.category.fallback}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '1rem', wordBreak: 'break-word' }}>
                                {getDisplayName(modalTx)}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {formatDateFull(modalTx.date)}
                            </div>
                        </div>
                        <div
                            className={`transaction-amount ${modalTx.amount >= 0 ? 'income' : 'expense'}`}
                            style={{ flexShrink: 0, fontSize: '1.1rem', fontWeight: 700 }}
                        >
                            {modalTx.amount >= 0 ? '+' : ''}{formatCurrency(modalTx.amount, modalTx.currency)}
                        </div>
                    </div>

                    {detailLoading && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: 'var(--spacing-md) 0' }}>
                            Načítám...
                        </div>
                    )}

                    {!detailLoading && (<>
                        {/* Message / reference */}
                        {(txDetail?.remittance_info && txDetail.remittance_info !== modalTx.description) && (
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-word', borderLeft: '3px solid rgba(255,255,255,0.15)' }}>
                                {txDetail.remittance_info}
                            </div>
                        )}
                        {!txDetail?.remittance_info && modalTx.description && modalTx.description !== getDisplayName(modalTx) && (
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-word', borderLeft: '3px solid rgba(255,255,255,0.15)' }}>
                                {modalTx.description}
                            </div>
                        )}

                        {/* Parties — side by side */}
                        {((txDetail?.creditor_name || modalTx.creditor_name) || (txDetail?.debtor_name || modalTx.debtor_name)) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                                {(txDetail?.debtor_name || modalTx.debtor_name) && (
                                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Odesílatel</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{txDetail?.debtor_name || modalTx.debtor_name}</div>
                                        {txDetail?.debtor_iban && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '3px', fontFamily: 'monospace' }}>
                                                {formatAccount(txDetail.debtor_iban)?.display ?? txDetail.debtor_iban}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {(txDetail?.creditor_name || modalTx.creditor_name) && (
                                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Příjemce</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{txDetail?.creditor_name || modalTx.creditor_name}</div>
                                        {txDetail?.creditor_iban && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '3px', fontFamily: 'monospace' }}>
                                                {formatAccount(txDetail.creditor_iban)?.display ?? txDetail.creditor_iban}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Details grid — 2 columns */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Datum zaúčtování</div>
                                <div style={{ fontSize: '0.85rem' }}>{formatDateFull(modalTx.date)}</div>
                            </div>
                            {txDetail?.balance_after != null ? (
                                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Zůstatek po transakci</div>
                                    <div style={{ fontSize: '0.85rem' }}>{formatCurrency(txDetail.balance_after, txDetail.balance_after_currency || modalTx.currency)}</div>
                                </div>
                            ) : txDetail?.value_date && txDetail.value_date !== modalTx.date ? (
                                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Datum valuta</div>
                                    <div style={{ fontSize: '0.85rem' }}>{formatDateFull(txDetail.value_date)}</div>
                                </div>
                            ) : null}
                            {/* Category — clickable, opens picker */}
                            <div
                                onClick={() => setModalPickingCategory(p => !p)}
                                style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', cursor: 'pointer', transition: 'background 0.15s' }}
                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                                onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                            >
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Kategorie</span><span style={{ opacity: 0.9, fontSize: '0.8rem' }}>{Icons.action.edit}</span>
                                </div>
                                <div style={{ fontSize: '0.85rem' }}>
                                    {updatingId === modalTx.id ? 'Ukládám...' : `${categoryIcons[modalTx.category || 'Other'] || ''} ${modalTx.category || 'Other'}`}
                                </div>
                            </div>
                            {(txDetail?.account_name || modalTx.account_name) && (
                                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Účet</div>
                                    <div style={{ fontSize: '0.85rem' }}>{txDetail?.account_name || modalTx.account_name}</div>
                                </div>
                            )}
                            {txDetail?.fx_rate && (
                                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Kurz</div>
                                    <div style={{ fontSize: '0.85rem' }}>{txDetail.fx_source_currency} → {txDetail.fx_target_currency} @ {txDetail.fx_rate}</div>
                                </div>
                            )}
                            {txDetail?.additional_info && (
                                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', gridColumn: '1 / -1' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Poznámka</div>
                                    <div style={{ fontSize: '0.85rem', wordBreak: 'break-word' }}>{txDetail.additional_info}</div>
                                </div>
                            )}
                        </div>

                        {/* Category picker */}
                        {modalPickingCategory && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)' }}>
                                {[...categories.filter(c => c.is_active),
                                  { id: -1, name: 'Internal Transfer', icon: Icons.category.internalTransfer, color: '#6b7280', is_income: false, is_active: true },
                                  { id: -2, name: 'Family Transfer', icon: Icons.category.familyTransfer, color: '#6b7280', is_income: false, is_active: true }
                                ].filter((cat, i, self) => i === self.findIndex(c => c.name === cat.name)).map(cat => (
                                    <button
                                        key={cat.name}
                                        onClick={() => { handleCategorySelect(modalTx.id, cat.name); setModalPickingCategory(false); }}
                                        style={{
                                            padding: '5px 10px', border: '1px solid',
                                            borderColor: modalTx.category === cat.name ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)',
                                            borderRadius: 'var(--radius-sm)', background: modalTx.category === cat.name ? 'rgba(255,255,255,0.12)' : 'transparent',
                                            cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)',
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                        }}
                                    >
                                        {cat.icon} {cat.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Type badges + ID — footer row */}
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            {modalTx.transaction_type === 'internal_transfer' && (
                                <span style={{ padding: '2px 8px', background: 'rgba(45,212,191,0.15)', border: '1px solid rgba(45,212,191,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>{Icons.category.internalTransfer} Interní převod</span>
                            )}
                            {modalTx.transaction_type === 'family_transfer' && (
                                <span style={{ padding: '2px 8px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>{Icons.category.familyTransfer} Rodinný převod</span>
                            )}
                            {modalTx.is_excluded && (
                                <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vyloučeno z rozpočtu</span>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{modalTx.id}</span>
                        </div>
                    </>)}
                </div>
            </div>
    ) : null;

    return (
        <>
        {mounted && modalEl && createPortal(modalEl, document.body)}

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
                            const catIcon = categoryIcons[tx.category || 'Other'] || Icons.category.fallback;
                            return (
                                <div
                                    key={tx.id}
                                    className="transaction-item animate-fade-in"
                                    onClick={() => setSelectedTx(tx)}
                                    style={{
                                        opacity: isExcluded ? 0.55 : 1,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div className="transaction-icon" style={{ position: 'relative' }}>
                                        {catIcon}
                                        {isExcluded && (
                                            <span style={{
                                                position: 'absolute', bottom: '-4px', right: '-4px',
                                                fontSize: '0.6rem',
                                                background: tx.transaction_type === 'internal_transfer'
                                                    ? 'rgba(45,212,191,0.3)' : 'rgba(168,85,247,0.3)',
                                                borderRadius: '50%', width: '14px', height: '14px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {tx.transaction_type === 'internal_transfer' ? Icons.category.internalTransfer : Icons.category.familyTransfer}
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
                                            {showAccount && tx.account_name && (
                                                <span className="tx-account-label">• {tx.account_name}</span>
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
