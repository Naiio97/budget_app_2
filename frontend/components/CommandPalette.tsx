'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getTransactions, Transaction } from '@/lib/api';
import { NAV_PAGES } from '@/lib/nav-preferences';
import { LineIcons } from '@/lib/line-icons';
import { APPBAR_ICONS } from '@/components/MainLayout';

/**
 * Globální hledání (Cmd+K / Ctrl+K): paleta příkazů nad celou appkou.
 * Napíšeš „lidl" → transakce z API, „úvěry" → stránka. Otevírá se klávesovou
 * zkratkou nebo eventem `command-palette:open` (tlačítko lupy v appbaru/draweru).
 */
export const OPEN_PALETTE_EVENT = 'command-palette:open';

export function openCommandPalette() {
    window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

const PALETTE_PAGES = [
    ...NAV_PAGES,
    // Stránky mimo hlavní navigaci — dostupné aspoň přes paletu
    { href: '/wrapped', label: 'Roční přehled' },
    { href: '/settings', label: 'Nastavení' },
];

// Bez diakritiky a lowercase — „uvery" najde „Úvěry"
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

type PaletteItem =
    | { type: 'page'; href: string; label: string }
    | { type: 'show-all'; query: string; total: number }
    | { type: 'transaction'; tx: Transaction };

export default function CommandPalette() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [selected, setSelected] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    // Otevření: Cmd/Ctrl+K kdekoli, nebo event z tlačítka lupy.
    // Reset stavu patří sem (do handleru), ne do efektu nad `open`.
    useEffect(() => {
        const openFresh = () => {
            setQuery('');
            setDebounced('');
            setSelected(0);
            setOpen(true);
        };
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(o => {
                    if (o) return false;
                    openFresh();
                    return true;
                });
            }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener(OPEN_PALETTE_EVENT, openFresh);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener(OPEN_PALETTE_EVENT, openFresh);
        };
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    const { data: txResults } = useQuery({
        queryKey: ['palette-search', debounced],
        queryFn: () => getTransactions({ search: debounced, limit: 6 }),
        enabled: open && debounced.length >= 2,
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    });

    const pages = useMemo(() => {
        if (!query.trim()) return PALETTE_PAGES;
        const q = fold(query);
        return PALETTE_PAGES.filter(p => fold(p.label).includes(q));
    }, [query]);

    const showTx = debounced.length >= 2 && !!txResults;
    const items = useMemo<PaletteItem[]>(() => [
        ...pages.map(p => ({ type: 'page' as const, href: p.href, label: p.label })),
        ...(showTx && txResults!.total > 0
            ? [{ type: 'show-all' as const, query: debounced, total: txResults!.total }]
            : []),
        ...(showTx ? txResults!.items.map(tx => ({ type: 'transaction' as const, tx })) : []),
    ], [pages, showTx, txResults, debounced]);

    // Výběr nesmí ukazovat mimo seznam po změně výsledků — clamp při čtení,
    // žádný korekční setState v efektu
    const sel = Math.min(selected, Math.max(0, items.length - 1));

    const execute = useCallback((item: PaletteItem) => {
        if (item.type === 'page') {
            router.push(item.href);
        } else {
            const q = item.type === 'show-all' ? item.query : debounced;
            router.push(`/transactions?search=${encodeURIComponent(q)}`);
        }
        // Zavře se i efektem na pathname; tady pro případ, že už na cílové stránce jsme
        setOpen(false);
    }, [router, debounced]);

    const onInputKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setOpen(false); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelected(Math.min(sel + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected(Math.max(sel - 1, 0));
        } else if (e.key === 'Enter' && items[sel]) {
            e.preventDefault();
            execute(items[sel]);
        }
    };

    // Vybraný řádek drž ve viditelné části seznamu
    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [sel]);

    if (!open) return null;

    // Pořadí v `items` je: stránky → „zobrazit vše" → transakce; indexy níže
    // musí sedět s tímto pořadím, jinak klávesnice vybírá jiný řádek než UI
    const showAllIndex = pages.length;
    const txBaseIndex = showAllIndex + (showTx && txResults!.total > 0 ? 1 : 0);

    const row = (item: PaletteItem, index: number, content: React.ReactNode) => (
        <button
            key={item.type === 'page' ? item.href : item.type === 'show-all' ? 'show-all' : item.tx.id}
            type="button"
            data-index={index}
            className={`cmdk-item ${index === sel ? 'active' : ''}`}
            onClick={() => execute(item)}
            onMouseMove={() => setSelected(index)}
        >
            {content}
        </button>
    );

    return (
        <div className="cmdk-backdrop" onClick={() => setOpen(false)}>
            <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
                <div className="cmdk-input-row">
                    <span className="cmdk-input-icon">{LineIcons.search}</span>
                    <input
                        autoFocus
                        className="cmdk-input"
                        placeholder="Hledat transakce a stránky…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onInputKey}
                        aria-label="Globální hledání"
                    />
                    <kbd className="cmdk-kbd">Esc</kbd>
                </div>

                <div className="cmdk-list" ref={listRef}>
                    {pages.length > 0 && (
                        <>
                            <div className="cmdk-section">Stránky</div>
                            {pages.map((p, i) => row(
                                { type: 'page', href: p.href, label: p.label },
                                i,
                                <>
                                    <span className="cmdk-item-icon">{APPBAR_ICONS[p.href]}</span>
                                    <span className="cmdk-item-label">{p.label}</span>
                                </>,
                            ))}
                        </>
                    )}

                    {showTx && (
                        <>
                            <div className="cmdk-section">Transakce</div>
                            {txResults!.total === 0 ? (
                                <div className="cmdk-empty">Žádné transakce pro „{debounced}“</div>
                            ) : (
                                <>
                                    {row(
                                        { type: 'show-all', query: debounced, total: txResults!.total },
                                        showAllIndex,
                                        <>
                                            <span className="cmdk-item-icon">{LineIcons.search}</span>
                                            <span className="cmdk-item-label">
                                                Zobrazit všechny výsledky pro „{debounced}“
                                            </span>
                                            <span className="cmdk-item-meta">{txResults!.total}×</span>
                                        </>,
                                    )}
                                    {txResults!.items.map((tx, i) => row(
                                        { type: 'transaction', tx },
                                        txBaseIndex + i,
                                        <>
                                            <span className="cmdk-item-label" style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {tx.amount < 0 ? (tx.creditor_name || tx.description) : (tx.debtor_name || tx.description)}
                                                </span>
                                                <span className="cmdk-item-sub">
                                                    {new Date(tx.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                                                    {tx.account_name ? ` · ${tx.account_name}` : ''}
                                                </span>
                                            </span>
                                            <span className={`cmdk-item-meta num ${tx.amount > 0 ? 'pos' : ''}`}>
                                                {formatAmount(tx.amount, tx.currency)}
                                            </span>
                                        </>,
                                    ))}
                                </>
                            )}
                        </>
                    )}

                    {pages.length === 0 && !showTx && (
                        <div className="cmdk-empty">
                            {query.trim().length === 1 ? 'Piš dál — transakce hledám od 2 znaků' : 'Nic nenalezeno'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
