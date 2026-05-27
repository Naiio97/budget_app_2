'use client';

import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Transaction, TransactionDetail, getTransactionDetail, saveContact, apiFetch } from '@/lib/api';
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
    const [namingIban, setNamingIban] = useState<string | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [savingContact, setSavingContact] = useState(false);

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
        if (!selectedTx) { setTxDetail(null); setModalPickingCategory(false); setNamingIban(null); setNameInput(''); return; }
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
        if (iban.includes('/')) return { display: iban };
        return { display: iban.replace(/(.{4})/g, '$1 ').trim() };
    };

    const getDisplayName = (tx: Transaction): string => {
        if (tx.amount < 0) {
            return tx.creditor_name
                || formatAccount(tx.creditor_iban)?.display
                || tx.description;
        }
        return tx.debtor_name
            || formatAccount(tx.debtor_iban)?.display
            || tx.creditor_name
            || tx.description;
    };

    const handleSaveContact = async (iban: string, direction: 'creditor' | 'debtor') => {
        const trimmed = nameInput.trim();
        if (!trimmed) return;
        setSavingContact(true);
        try {
            await saveContact(iban, trimmed);
            // Update detail + list entries locally so the rename propagates without a refetch.
            setTxDetail(prev => prev && {
                ...prev,
                creditor_name: direction === 'creditor' ? trimmed : prev.creditor_name,
                debtor_name: direction === 'debtor' ? trimmed : prev.debtor_name,
                counterparty_name_source: 'contact_manual',
            });
            setTransactions(prev => prev.map(tx => {
                const matches = direction === 'creditor'
                    ? tx.creditor_iban === iban
                    : tx.debtor_iban === iban;
                if (!matches) return tx;
                return {
                    ...tx,
                    creditor_name: direction === 'creditor' ? trimmed : tx.creditor_name,
                    debtor_name: direction === 'debtor' ? trimmed : tx.debtor_name,
                    counterparty_name_source: 'contact_manual',
                };
            }));
            setNamingIban(null);
            setNameInput('');
        } catch (err) {
            console.error('Failed to save contact:', err);
        } finally {
            setSavingContact(false);
        }
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

    const modalEl = modalTx ? (
        <div onClick={() => setSelectedTx(null)} className="modal-backdrop tx-modal-overlay">
            <div onClick={e => e.stopPropagation()} className="modal tx-modal-card" style={{ maxHeight: '90vh', overflowY: 'auto' }}>

                {/* ── Hero header ── */}
                <div style={{
                    padding: '20px var(--spacing-lg) 18px',
                    background: modalTx.amount >= 0
                        ? 'linear-gradient(180deg, color-mix(in srgb, var(--pos) 12%, transparent), transparent)'
                        : 'linear-gradient(180deg, color-mix(in srgb, var(--neg) 8%, transparent), transparent)',
                    borderBottom: '0.5px solid var(--border)',
                    textAlign: 'center',
                    position: 'relative',
                }}>
                    <button onClick={() => setSelectedTx(null)} className="btn btn-icon btn-ghost"
                        style={{ position: 'absolute', top: 12, left: 12 }}>✕</button>

                    <div style={{ fontSize: '2.8rem', lineHeight: 1, marginBottom: 10 }}>
                        {categoryIcons[modalTx.category || 'Other'] || Icons.category.fallback}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 4, fontWeight: 500 }}>
                        {getDisplayName(modalTx)}
                    </div>
                    <div className="num" style={{
                        fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em',
                        color: modalTx.amount >= 0 ? 'var(--pos)' : 'var(--text)',
                    }}>
                        {modalTx.amount >= 0 ? '+' : ''}{formatCurrency(modalTx.amount, modalTx.currency)}
                    </div>
                </div>

                {/* ── Detail rows ── */}
                {detailLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl)' }}>
                        <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    </div>
                ) : (
                    <dl style={{ margin: 0 }}>
                        {/* Kategorie — kliknutí otevře picker */}
                        <div className="label-row" onClick={() => setModalPickingCategory(p => !p)}
                            style={{ cursor: 'pointer' }}>
                            <dt>Kategorie</dt>
                            <dd style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {updatingId === modalTx.id
                                    ? <span style={{ color: 'var(--text-3)' }}>Ukládám…</span>
                                    : <span className="chip chip-accent">{categoryIcons[modalTx.category || 'Other']} {modalTx.category || 'Other'}</span>
                                }
                                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{Icons.action.edit}</span>
                            </dd>
                        </div>

                        {/* Category picker */}
                        {modalPickingCategory && (
                            <div style={{ padding: '10px var(--spacing-lg)', borderBottom: '0.5px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6, background: 'var(--surface-sunken)' }}>
                                {[...categories.filter(c => c.is_active),
                                    { id: -1, name: 'Internal Transfer', icon: Icons.category.internalTransfer, color: '#6b7280', is_income: false, is_active: true },
                                    { id: -2, name: 'Family Transfer', icon: Icons.category.familyTransfer, color: '#6b7280', is_income: false, is_active: true },
                                ].filter((cat, i, self) => i === self.findIndex(c => c.name === cat.name)).map(cat => (
                                    <button key={cat.name}
                                        onClick={() => { handleCategorySelect(modalTx.id, cat.name); setModalPickingCategory(false); }}
                                        className={`chip ${modalTx.category === cat.name ? 'chip-accent' : ''}`}
                                        style={{ cursor: 'pointer', border: 'none', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {cat.icon} {cat.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="label-row">
                            <dt>Datum</dt>
                            <dd>{formatDateFull(modalTx.date)}</dd>
                        </div>

                        {txDetail?.balance_after != null && (
                            <div className="label-row">
                                <dt>Zůstatek po</dt>
                                <dd className="num">{formatCurrency(txDetail.balance_after, txDetail.balance_after_currency || modalTx.currency)}</dd>
                            </div>
                        )}
                        {!txDetail?.balance_after && txDetail?.value_date && txDetail.value_date !== modalTx.date && (
                            <div className="label-row">
                                <dt>Valuta</dt>
                                <dd>{formatDateFull(txDetail.value_date)}</dd>
                            </div>
                        )}

                        {(txDetail?.account_name || modalTx.account_name) && (
                            <div className="label-row">
                                <dt>Účet</dt>
                                <dd>{txDetail?.account_name || modalTx.account_name}</dd>
                            </div>
                        )}

                        {/* Counterparty rows */}
                        {(() => {
                            const debtorName = txDetail?.debtor_name || modalTx.debtor_name;
                            const creditorName = txDetail?.creditor_name || modalTx.creditor_name;
                            const debtorIban = txDetail?.debtor_iban || modalTx.debtor_iban || null;
                            const creditorIban = txDetail?.creditor_iban || modalTx.creditor_iban || null;
                            const nameSource = txDetail?.counterparty_name_source ?? modalTx.counterparty_name_source ?? null;
                            const isOutgoing = modalTx.amount < 0;
                            const counterpartyDir: 'creditor' | 'debtor' = isOutgoing ? 'creditor' : 'debtor';

                            const renderParty = (label: string, name: string | null | undefined, iban: string | null, dir: 'creditor' | 'debtor') => {
                                const isEditable = counterpartyDir === dir;
                                const canEdit = isEditable && (!name || nameSource === 'contact_auto' || nameSource === 'contact_manual');
                                return (
                                    <div className="label-row">
                                        <dt>{label}</dt>
                                        <dd style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontWeight: name ? 500 : 400, color: name ? 'var(--text)' : 'var(--text-3)', fontStyle: name ? 'normal' : 'italic' }}>
                                                    {name || 'Nepojmenovaná protistrana'}
                                                </span>
                                                {canEdit && namingIban !== iban && (
                                                    <button onClick={() => { setNamingIban(iban); setNameInput(name || ''); }}
                                                        style={{ fontSize: '0.72rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}>
                                                        {name ? `${Icons.action.edit} Přejmenovat` : `${Icons.action.edit} Pojmenovat`}
                                                    </button>
                                                )}
                                            </div>
                                            {iban && <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontFamily: 'monospace', fontWeight: 400 }}>{formatAccount(iban)?.display ?? iban}</span>}
                                            {iban && namingIban === iban && (
                                                <div style={{ display: 'flex', gap: 4, width: '100%' }} onClick={e => e.stopPropagation()}>
                                                    <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleSaveContact(iban, dir);
                                                            if (e.key === 'Escape') { setNamingIban(null); setNameInput(''); }
                                                        }}
                                                        placeholder="Např. Táta, Nájem, ČEZ…"
                                                        style={{ flex: 1, padding: '5px 8px', fontSize: '0.82rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', color: 'var(--text)', outline: 'none' }}
                                                    />
                                                    <button onClick={() => handleSaveContact(iban, dir)} disabled={savingContact || !nameInput.trim()}
                                                        className="btn btn-primary btn-sm">{savingContact ? '…' : 'OK'}</button>
                                                    <button onClick={() => { setNamingIban(null); setNameInput(''); }} className="btn btn-sm">✕</button>
                                                </div>
                                            )}
                                        </dd>
                                    </div>
                                );
                            };

                            const showDebtor = debtorName || (counterpartyDir === 'debtor' && debtorIban);
                            const showCreditor = creditorName || (counterpartyDir === 'creditor' && creditorIban);
                            return <>
                                {showDebtor && renderParty('Odesílatel', debtorName, debtorIban, 'debtor')}
                                {showCreditor && renderParty('Příjemce', creditorName, creditorIban, 'creditor')}
                            </>;
                        })()}

                        {txDetail?.fx_rate && (
                            <div className="label-row">
                                <dt>Kurz</dt>
                                <dd>{txDetail.fx_source_currency} → {txDetail.fx_target_currency} @ {txDetail.fx_rate}</dd>
                            </div>
                        )}
                        {(txDetail?.remittance_info || (!txDetail?.remittance_info && modalTx.description && modalTx.description !== getDisplayName(modalTx))) && (
                            <div className="label-row">
                                <dt>Zpráva</dt>
                                <dd style={{ fontWeight: 400, color: 'var(--text-2)' }}>{txDetail?.remittance_info || modalTx.description}</dd>
                            </div>
                        )}
                        {txDetail?.additional_info && (
                            <div className="label-row">
                                <dt>Poznámka</dt>
                                <dd style={{ fontWeight: 400, color: 'var(--text-2)' }}>{txDetail.additional_info}</dd>
                            </div>
                        )}

                        {/* Footer — badges + ID */}
                        <div style={{ padding: '10px var(--spacing-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span className="chip chip-success">✓ Zaúčtováno</span>
                                {modalTx.transaction_type === 'internal_transfer' && <span className="chip">{Icons.category.internalTransfer} Interní převod</span>}
                                {modalTx.transaction_type === 'family_transfer' && <span className="chip">{Icons.category.familyTransfer} Rodinný převod</span>}
                                {modalTx.is_excluded && <span className="chip">Vyloučeno z rozpočtu</span>}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>{modalTx.id}</span>
                        </div>
                    </dl>
                )}
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
