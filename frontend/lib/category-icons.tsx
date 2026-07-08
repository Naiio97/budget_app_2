import { ReactNode } from 'react';

/**
 * Čárové ikony kategorií — stejný monochromatický stroke-SVG jazyk jako ikony
 * v horním menu (APPBAR_ICONS) a LineIcons. Kategorie mají ikonu uloženou v DB
 * jako string: nové záznamy ukládají klíč (např. "car"), starší emoji ("🚗").
 * getCategoryIcon() umí obojí, takže není potřeba žádná migrace dat.
 */
const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
        style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0 }}>{children}</svg>
);

const PATHS: Record<string, ReactNode> = {
    utensils: <><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></>,
    car: <><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" /></>,
    bulb: <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>,
    film: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" /></>,
    cart: <><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>,
    basket: <><path d="m15 11-1 9" /><path d="m19 11-4-7" /><path d="M2 11h20" /><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" /><path d="M4.5 15.5h15" /><path d="m5 11 4-7" /><path d="m9 11 1 9" /></>,
    trending: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
    banknote: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
    wallet: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>,
    transfer: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></>,
    family: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    box: <><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>,
    phone: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
    health: <><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" /></>,
    home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>,
    plane: <><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></>,
    gamepad: <><path d="M6 12h4M8 10v4" /><path d="M15 13h.01" /><path d="M18 11h.01" /><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" /></>,
    shirt: <><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></>,
    sparkles: <><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z" /></>,
    paw: <><circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="20" cy="16" r="2" /><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" /></>,
    gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></>,
    zap: <><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></>,
    clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
    split: <><path d="M12 3v5" /><path d="M12 8 6 14" /><path d="M12 8l6 6" /><path d="M6 14v6" /><path d="M18 14v6" /></>,
};

// Starší kategorie mají v DB emoji — mapa je překládá na klíče výše.
const EMOJI_TO_KEY: Record<string, string> = {
    '🍔': 'utensils', '🍕': 'utensils', '🍽️': 'utensils',
    '🚗': 'car',
    '💡': 'bulb',
    '🎬': 'film',
    '🛒': 'cart', '🧺': 'basket',
    '📈': 'trending',
    '💵': 'banknote', '💰': 'wallet',
    '🔄': 'transfer', '👨‍👩‍👧': 'family',
    '📦': 'box', '📱': 'phone', '🏥': 'health',
    '🏠': 'home', '✈️': 'plane', '🎮': 'gamepad', '👕': 'shirt',
    '💄': 'sparkles', '🐕': 'paw', '🎁': 'gift', '⚡': 'zap',
    '📋': 'clipboard',
};

/** Nabídka pro výběr ikony v Nastavení — ukládá se klíč, ne emoji. */
export const CATEGORY_ICON_OPTIONS: { value: string; label: string }[] = [
    { value: 'utensils', label: 'Jídlo' },
    { value: 'basket', label: 'Nákup potravin' },
    { value: 'cart', label: 'Nákupy' },
    { value: 'car', label: 'Doprava' },
    { value: 'bulb', label: 'Energie' },
    { value: 'home', label: 'Bydlení' },
    { value: 'film', label: 'Zábava' },
    { value: 'gamepad', label: 'Hry' },
    { value: 'phone', label: 'Předplatné' },
    { value: 'trending', label: 'Investice' },
    { value: 'wallet', label: 'Výplata' },
    { value: 'banknote', label: 'Hotovost' },
    { value: 'health', label: 'Zdraví' },
    { value: 'shirt', label: 'Oblečení' },
    { value: 'sparkles', label: 'Kosmetika' },
    { value: 'paw', label: 'Mazlíčci' },
    { value: 'gift', label: 'Dárky' },
    { value: 'plane', label: 'Cestování' },
    { value: 'zap', label: 'Ostatní služby' },
    { value: 'split', label: 'Vyrovnání (settlement)' },
    { value: 'box', label: 'Ostatní' },
];

/**
 * Vrátí čárovou ikonu pro hodnotu z `categories.icon` (klíč i legacy emoji).
 * Neznámou hodnotu vrátí tak, jak je (vlastní emoji dál funguje).
 */
export function getCategoryIcon(icon: string | null | undefined, size = 16): ReactNode {
    const key = icon && (PATHS[icon] ? icon : EMOJI_TO_KEY[icon]);
    if (key) return <Svg size={size}>{PATHS[key]}</Svg>;
    if (icon) return icon;
    return <Svg size={size}>{PATHS.clipboard}</Svg>;
}

/** Normalizuje hodnotu z DB na klíč ikony — pro předvyplnění editačního formuláře. */
export function categoryIconKey(icon: string | null | undefined): string {
    if (icon && PATHS[icon]) return icon;
    return (icon && EMOJI_TO_KEY[icon]) || 'box';
}
