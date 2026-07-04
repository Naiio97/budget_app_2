import { ReactNode } from 'react';

/**
 * Crisp monochrome line icons — stejný vizuální jazyk jako ikony v horním menu
 * (MainLayout's APPBAR_ICONS) a čárové ikony kategorií. Použij je místo emoji
 * všude, kde ikona sedí vedle nav ikon, ať appka má jeden jednotný ikonový
 * systém. `getLineIcon(name, size)` vrátí ikonu v dané velikosti (jako
 * getCategoryIcon), `LineIcons` jsou přednastavené 16px varianty.
 */
const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
        style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0 }}>{children}</svg>
);

const PATHS: Record<string, ReactNode> = {
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    delete: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
    pause: <><path d="M8 4v16" /><path d="M16 4v16" /></>,
    play: <><path d="M6 3 20 12 6 21Z" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    // Zákaz / „nepočítat" — kruh s diagonálou (no-entry)
    ban: <><circle cx="12" cy="12" r="9" /><path d="m5.64 5.64 12.72 12.72" /></>,
};

export type LineIconName = keyof typeof PATHS;

export function getLineIcon(name: LineIconName, size = 16): ReactNode {
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
