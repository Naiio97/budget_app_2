import { ReactNode } from 'react';

/**
 * Crisp monochrome line icons — jeden jednotný ikonový systém pro celou appku
 * (stejný vizuální jazyk jako ikony v horním menu / MainLayout's APPBAR_ICONS).
 * Používej je místo emoji všude v UI chrome (nadpisy sekcí, tlačítka, stavy,
 * navigace). Barevné emoji kategorií (getCategoryIcon) jsou samostatný systém.
 *
 * `getLineIcon(name, size)` vrátí ikonu v dané velikosti. `size` může být číslo
 * (px) nebo CSS délka ('1em'…) — s 'em' se ikona škáluje podle okolního fontu,
 * takže inline vedle textu sedí v každé velikosti. `LineIcons` jsou přednastavené
 * 16px varianty. Barvu ikona dědí přes `currentColor`.
 */
const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number | string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
        style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0 }}>{children}</svg>
);

const PATHS: Record<string, ReactNode> = {
    // ── Akce ──────────────────────────────────────────────
    add: <><path d="M12 5v14M5 12h14" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    delete: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
    close: <><path d="M18 6 6 18M6 6l12 12" /></>,
    check: <><path d="M20 6 9 17l-5-5" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
    clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
    eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M9.9 4.24A9 9 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.67 2.68" /><path d="M6.06 6.06A13 13 0 0 0 2 12s3 8 10 8a9 9 0 0 0 5-1.5" /><path d="m2 2 20 20" /></>,
    pause: <><path d="M8 4v16" /><path d="M16 4v16" /></>,
    play: <><path d="M6 3 20 12 6 21Z" /></>,
    // Zákaz / „nepočítat" — kruh s diagonálou
    ban: <><circle cx="12" cy="12" r="9" /><path d="m5.64 5.64 12.72 12.72" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,

    // ── Sekce / obsah ─────────────────────────────────────
    income: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
    savings: <><path d="M3 17 9 11l4 4 8-8" /><path d="M16 4h5v5" /></>,
    chart: <><path d="M6 20v-4M12 20v-9M18 20V8" /></>,
    trendUp: <><path d="M3 17 9 11l4 4 8-8" /><path d="M16 4h5v5" /></>,
    trendDown: <><path d="M3 7 9 13l4-4 8 8" /><path d="M16 20h5v-5" /></>,
    receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
    pie: <><path d="M21 12A9 9 0 1 1 12 3v9z" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></>,
    bank: <><path d="M3 21h18M5 21V10M19 21V10M9 21v-6M15 21v-6M4 10h16L12 3 4 10Z" /></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M17 4h3v2a3 3 0 0 1-3 3M7 4H4v2a3 3 0 0 0 3 3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    gem: <><path d="M6 3h12l4 6-10 12L2 9Z" /><path d="M2 9h20M12 3 8 9l4 12 4-12-4-6" /></>,
    scale: <><path d="M12 3v18M5 21h14M6 8h12l3 7a4 4 0 0 1-8 0zM6 8l-3 7a4 4 0 0 0 8 0z" /></>,
    tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l6.2 6.2a2 2 0 0 1 0 2.6Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
    ruler: <><path d="M14.5 2 22 9.5 9.5 22 2 14.5 14.5 2Z" /><path d="M6.5 10.5 8 12M10.5 6.5 12 8M10.5 14.5 12 16M14.5 10.5 16 12" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></>,
    xCircle: <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></>,
    coins: <><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" /></>,
    repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
    handshake: <><path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" /><path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8" /></>,

    // ── Navigace ──────────────────────────────────────────
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></>,
    menu: <><path d="M3 12h18M3 6h18M3 18h18" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,

    // ── Stavy ─────────────────────────────────────────────
    warning: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
    bolt: <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></>,

    // ── Lidé / rodina ─────────────────────────────────────
    user: <><circle cx="12" cy="8" r="4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    robot: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M8 2h8" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /></>,

    // ── Ozdoba ────────────────────────────────────────────
    star: <><path d="M12 3l2.5 5.5L20 9.3l-4 4 1 6-5-2.8L7 19.3l1-6-4-4 5.5-.8L12 3z" /></>,
};

export type LineIconName = keyof typeof PATHS;

export function getLineIcon(name: LineIconName, size: number | string = 16): ReactNode {
    return <Svg size={size}>{PATHS[name]}</Svg>;
}

export const LineIcons = {
    edit: getLineIcon('edit'),
    delete: getLineIcon('delete'),
    pause: getLineIcon('pause'),
    play: getLineIcon('play'),
    search: getLineIcon('search'),
    ban: getLineIcon('ban'),
};
