import { ReactNode } from 'react';

/**
 * Crisp monochrome line icons — stejný vizuální jazyk jako ikony v horním menu
 * (MainLayout's APPBAR_ICONS). Použij je místo emoji všude, kde ikona sedí
 * vedle nav ikon, ať appka má jeden jednotný ikonový systém.
 */
const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

export const LineIcons = {
    edit: <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>,
    delete: <Svg><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Svg>,
    pause: <Svg><path d="M8 4v16" /><path d="M16 4v16" /></Svg>,
    play: <Svg><path d="M6 3 20 12 6 21Z" /></Svg>,
    search: <Svg><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>,
};
