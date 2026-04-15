'use client';

import { useState, useEffect, useRef } from 'react';
import { Transaction, TransactionDetail, getTransactionDetail } from '@/lib/api';

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
    'Internal Transfer': '🔄',
    'Family Transfer': '👨‍👩‍👧',
};

export default function TransactionList({ transactions: initialTransactions, showAccount = false, onCategoryChange }: TransactionListProps) {
    const [transactions, setTransactions] = useState(initialTransactions);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>('below');
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    const [txDetail, setTxDetail] = useState<TransactionDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [modalPickingCategory, setModalPickingCategory] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Build icon map from categories
    useEffect(() => {
        fetch(`${API_BASE}/categories/`)
            .then(res => res.json())
            .then(data => setCategories(Array.isArray(data) ? data : []))
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

    // Close modal on Escape
    useEffect(() => {
        if (!selectedTx) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedTx(null); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
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
            const response = await fetch(`${API_BASE}/transactions/${txId}/category`, {
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

    const formatDateFull = (dateStr: string) => {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('cs-CZ', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }).format(date);
    };

    // Convert Czech IBAN (CZ + 2 + 4bank + 6prefix + 10account) to human-readable account number
    const ibanToCzAccount = (iban: string): string | null => {
        if (!iban || !iban.startsWith('CZ') || iban.length !== 24) return null;
        const bankCode = iban.slice(4, 8);
        const prefix = parseInt(iban.slice(8, 14), 10);
        const account = iban.slice(14).replace(/^0+/, '') || '0';
        return prefix > 0 ? `${prefix}-${account}/${bankCode}` : `${account}/${bankCode}`;
    };

    const formatAccount = (iban: string | null | undefined): { display: string; sub: string | null } | null => {
        if (!iban) return null;
        const czAccount = ibanToCzAccount(iban);
        if (czAccount) return { display: czAccount, sub: null };
        // Non-CZ IBAN — show as-is but space every 4 chars for readability
        return { display: iban.replace(/(.{4})/g, '$1 ').trim(), sub: null };
    };

    const modalTx = selectedTx ? transactions.find(t => t.id === selectedTx.id) || selectedTx : null;

    if (transactions.length === 0) {
        return (
            <div className="glass glass-card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                <p className="text-secondary">Žádné transakce k zobrazení</p>
            </div>
        );
    }

    return (
        <>
        {/* Transaction Detail Modal */}
        {modalTx && (
            <div
                onClick={() => setSelectedTx(null)}
                style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 'var(--spacing-md)',
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="glass glass-card"
                    style={{
                        width: '100%', maxWidth: '480px',
                        padding: 'var(--spacing-xl)',
                        display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
                        position: 'relative',
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
                            {categoryIcons[modalTx.category || 'Other'] || '📋'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '1rem', wordBreak: 'break-word' }}>
                                {modalTx.amount < 0
                                    ? (modalTx.creditor_name || modalTx.description)
                                    : (modalTx.debtor_name || modalTx.creditor_name || modalTx.description)}
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
                        {/* Message / reference — full width banner if present */}
                        {(txDetail?.remittance_info && txDetail.remittance_info !== modalTx.description) && (
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-word', borderLeft: '3px solid rgba(255,255,255,0.15)' }}>
                                {txDetail.remittance_info}
                            </div>
                        )}
                        {!txDetail?.remittance_info && modalTx.description && modalTx.description !== (modalTx.amount < 0 ? modalTx.creditor_name : (modalTx.debtor_name || modalTx.creditor_name)) && (
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-word', borderLeft: '3px solid rgba(255,255,255,0.15)' }}>
                                {modalTx.description}
                            </div>
                        )}

                        {/* Parties — side by side cards */}
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
                            {/* Booking date */}
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Datum zaúčtování</div>
                                <div style={{ fontSize: '0.85rem' }}>{formatDateFull(modalTx.date)}</div>
                            </div>
                            {/* Value date or balance after */}
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
                                    <span>Kategorie</span><span style={{ opacity: 0.9, fontSize: '0.8rem' }}>✏️</span>
                                </div>
                                <div style={{ fontSize: '0.85rem' }}>
                                    {updatingId === modalTx.id ? 'Ukládám...' : `${categoryIcons[modalTx.category || 'Other'] || ''} ${modalTx.category || 'Other'}`}
                                </div>
                            </div>
                            {/* Account */}
                            {(txDetail?.account_name || modalTx.account_name) && (
                                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Účet</div>
                                    <div style={{ fontSize: '0.85rem' }}>{txDetail?.account_name || modalTx.account_name}</div>
                                </div>
                            )}
                            {/* FX rate */}
                            {txDetail?.fx_rate && (
                                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Kurz</div>
                                    <div style={{ fontSize: '0.85rem' }}>{txDetail.fx_source_currency} → {txDetail.fx_target_currency} @ {txDetail.fx_rate}</div>
                                </div>
                            )}
                            {/* Additional info */}
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
                                  { id: -1, name: 'Internal Transfer', icon: '🔄', color: '#6b7280', is_income: false, is_active: true },
                                  { id: -2, name: 'Family Transfer', icon: '👨‍👩‍👧', color: '#6b7280', is_income: false, is_active: true }
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
                                <span style={{ padding: '2px 8px', background: 'rgba(45,212,191,0.15)', border: '1px solid rgba(45,212,191,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>🔄 Interní převod</span>
                            )}
                            {modalTx.transaction_type === 'family_transfer' && (
                                <span style={{ padding: '2px 8px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>👨‍👩‍👧 Rodinný převod</span>
                            )}
                            {modalTx.is_excluded && (
                                <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vyloučeno z rozpočtu</span>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{modalTx.id}</span>
                        </div>
                    </>)}
                </div>
            </div>
        )}

        <div className="transaction-list">
            {transactions.map((tx) => {
                const isExcluded = tx.is_excluded || tx.transaction_type !== 'normal';
                return (
                    <div
                        key={tx.id}
                        className="transaction-item animate-fade-in"
                        onClick={() => { if (editingId === null) setSelectedTx(tx); }}
                        style={{
                            opacity: (isExcluded && editingId !== tx.id) ? 0.6 : 1,
                            position: 'relative',
                            zIndex: editingId === tx.id ? 50 : 1,
                            cursor: 'pointer',
                        }}
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
                                <span ref={editingId === tx.id ? dropdownRef : null} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    <span
                                        onClick={(e) => handleCategoryClick(tx.id, e)}
                                        style={{
                                            marginLeft: '8px',
                                            padding: '4px 10px',
                                            background: updatingId === tx.id
                                                ? 'rgba(255,255,255,0.1)'
                                                : '#1e293b', // Solid dark badge instead of glass
                                            border: '1px solid #334155',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            fontWeight: 500,
                                            color: '#e2e8f0', // Crisp light color
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = '#334155'}
                                        onMouseOut={(e) => e.currentTarget.style.background = updatingId === tx.id ? 'rgba(255,255,255,0.1)' : '#1e293b'}
                                    >
                                        {updatingId === tx.id ? 'Ukládám...' : (tx.category || 'Other')}
                                        <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>✏️</span>
                                    </span>

                                    {/* Category Dropdown */}
                                    {editingId === tx.id && (
                                        <div className="custom-select-dropdown animate-fade-in" style={{
                                            position: 'absolute',
                                            background: '#1e293b',
                                            border: '1px solid #334155',
                                            borderRadius: 'var(--radius-md)',
                                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.8), 0 8px 10px -6px rgba(0, 0, 0, 0.8)',
                                            zIndex: 99999,
                                            padding: '6px',
                                            ...(dropdownPosition === 'above'
                                                ? { bottom: '100%', marginBottom: '4px', top: 'auto' }
                                                : { top: '100%', marginTop: '4px' }),
                                            left: 0,
                                        }}>
                                            {[...categories.filter(c => c.is_active),
                                            { id: -1, name: 'Internal Transfer', icon: '🔄', color: '#6b7280', is_income: false, is_active: true },
                                            { id: -2, name: 'Family Transfer', icon: '👨‍👩‍👧', color: '#6b7280', is_income: false, is_active: true }
                                            ].filter((cat, index, self) => index === self.findIndex(c => c.name === cat.name)).map((cat: Category) => (
                                                <div
                                                    key={cat.name}
                                                    className={`custom-select-option ${tx.category === cat.name ? 'selected' : ''}`}
                                                    onClick={() => handleCategorySelect(tx.id, cat.name)}
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
        </>
    );
}
