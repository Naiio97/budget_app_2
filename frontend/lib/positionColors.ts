// Per-position color overrides, persisted in localStorage.
// Used on investment pages so the user can pin a brand/asset color that
// propagates to pie charts, legends, etc.

export const POSITION_COLOR_PALETTE: Array<{ name: string; value: string }> = [
    { name: 'Tyrkysová', value: '#2dd4bf' },
    { name: 'Modrá', value: '#3b82f6' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Fialová', value: '#a855f7' },
    { name: 'Růžová', value: '#ec4899' },
    { name: 'Červená', value: '#ef4444' },
    { name: 'Oranžová', value: '#f97316' },
    { name: 'Žlutá', value: '#eab308' },
    { name: 'Zelená', value: '#10b981' },
    { name: 'Lime', value: '#84cc16' },
    { name: 'Šedá', value: '#6b7280' },
    { name: 'Černá', value: '#111827' },
];

export type PositionScope = 'manual' | 't212' | 'pie';

const key = (scope: PositionScope, id: string | number) => `inv-color-${scope}-${id}`;

export function getPositionColor(scope: PositionScope, id: string | number): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key(scope, id));
}

export function setPositionColor(scope: PositionScope, id: string | number, color: string | null) {
    if (typeof window === 'undefined') return;
    if (color === null) {
        localStorage.removeItem(key(scope, id));
    } else {
        localStorage.setItem(key(scope, id), color);
    }
}
