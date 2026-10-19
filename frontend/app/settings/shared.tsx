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

export const UnlinkIcon = <SvgIcon><path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="m5.17 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" /><path d="M8 2v3M2 8h3M16 22v-3M22 16h-3" /></SvgIcon>;
export const HourglassIcon = <SvgIcon><path d="M5 22h14M5 2h14" /><path d="M17 22v-4.17a2 2 0 0 0-.59-1.41L12 12l-4.41 4.42A2 2 0 0 0 7 17.83V22" /><path d="M7 2v4.17a2 2 0 0 0 .59 1.41L12 12l4.41-4.42A2 2 0 0 0 17 6.17V2" /></SvgIcon>;
export const ChevronRightIcon = <SvgIcon><path d="m9 18 6-6-6-6" /></SvgIcon>;
export const RefreshIcon = <SvgIcon><path d="M21 12a9 9 0 0 0-15-6.7L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 15 6.7L21 16" /><path d="M16 16h5v5" /></SvgIcon>;
export const CheckCircleIcon = <SvgIcon><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></SvgIcon>;
export const AlertCircleIcon = <SvgIcon><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></SvgIcon>;

// Ikony záložek nastavení
export const TAB_ICONS: Record<string, React.ReactNode> = {
    accounts: <SvgIcon><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></SvgIcon>,
    categories: <SvgIcon><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" /></SvgIcon>,
    menu: <SvgIcon><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></SvgIcon>,
    advanced: <SvgIcon><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></SvgIcon>,
};

// Ikony stránek v nabídce Menu (podle cesty)
export const NAV_ICONS: Record<string, React.ReactNode> = {
    '/': <SvgIcon><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /></SvgIcon>,
    '/transactions': <SvgIcon><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></SvgIcon>,
    '/rozpocet': <SvgIcon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></SvgIcon>,
    '/budgets': <SvgIcon><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></SvgIcon>,
    '/reports': <SvgIcon><path d="M5 21V10M12 21V4M19 21v-7" /></SvgIcon>,
    '/investments': <SvgIcon><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></SvgIcon>,
    '/loans': <SvgIcon><path d="M3 22h18M5 22V11M9 22V11M15 22V11M19 22V11M12 2 3 7h18z" /></SvgIcon>,
    '/subscriptions': <SvgIcon><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></SvgIcon>,
};

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
