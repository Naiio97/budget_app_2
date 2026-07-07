'use client';

import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Transaction, TransactionDetail, TransactionShare, Tag, getTransactionDetail, saveContact, updateTransactionShare, setTransactionExcluded, createShareRule, getTags, createTag, setTransactionTags, apiFetch } from '@/lib/api';
import { Icons } from '@/lib/icons';
import { getCategoryIcon } from '@/lib/category-icons';
import { getLineIcon } from '@/lib/line-icons';

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
    const [modalPickingTags, setModalPickingTags] = useState(false);
    const [allTags, setAllTags] = useState<Tag[] | null>(null);
    const [newTagName, setNewTagName] = useState('');
    const [savingTags, setSavingTags] = useState(false);
    const [namingIban, setNamingIban] = useState<string | null>(null);
    const [nameInput, setNameInput] = useState('');
    const [savingContact, setSavingContact] = useState(false);
    // Shared cost / settlement (VYLEPSENI.md 3.1)
    const [shareEditing, setShareEditing] = useState(false);
    const [shareInput, setShareInput] = useState('');
    const [shareNoteInput, setShareNoteInput] = useState('');
    const [shareCounterpartyInput, setShareCounterpartyInput] = useState('');
    const [shareLearnRule, setShareLearnRule] = useState(false);
    const [savingShare, setSavingShare] = useState(false);
    const [savingExclude, setSavingExclude] = useState(false);
    // Bottom sheet na telefonu: švihnutí dolů zavře detail. Táhne se jen
    // když je vnitřní scroll úplně nahoře, jinak gesto patří scrollování.
    const [sheetDrag, setSheetDrag] = useState({ y: 0, dragging: false });
    const sheetScrollRef = useRef<HTMLDivElement>(null);
    const sheetDragStartY = useRef<number | null>(null);

    const onSheetTouchStart = (e: React.TouchEvent) => {
        if (window.innerWidth > 680) return;
        if ((sheetScrollRef.current?.scrollTop ?? 0) > 0) return;
        sheetDragStartY.current = e.touches[0].clientY;
        setSheetDrag({ y: 0, dragging: true });
    };
    const onSheetTouchMove = (e: React.TouchEvent) => {
        if (sheetDragStartY.current === null) return;
        const dy = e.touches[0].clientY - sheetDragStartY.current;
        setSheetDrag({ y: Math.max(dy, 0), dragging: true });
    };
    const onSheetTouchEnd = () => {
        if (sheetDragStartY.current === null) return;
        sheetDragStartY.current = null;
        setSheetDrag(prev => {
            if (prev.y > 110) setSelectedTx(null);
            return { y: 0, dragging: false };
        });
    };

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
        if (!selectedTx) { setTxDetail(null); setModalPickingCategory(false); setModalPickingTags(false); setNewTagName(''); setNamingIban(null); setNameInput(''); setShareEditing(false); setShareInput(''); setShareNoteInput(''); setShareCounterpartyInput(''); setShareLearnRule(false); return; }
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
        // Mirrors backend aggregation: settlements from wife don't count as income,
        // shared expenses count only my part (my_share_amount).
        const income = txs.filter(t => !t.is_excluded && t.transaction_type === 'normal' && t.amount > 0 && !t.settlement_flag)
            .reduce((s, t) => s + t.amount, 0);
        const expense = txs.filter(t => !t.is_excluded && t.transaction_type === 'normal' && t.amount < 0)
            .reduce((s, t) => s + (t.my_share_amount != null ? -Math.min(t.my_share_amount, Math.abs(t.amount)) : t.amount), 0);
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

    const handleSaveShare = async (tx: Transaction, share: TransactionShare, learnRule = false) => {
        setSavingShare(true);
        try {
            const saved = await updateTransactionShare(tx.id, share);
            // Propagate locally (same pattern as contacts) so list + detail stay in sync without refetch.
            setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, ...saved } : t));
            setTxDetail(prev => prev && { ...prev, ...saved });
            setShareEditing(false);

            // "Dělit takhle i příště" — learn a share rule from this split. Pattern
            // anchors on the counterparty name (stable), % derived from this split.
            if (learnRule && share.my_share_amount != null && tx.amount < 0) {
                const pattern = (tx.creditor_name || tx.description || '').toLowerCase().trim();
                if (pattern.length >= 3) {
                    const pct = Math.round((share.my_share_amount / Math.abs(tx.amount)) * 10000) / 100;
                    try {
                        await createShareRule({
                            pattern,
                            my_percentage: pct,
                            counterparty: share.share_counterparty || null,
                            note: share.settlement_note || null,
                            apply_retroactively: true,
                        });
                    } catch (err) {
                        // duplicate rule etc. — the split itself is already saved
                        console.error('Failed to create share rule:', err);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to update transaction share:', err);
        } finally {
            setSavingShare(false);
        }
    };

    const handleToggleExcluded = async (tx: Transaction, excluded: boolean) => {
        setSavingExclude(true);
        try {
            await setTransactionExcluded(tx.id, excluded);
            // Optimisticky (server počítá stejně): vyřazený → is_excluded true;
            // zpět → jen skutečný převod zůstává vyřazený
            const isExcluded = excluded || (!!tx.transaction_type && tx.transaction_type !== 'normal');
            setTransactions(prev => prev.map(t => t.id === tx.id
                ? { ...t, user_excluded: excluded, is_excluded: isExcluded }
                : t));
            setTxDetail(prev => prev && { ...prev, user_excluded: excluded, is_excluded: isExcluded });
        } catch (err) {
            console.error('Failed to toggle transaction exclusion:', err);
        } finally {
            setSavingExclude(false);
        }
    };

    const openTagPicker = () => {
        setModalPickingTags(p => !p);
        if (allTags === null) {
            getTags()
                .then(d => setAllTags(d.tags))
                .catch(err => console.error('Failed to load tags:', err));
        }
    };

    const handleToggleTag = async (txId: string, tag: Tag) => {
        const tx = transactions.find(t => t.id === txId);
        const current = tx?.tags ?? [];
        const next = current.some(t => t.id === tag.id)
            ? current.filter(t => t.id !== tag.id)
            : [...current, tag];
        setSavingTags(true);
        try {
            const res = await setTransactionTags(txId, next.map(t => t.id));
            setTransactions(prev => prev.map(t => t.id === txId ? { ...t, tags: res.tags } : t));
        } catch (err) {
            console.error('Failed to set tags:', err);
        } finally {
            setSavingTags(false);
        }
    };

    const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

    const handleCreateTag = async (txId: string) => {
        const name = newTagName.trim();
        if (!name) return;
        setSavingTags(true);
        try {
            const created = await createTag(name, TAG_COLORS[(allTags?.length ?? 0) % TAG_COLORS.length]);
            setAllTags(prev => [...(prev ?? []), created]);
            setNewTagName('');
            await handleToggleTag(txId, created);
        } catch (err) {
            console.error('Failed to create tag:', err);
        } finally {
            setSavingTags(false);
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
            <div onClick={e => e.stopPropagation()} className="modal tx-modal-card"
                onTouchStart={onSheetTouchStart} onTouchMove={onSheetTouchMove} onTouchEnd={onSheetTouchEnd}
                style={{
                    transform: sheetDrag.y > 0 ? `translateY(${sheetDrag.y}px)` : undefined,
                    transition: sheetDrag.dragging ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
                }}>
                <div className="tx-sheet-grip" aria-hidden />
                <div className="tx-modal-scroll" ref={sheetScrollRef}>

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
                    <button onClick={() => setSelectedTx(null)} className="btn btn-icon btn-ghost tx-modal-close"
                        aria-label="Zavřít">{getLineIcon('close', 16)}</button>

                    <div style={{ fontSize: '2.8rem', lineHeight: 1, marginBottom: 10 }}>
                        {getCategoryIcon(categoryIcons[modalTx.category || 'Other'], 40)}
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
                    {modalTx.my_share_amount != null && modalTx.amount < 0 && (
                        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                            z toho moje část {formatCurrency(-modalTx.my_share_amount, modalTx.currency)}
                        </div>
                    )}
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
                                    : <span className="chip chip-accent">{getCategoryIcon(categoryIcons[modalTx.category || 'Other'], 13)} {modalTx.category || 'Other'}</span>
                                }
                                <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>{getLineIcon('edit', 13)}</span>
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
                                        {getCategoryIcon(cat.icon, 13)} {cat.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Tagy — druhá osa třídění ("dovolená 2026", "rekonstrukce"…) */}
                        <div className="label-row" onClick={openTagPicker} style={{ cursor: 'pointer' }}>
                            <dt>Tagy</dt>
                            <dd style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {(modalTx.tags?.length ?? 0) === 0
                                    ? <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Přidat tag</span>
                                    : (modalTx.tags ?? []).map(tag => (
                                        <span key={tag.id} className="chip" style={{ color: tag.color ?? undefined }}>
                                            #{tag.name}
                                        </span>
                                    ))}
                                <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>{getLineIcon('edit', 13)}</span>
                            </dd>
                        </div>

                        {/* Tag picker */}
                        {modalPickingTags && (
                            <div style={{ padding: '10px var(--spacing-lg)', borderBottom: '0.5px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6, background: 'var(--surface-sunken)', alignItems: 'center', opacity: savingTags ? 0.6 : 1 }}>
                                {allTags === null ? (
                                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>Načítám…</span>
                                ) : (
                                    <>
                                        {allTags.map(tag => {
                                            const active = (modalTx.tags ?? []).some(t => t.id === tag.id);
                                            return (
                                                <button key={tag.id}
                                                    onClick={() => handleToggleTag(modalTx.id, tag)}
                                                    disabled={savingTags}
                                                    className={`chip ${active ? 'chip-accent' : ''}`}
                                                    style={{ cursor: 'pointer', border: 'none', fontSize: '0.8rem', color: active ? undefined : (tag.color ?? undefined) }}>
                                                    #{tag.name}
                                                </button>
                                            );
                                        })}
                                        <input
                                            className="input"
                                            placeholder="+ nový tag"
                                            value={newTagName}
                                            onChange={e => setNewTagName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(modalTx.id); }}
                                            style={{ width: 130, padding: '4px 10px', fontSize: '0.8rem' }}
                                        />
                                    </>
                                )}
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
                                                        style={{ fontSize: '0.72rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: '2px 6px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        {getLineIcon('edit', 12)} {name ? 'Přejmenovat' : 'Pojmenovat'}
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

                        {/* ── Společný náklad / vypořádání (VYLEPSENI.md 3.1) ── */}
                        {modalTx.account_type === 'bank' && modalTx.transaction_type === 'normal' && !modalTx.is_excluded && modalTx.amount < 0 && (
                            <div className="label-row">
                                <dt>Společný náklad</dt>
                                <dd style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 0 }}>
                                    {!shareEditing ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            {modalTx.my_share_amount != null ? (
                                                <span className="chip chip-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    {getLineIcon('users', 12)} Moje část {formatCurrency(modalTx.my_share_amount, modalTx.currency)}
                                                    {modalTx.share_counterparty ? ` · ${modalTx.share_counterparty}` : ''}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>Celý výdaj je můj</span>
                                            )}
                                            <button className="tx-act"
                                                onClick={() => {
                                                    setShareEditing(true);
                                                    setShareInput(String(modalTx.my_share_amount ?? Math.round(Math.abs(modalTx.amount) / 2 * 100) / 100));
                                                    setShareNoteInput(modalTx.settlement_note || '');
                                                    setShareCounterpartyInput(modalTx.share_counterparty || '');
                                                    setShareLearnRule(false);
                                                }}>
                                                {modalTx.my_share_amount != null
                                                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{getLineIcon('edit', 13)} Upravit</span>
                                                    : 'Rozdělit náklad'}
                                            </button>
                                            {modalTx.my_share_amount != null && (
                                                <button className="tx-act" disabled={savingShare}
                                                    onClick={() => handleSaveShare(modalTx, { my_share_amount: null, settlement_flag: false, settlement_note: null, share_counterparty: null })}>
                                                    Zrušit rozdělení
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                {[25, 50, 75].map(pct => (
                                                    <button key={pct} className="chip" style={{ cursor: 'pointer', border: 'none' }}
                                                        onClick={() => setShareInput(String(Math.round(Math.abs(modalTx.amount) * pct / 100 * 100) / 100))}>
                                                        {pct} %
                                                    </button>
                                                ))}
                                                <input type="number" inputMode="decimal" min={0} max={Math.abs(modalTx.amount)} step="0.01"
                                                    value={shareInput} onChange={e => setShareInput(e.target.value)}
                                                    style={{ width: 110, padding: '5px 8px', fontSize: '0.82rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', color: 'var(--text)', outline: 'none', textAlign: 'right' }}
                                                />
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 400 }}>z {formatCurrency(Math.abs(modalTx.amount), modalTx.currency)}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <input value={shareCounterpartyInput} onChange={e => setShareCounterpartyInput(e.target.value)}
                                                    placeholder="Kdo dluží zbytek (např. Žena)" list="share-counterparties"
                                                    style={{ flex: 1, padding: '5px 8px', fontSize: '0.82rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', color: 'var(--text)', outline: 'none' }}
                                                />
                                                <datalist id="share-counterparties">
                                                    <option value="Žena" />
                                                    <option value="Sestra" />
                                                </datalist>
                                                <input value={shareNoteInput} onChange={e => setShareNoteInput(e.target.value)}
                                                    placeholder="Poznámka (nájem…)"
                                                    style={{ flex: 1, padding: '5px 8px', fontSize: '0.82rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', color: 'var(--text)', outline: 'none' }}
                                                />
                                            </div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-2)', justifyContent: 'flex-end', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={shareLearnRule} onChange={e => setShareLearnRule(e.target.checked)} />
                                                Dělit takhle i příště (vytvořit pravidlo)
                                            </label>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-primary btn-sm"
                                                    disabled={savingShare || !(parseFloat(shareInput.replace(',', '.')) >= 0 && parseFloat(shareInput.replace(',', '.')) <= Math.abs(modalTx.amount))}
                                                    onClick={() => handleSaveShare(modalTx, {
                                                        my_share_amount: parseFloat(shareInput.replace(',', '.')),
                                                        settlement_flag: false,
                                                        settlement_note: shareNoteInput.trim() || null,
                                                        share_counterparty: shareCounterpartyInput.trim() || null,
                                                    }, shareLearnRule)}>
                                                    {savingShare ? '…' : 'Uložit'}
                                                </button>
                                                <button className="btn btn-sm" onClick={() => setShareEditing(false)}>✕</button>
                                            </div>
                                        </div>
                                    )}
                                </dd>
                            </div>
                        )}
                        {modalTx.account_type === 'bank' && modalTx.amount > 0
                            && ((modalTx.transaction_type === 'normal' && !modalTx.is_excluded) || modalTx.transaction_type === 'family_transfer') && (
                            <div className="label-row">
                                <dt>Vypořádání</dt>
                                <dd style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 0 }}>
                                    {modalTx.settlement_flag ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <span className="chip chip-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    {getLineIcon('handshake', 12)} Vypořádání{modalTx.share_counterparty ? ` · ${modalTx.share_counterparty}` : ''}
                                                </span>
                                                <button className="btn btn-sm" disabled={savingShare}
                                                    onClick={() => handleSaveShare(modalTx, { my_share_amount: null, settlement_flag: false, settlement_note: null, share_counterparty: null })}>
                                                    Zrušit
                                                </button>
                                            </div>
                                            {modalTx.settlement_note && (
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 400 }}>{modalTx.settlement_note}</span>
                                            )}
                                        </div>
                                    ) : shareEditing ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <input autoFocus value={shareCounterpartyInput} onChange={e => setShareCounterpartyInput(e.target.value)}
                                                    placeholder="Od koho (např. Žena)" list="share-counterparties"
                                                    style={{ flex: 1, padding: '5px 8px', fontSize: '0.82rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', color: 'var(--text)', outline: 'none' }}
                                                />
                                                <datalist id="share-counterparties">
                                                    <option value="Žena" />
                                                    <option value="Sestra" />
                                                </datalist>
                                                <input value={shareNoteInput} onChange={e => setShareNoteInput(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleSaveShare(modalTx, { my_share_amount: null, settlement_flag: true, settlement_note: shareNoteInput.trim() || null, share_counterparty: shareCounterpartyInput.trim() || null });
                                                        if (e.key === 'Escape') setShareEditing(false);
                                                    }}
                                                    placeholder="Poznámka (nájem + kreditka…)"
                                                    style={{ flex: 1, padding: '5px 8px', fontSize: '0.82rem', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', color: 'var(--text)', outline: 'none' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                <button className="btn btn-primary btn-sm" disabled={savingShare}
                                                    onClick={() => handleSaveShare(modalTx, { my_share_amount: null, settlement_flag: true, settlement_note: shareNoteInput.trim() || null, share_counterparty: shareCounterpartyInput.trim() || null })}>
                                                    {savingShare ? '…' : 'Potvrdit'}
                                                </button>
                                                <button className="btn btn-sm" onClick={() => setShareEditing(false)}>✕</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            {modalTx.transaction_type === 'family_transfer' && (
                                                <span style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 500 }}>
                                                    Vypadá jako vratka — označ ji a započítá se do salda vypořádání.
                                                </span>
                                            )}
                                            <button className="tx-act" onClick={() => {
                                                setShareEditing(true);
                                                setShareNoteInput('');
                                                setShareCounterpartyInput(modalTx.transaction_type === 'family_transfer' ? 'Žena' : '');
                                            }}>
                                                {getLineIcon('handshake', 14)} Označit jako vypořádání
                                            </button>
                                        </div>
                                    )}
                                </dd>
                            </div>
                        )}

                        {/* Ruční vyřazení z příjmů/výdajů — na splátkové konstrukce
                            (Air/Twisto: plná platba + okamžitá vratka) apod. */}
                        {modalTx.account_type === 'bank' && (
                            <div className="label-row">
                                <dt>Počítat do bilance</dt>
                                <dd style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 0 }}>
                                    {modalTx.user_excluded ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            <span className="chip">{getLineIcon('ban', 13)} Nepočítá se</span>
                                            <button className="tx-act" disabled={savingExclude}
                                                onClick={() => handleToggleExcluded(modalTx, false)}>
                                                {savingExclude ? '…' : 'Vrátit do bilance'}
                                            </button>
                                        </div>
                                    ) : (
                                        <button className="tx-act" disabled={savingExclude}
                                            onClick={() => handleToggleExcluded(modalTx, true)}>
                                            {savingExclude
                                                ? '…'
                                                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{getLineIcon('ban', 14)} Ne</span>}
                                        </button>
                                    )}
                                </dd>
                            </div>
                        )}

                        {/* Footer — badges + ID */}
                        <div style={{ padding: '10px var(--spacing-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span className="chip chip-success">✓ Zaúčtováno</span>
                                {modalTx.transaction_type === 'internal_transfer' && <span className="chip">{getCategoryIcon(Icons.category.internalTransfer, 13)} Interní převod</span>}
                                {modalTx.transaction_type === 'family_transfer' && <span className="chip">{getCategoryIcon(Icons.category.familyTransfer, 13)} Rodinný převod</span>}
                                {modalTx.user_excluded && <span className="chip">{getLineIcon('ban', 13)} Ručně vyřazeno</span>}
                                {modalTx.is_excluded && !modalTx.user_excluded && <span className="chip">Vyloučeno z rozpočtu</span>}
                                {modalTx.settlement_flag && <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{getLineIcon('handshake', 12)} Vypořádání — mimo příjmy</span>}
                                {modalTx.my_share_amount != null && modalTx.amount < 0 && <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{getLineIcon('users', 12)} Společný náklad</span>}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>{modalTx.id}</span>
                        </div>
                    </dl>
                )}
                </div>
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
                            const catIcon = getCategoryIcon(categoryIcons[tx.category || 'Other'], 18);
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
