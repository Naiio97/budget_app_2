'use client';

import { useMemo, useSyncExternalStore } from 'react';

/**
 * Uživatelské rozmístění stránek v navigaci. Každá stránka je buď v hlavním
 * menu, v rychlých akcích (pravý panel / mobilní drawer), nebo skrytá úplně.
 * Uloženo v localStorage (stejný vzor jako téma) — platí per zařízení.
 */
export type NavPlacement = 'menu' | 'quick' | 'hidden';

export const NAV_PAGES: { href: string; label: string }[] = [
    { href: '/', label: 'Dashboard' },
    { href: '/transactions', label: 'Transakce' },
    { href: '/rozpocet', label: 'Rozpočet' },
    { href: '/budgets', label: 'Rozpočty' },
    { href: '/reports', label: 'Přehledy' },
    { href: '/investments', label: 'Investice' },
    { href: '/loans', label: 'Úvěry' },
    { href: '/subscriptions', label: 'Předplatné' },
    { href: '/vyporadani', label: 'Vypořádání' },
];

const LS_KEY = 'nav_prefs';
const CHANGE_EVENT = 'nav-prefs-changed';

function parse(raw: string | null): Record<string, NavPlacement> {
    let stored: Record<string, unknown> = {};
    try {
        stored = raw ? JSON.parse(raw) : {};
    } catch { /* poškozený záznam — spadne na defaulty */ }
    const result: Record<string, NavPlacement> = {};
    for (const page of NAV_PAGES) {
        const v = stored[page.href];
        result[page.href] = v === 'quick' || v === 'hidden' ? v : 'menu';
    }
    result['/'] = 'menu'; // Dashboard nejde odebrat — vždy zbývá cesta domů
    return result;
}

export function setNavPlacement(href: string, placement: NavPlacement) {
    const current = parse(localStorage.getItem(LS_KEY));
    current[href] = placement;
    localStorage.setItem(LS_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

/** Reaktivní přehled rozmístění — překreslí komponentu při každé změně. */
export function useNavPlacements(): Record<string, NavPlacement> {
    const raw = useSyncExternalStore(
        subscribe,
        () => localStorage.getItem(LS_KEY),
        () => null,
    );
    return useMemo(() => parse(raw), [raw]);
}
