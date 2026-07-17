'use client';

import { getCategoryIcon, CATEGORY_ICON_OPTIONS } from '@/lib/category-icons';

export interface Category { id: number; name: string; icon: string; color: string; order_index: number; is_income: boolean; is_active: boolean; }

export const CATEGORY_PALETTE = [
    '#ef4444', '#f97316', '#f28f64', '#eab308', '#b45309', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#0e7490', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#9f1239',
    '#6b7280', '#9ca3af', '#475569', '#111827',
];
// Nabídka ikon kategorií (čárové ikony, ukládá se klíč) — viz lib/category-icons.
export const ICON_OPTIONS = CATEGORY_ICON_OPTIONS.map(o => ({ value: o.value, label: o.label, icon: getCategoryIcon(o.value, 15) }));

// ── Card helpers ──────────────────────────────────────────────
// Crisp line icons for the settings redesign (the global Icons map is emoji).
const SvgIcon = ({ children }: { children: React.ReactNode }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
export const EditIcon = <SvgIcon><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></SvgIcon>;
export const TrashIcon = <SvgIcon><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></SvgIcon>;
export const SearchIcon = <SvgIcon><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></SvgIcon>;
export const CloseIcon = <SvgIcon><path d="M18 6 6 18M6 6l12 12" /></SvgIcon>;
export const EyeIcon = <SvgIcon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></SvgIcon>;
export const EyeOffIcon = <SvgIcon><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A11 11 0 0 1 12 5c6.5 0 10 7 10 7a13 13 0 0 1-2.16 3.19" /><path d="M6.61 6.61A13 13 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.39-1.39" /><path d="m2 2 20 20" /></SvgIcon>;
export const BankIcon = <SvgIcon><path d="M3 22h18" /><path d="M6 18v-7M10 18v-7M14 18v-7M18 18v-7" /><path d="M12 2 21 7H3z" /></SvgIcon>;

export function SurfaceCard({ title, sub, children, action, className = '' }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
    return (
        <section className={`surface ${className}`} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-head" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    {action}
                </div>
                {sub && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</div>}
            </div>
            <div className="card-body">{children}</div>
        </section>
    );
}
