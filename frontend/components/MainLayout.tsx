'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ReactNode, useState, useEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { syncData, getSyncStatus, SyncStatus, clearBackendTokenCache } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useAccounts } from '@/contexts/AccountsContext';
import { getConsentStatus } from '@/lib/consent';
import { NAV_PAGES, useNavPlacements } from '@/lib/nav-preferences';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import { exitDemo, isDemoMode } from '@/lib/demo-mode';
import IdleLogout from '@/components/IdleLogout';
import CommandPalette, { openCommandPalette } from '@/components/CommandPalette';

// Crisp line icons for the floating appbar (the global Icons map is emoji,
// which looks off in the monochrome pill). Keyed by route.
const Svg = ({ children }: { children: ReactNode }) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
        style={{ display: 'block' }}>{children}</svg>
);
export const APPBAR_ICONS: Record<string, ReactNode> = {
    '/': <Svg><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></Svg>,
    '/transactions': <Svg><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Svg>,
    '/rozpocet': <Svg><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>,
    '/budgets': <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Svg>,
    '/reports': <Svg><path d="M6 20v-4M12 20v-9M18 20V8" /></Svg>,
    '/investments': <Svg><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></Svg>,
    '/loans': <Svg><path d="M3 22h18" /><path d="M6 18v-7M10 18v-7M14 18v-7M18 18v-7" /><path d="M12 2 21 7H3z" /></Svg>,
    '/subscriptions': <Svg><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></Svg>,
    '/vyporadani': <Svg><path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" /><path d="m21 3 1 11h-2" /><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" /><path d="M3 4h8" /></Svg>,
    '/settings': <Svg><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Svg>,
    '/wrapped': <Svg><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z" /></Svg>,
};
const MenuIcon = <Svg><path d="M3 12h18M3 6h18M3 18h18" /></Svg>;
const SearchIcon = <Svg><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>;
const SyncIcon = <Svg><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></Svg>;
const CloseIcon = <Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const MoonIcon = <Svg><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></Svg>;
const SunIcon = <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;

interface MainLayoutProps {
    children: ReactNode;
    disableScroll?: boolean;
}

// iOS u appky přidané na plochu stavovou lištu neschová ani nenechá protéct —
// vždycky tam je neprůhledný proužek. Nejlepší dosažitelné je naladit ho meta
// theme-color na barvu pozadí motivu, aby s appkou splynul (tmavý v tmavém,
// světlý ve světlém; iOS podle jasu barvy zvolí i barvu textu hodin). Držíme ho
// v obou režimech — prohlížeč i PWA. Bez něj iOS spadne na defaultní světlou lištu.
const THEME_BAR_COLOR = { dark: '#000000', light: '#f2f2f7' } as const;
function applyThemeToDocument(mode: 'dark' | 'light') {
    document.documentElement.setAttribute('data-mode', mode);
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.content = THEME_BAR_COLOR[mode];
}

export default function MainLayout({ children, disableScroll = false }: MainLayoutProps) {
    const pathname = usePathname();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isCompactNavOpen, setIsCompactNavOpen] = useState(false);
    const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [hasMounted, setHasMounted] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [navHidden, setNavHidden] = useState(false);
    const layoutRef = useRef<HTMLDivElement>(null);
    const { accounts } = useAccounts();
    const queryClient = useQueryClient();

    const { data: syncStatus } = useQuery<SyncStatus>({
        queryKey: queryKeys.syncStatus,
        queryFn: getSyncStatus,
        refetchInterval: 60_000,
    });

    const NAV_EMOJI: Record<string, ReactNode> = {
        '/': Icons.nav.dashboard,
        '/transactions': Icons.nav.transactions,
        '/rozpocet': Icons.nav.monthlyBudget,
        '/budgets': Icons.nav.budgets,
        '/reports': Icons.nav.reports,
        '/investments': Icons.nav.investments,
        '/loans': Icons.nav.loans,
        '/subscriptions': Icons.nav.subscriptions,
        '/vyporadani': Icons.nav.settlement,
    };

    // Rozmístění si uživatel volí v Nastavení → Pokročilé → Menu a navigace:
    // stránka je v hlavním menu, v rychlých akcích, nebo skrytá úplně.
    const placements = useNavPlacements();
    const pages = NAV_PAGES.map(p => ({ ...p, icon: NAV_EMOJI[p.href] }));
    const menuPages = pages.filter(p => placements[p.href] === 'menu');
    const quickPages = pages.filter(p => placements[p.href] === 'quick');

    // Drawer (hamburger) ukazuje všechno nescryté + Nastavení, ať se uživatel
    // vždycky dostane všude i bez appbaru.
    const navItems = [
        ...menuPages,
        ...quickPages,
        { href: '/settings', label: 'Nastavení', icon: Icons.nav.settings },
    ];

    // Bottom nav holds the four primary sections + a Menu button that opens
    // the drawer (which itself surfaces Settings, accounts, sync, logout).
    const bottomNavItems = menuPages.slice(0, 4);

    useEffect(() => {
        setHasMounted(true);
        const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
        const initial = saved ?? 'dark';
        setTheme(initial);
        applyThemeToDocument(initial);
    }, []);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        localStorage.setItem('theme', next);
        applyThemeToDocument(next);
    };

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 1200);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        setIsCompactNavOpen(false);
        setIsMobileToolsOpen(false);
        setNavHidden(false);
    }, [pathname]);

    // Instagram-style bottom nav: hide on scroll down, reveal on scroll up.
    useEffect(() => {
        const el = layoutRef.current;
        if (!el || !isMobile) return;
        let last = el.scrollTop;
        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const y = el.scrollTop;
                if (y < 48) setNavHidden(false);          // near top → always show
                else if (y - last > 6) setNavHidden(true);  // scrolling down → hide
                else if (last - y > 6) setNavHidden(false); // scrolling up → show
                last = y;
                ticking = false;
            });
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [isMobile]);

    const handleLogout = async () => {
        clearBackendTokenCache();
        // Clear the idle/session clock so the next login starts a fresh hour.
        localStorage.removeItem('idle_last_activity');
        localStorage.removeItem('idle_session_start');
        if (isDemoMode()) {
            exitDemo();
            window.location.href = '/login';
            return;
        }
        await signOut({ redirectTo: '/login' });
    };

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const result = await syncData();
            if (result.failed_accounts && result.failed_accounts.length > 0) {
                alert(`Sync se nepovedl pro: ${result.failed_accounts.join(', ')}. Zkontroluj připojení banky v Nastavení.`);
            }
            await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
            queryClient.invalidateQueries({ queryKey: queryKeys.budgetOverview });
            queryClient.invalidateQueries({ queryKey: queryKeys.budgets });
            queryClient.invalidateQueries({ queryKey: queryKeys.investmentPortfolio });
            queryClient.invalidateQueries({ queryKey: queryKeys.portfolioDetail });
            queryClient.invalidateQueries({ queryKey: queryKeys.portfolioPositions });
            queryClient.invalidateQueries({ queryKey: queryKeys.dividends });
            queryClient.invalidateQueries({ queryKey: ['portfolio-history'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: queryKeys.syncStatus });
            queryClient.invalidateQueries({ queryKey: queryKeys.pies });
        } catch (error) {
            console.error('Sync failed:', error);
            alert('Synchronizace selhala. Zkontrolujte logy nebo nastavení.');
        } finally {
            setIsSyncing(false);
        }
    };

    const getBankLogo = (institution: string | undefined) => {
        if (!institution) return null;
        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const inst = normalize(institution);
        let logoFile = '';
        if (inst.includes('airbank')) logoFile = 'airbank';
        else if (inst.includes('csas') || inst.includes('cesk') || inst.includes('sporitelna')) logoFile = 'csas';
        else if (inst.includes('trading212')) logoFile = 'trading212';
        else if (inst.includes('kb') || inst.includes('komercni')) logoFile = 'kb';
        else if (inst.includes('moneta')) logoFile = 'moneta';
        else if (inst.includes('raiffeisen') || (inst.includes('rb') && !inst.includes('airbank'))) logoFile = 'rb';
        else if (inst.includes('fio')) logoFile = 'fio';
        else if (inst.includes('csob')) logoFile = 'csob';
        else if (inst.includes('revolut')) logoFile = 'revolut';
        return logoFile ? `/logos/${logoFile}.png` : null;
    };

    const getAccountHref = (account: { id: string; type: string }) => {
        if (account.type === 'investment') return '/investments/trading212';
        if (account.type === 'manual_investment' || account.id.startsWith('manual-inv-'))
            return `/investments/manual/${account.id.replace('manual-inv-', '')}`;
        if (account.type === 'manual' || account.id.startsWith('manual-'))
            return `/manual-account/${account.id.replace('manual-', '')}`;
        return `/accounts/${account.id}`;
    };

    const getAccentColor = (type: string) => {
        if (type === 'bank') return 'linear-gradient(135deg, #1e40c4, #0b2eb0)';
        if (type === 'investment' || type === 'manual_investment') return 'linear-gradient(135deg, #5e5ce6, #3634a3)';
        return 'linear-gradient(135deg, #10b981, #059669)';
    };

    const getInitials = (name: string) =>
        name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

    return (
        <div className="app-root">
            <IdleLogout />
            <CommandPalette />
            {/* Appbar — desktop only */}
            <header className="appbar">
                <Link href="/" className="appbar-logo">
                    <span className="appbar-logo-mark">K</span>
                    <span>Koruna</span>
                </Link>
                <nav className="appbar-nav">
                    {menuPages.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`appbar-nav-item ${pathname === item.href ? 'active' : ''}`}
                        >
                            {APPBAR_ICONS[item.href]}
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>
                <span className="appbar-divider" aria-hidden />
                <button
                    onClick={openCommandPalette}
                    className="appbar-theme"
                    aria-label="Hledat (Cmd+K)"
                    title="Hledat (⌘K)"
                >
                    {SearchIcon}
                </button>
                <button
                    onClick={toggleTheme}
                    className="appbar-theme"
                    aria-label="Přepnout motiv"
                >
                    {theme === 'dark' ? SunIcon : MoonIcon}
                </button>
            </header>

            <div ref={layoutRef} className={`layout ${hasMounted && disableScroll ? 'layout-no-scroll' : ''}`}>
                <main className="main-content">
                    {/* Hamburger for medium screens */}
                    <div className="compact-nav-header">
                        <button
                            className="desktop-nav-toggle"
                            onClick={() => setIsCompactNavOpen(!isCompactNavOpen)}
                            aria-label="Toggle menu"
                        >
                            ☰
                        </button>
                        <div
                            className={`desktop-nav-overlay ${isCompactNavOpen ? 'open' : ''}`}
                            onClick={() => setIsCompactNavOpen(false)}
                        />
                    </div>

                    <nav className={`nav desktop-nav ${isCompactNavOpen ? 'open' : ''}`} style={{ flexShrink: 0 }}>
                        <div className="desktop-nav-header-close">
                            <button className="desktop-nav-close" onClick={() => setIsCompactNavOpen(false)}>✕</button>
                        </div>
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                                onClick={() => setIsCompactNavOpen(false)}
                            >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </nav>

                    {children}
                </main>

                {/* Right panel — same on every page, scrolls with content */}
                <aside className="right-panel">

                    {/* Net worth hero */}
                    <div className="surface kpi">
                        <div className="kpi-label">Čisté jmění</div>
                        <div className="kpi-value num" style={{ fontSize: '1.6rem', marginTop: 4 }}>
                            {formatCurrency(totalBalance)}
                        </div>
                        <div className="kpi-sub">
                            <span className="muted" style={{ fontSize: 12 }}>
                                {accounts.length} {accounts.length === 1 ? 'účet' : accounts.length < 5 ? 'účty' : 'účtů'}
                            </span>
                        </div>
                    </div>

                    {/* Accounts list */}
                    <div className="surface">
                        <div className="card-head">
                            <h4>Účty</h4>
                            <span className="muted">{accounts.length}</span>
                        </div>
                        <div style={{ padding: '8px var(--spacing-md) var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {accounts.length === 0 ? (
                                <div style={{ padding: '12px 0', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
                                    Žádné účty
                                </div>
                            ) : (
                                accounts.map((account) => {
                                    const logoUrl = getBankLogo(account.institution);
                                    const href = getAccountHref(account);
                                    const consent = getConsentStatus(account.consent_expires_at);
                                    const consentWarning = consent && (consent.expired || consent.expiringSoon);
                                    const syncBroken = !consentWarning && !!account.last_sync_error;
                                    return (
                                        <Link key={account.id} href={href} className="acc-card">
                                            {logoUrl ? (
                                                <div className="acc-logo" style={{ background: '#fff', padding: 4, overflow: 'hidden' }}>
                                                    <Image src={logoUrl} alt={account.institution || account.name} width={32} height={32} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                </div>
                                            ) : (
                                                <div className="acc-logo" style={{ background: getAccentColor(account.type), fontSize: 11 }}>
                                                    {getInitials(account.name)}
                                                </div>
                                            )}
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div className="acc-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</div>
                                                {consentWarning ? (
                                                    <div className="acc-balance" style={{ color: consent.color, fontWeight: 600 }} title={consent.label}>
                                                        {consent.shortLabel}
                                                    </div>
                                                ) : syncBroken ? (
                                                    <div className="acc-balance" style={{ color: 'var(--warn)', fontWeight: 600 }} title={account.last_sync_error ?? undefined}>
                                                        sync selhává
                                                    </div>
                                                ) : (
                                                    <div className="acc-balance">{account.currency}</div>
                                                )}
                                            </div>
                                            <div className="num" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', flexShrink: 0, color: account.balance < 0 ? 'var(--neg)' : 'var(--text)' }}>
                                                {formatCurrency(account.balance, account.currency)}
                                            </div>
                                        </Link>
                                    );
                                })
                            )}
                            <Link href="/settings" className="btn btn-ghost btn-sm" style={{ justifyContent: 'center', marginTop: 4 }}>
                                + Propojit účet
                            </Link>
                        </div>
                    </div>

                    {/* Quick actions */}
                    <div className="surface">
                        <div className="card-head"><h4>Rychlé akce</h4></div>
                        <div style={{ padding: 'var(--spacing-sm)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button className="btn btn-sm" onClick={handleSync} disabled={isSyncing}
                                style={{ justifyContent: 'flex-start' }}>
                                {isSyncing
                                    ? <><span style={{ width: 13, height: 13, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} /><span>Sync...</span></>
                                    : <><span>{SyncIcon}</span><span>Sync</span></>
                                }
                            </button>
                            <Link href="/settings" className="btn btn-sm" style={{ justifyContent: 'flex-start', textDecoration: 'none' }}>
                                <span>{APPBAR_ICONS['/settings']}</span><span>Nastavení</span>
                            </Link>
                            {quickPages.map((item) => (
                                <Link key={item.href} href={item.href} className="btn btn-sm" style={{ justifyContent: 'flex-start', textDecoration: 'none' }}>
                                    <span>{APPBAR_ICONS[item.href]}</span><span>{item.label}</span>
                                </Link>
                            ))}
                            <button className="btn btn-sm" onClick={handleLogout}
                                style={{ justifyContent: 'center', gridColumn: '1 / -1', color: 'var(--neg)' }}>
                                <span>↩</span><span>Odhlásit se</span>
                            </button>
                        </div>
                        {syncStatus && syncStatus.status !== 'never' && (
                            <div style={{ padding: '0 var(--spacing-sm) var(--spacing-sm)', fontSize: 11, color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {syncStatus.last_sync && (
                                    <span>Poslední sync: {new Date(syncStatus.last_sync).toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })}</span>
                                )}
                                <span style={{ color: syncStatus.syncs_today >= 4 ? 'var(--neg)' : syncStatus.syncs_today >= 3 ? 'var(--warn)' : 'var(--text-3)', fontWeight: syncStatus.syncs_today >= 3 ? 600 : undefined }}>
                                    {syncStatus.syncs_today}/4 dnes{syncStatus.syncs_today >= 4 && ' — denní limit'}
                                </span>
                            </div>
                        )}
                    </div>

                </aside>

                {/* Mobile bottom navigation */}
                {isMobile && (
                    <>
                        <div
                            className={`mobile-tools-overlay ${isMobileToolsOpen ? 'open' : ''}`}
                            onClick={() => setIsMobileToolsOpen(false)}
                        />
                        <aside className={`mobile-tools-drawer ${isMobileToolsOpen ? 'open' : ''}`} aria-hidden={!isMobileToolsOpen}>
                            <div className="mobile-tools-head">
                                <div>
                                    <div className="mobile-tools-title-row">
                                        <strong>Menu</strong>
                                        <button
                                            type="button"
                                            className="mobile-theme-mini"
                                            onClick={() => { setIsMobileToolsOpen(false); openCommandPalette(); }}
                                            aria-label="Hledat"
                                        >
                                            {SearchIcon}
                                        </button>
                                        <button
                                            type="button"
                                            className="mobile-theme-mini"
                                            onClick={toggleTheme}
                                            aria-label="Přepnout motiv"
                                        >
                                            {theme === 'dark' ? SunIcon : MoonIcon}
                                        </button>
                                    </div>
                                    <span>{accounts.length} {accounts.length === 1 ? 'účet' : accounts.length < 5 ? 'účty' : 'účtů'}</span>
                                </div>
                                <button className="mobile-theme-mini" onClick={() => setIsMobileToolsOpen(false)} aria-label="Zavřít">{CloseIcon}</button>
                            </div>

                            <div className="mobile-tools-section">
                                <div className="mobile-tools-kpi">
                                    <span>Čisté jmění</span>
                                    <strong className="num">{formatCurrency(totalBalance)}</strong>
                                </div>
                                <button className="btn btn-primary mobile-sync-btn" onClick={handleSync} disabled={isSyncing}>
                                    {isSyncing ? 'Synchronizuji...' : <>{Icons.action.sync} Synchronizovat</>}
                                </button>
                                {syncStatus?.last_sync && (
                                    <div className="mobile-tools-sync-meta">
                                        Poslední sync: {new Date(syncStatus.last_sync).toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })}
                                    </div>
                                )}
                                {syncStatus && syncStatus.status !== 'never' && (
                                    <div
                                        className="mobile-tools-sync-meta"
                                        style={{
                                            color: syncStatus.syncs_today >= 4 ? 'var(--neg)' : syncStatus.syncs_today >= 3 ? 'var(--warn)' : undefined,
                                            fontWeight: syncStatus.syncs_today >= 3 ? 600 : undefined,
                                        }}
                                    >
                                        {syncStatus.syncs_today}/4 dnes{syncStatus.syncs_today >= 4 && ' — denní limit'}
                                    </div>
                                )}
                            </div>

                            <div className="mobile-tools-section">
                                <div className="mobile-tools-title">Účty</div>
                                <div className="mobile-account-list">
                                    {accounts.length === 0 ? (
                                        <div className="mobile-empty">Žádné účty</div>
                                    ) : accounts.map((account) => {
                                        const logoUrl = getBankLogo(account.institution);
                                        const consent = getConsentStatus(account.consent_expires_at);
                                        const consentWarning = consent && (consent.expired || consent.expiringSoon);
                                        const syncBroken = !consentWarning && !!account.last_sync_error;
                                        return (
                                            <Link
                                                key={account.id}
                                                href={getAccountHref(account)}
                                                className="mobile-account-row"
                                                onClick={() => setIsMobileToolsOpen(false)}
                                            >
                                                {logoUrl ? (
                                                    <span className="mobile-account-logo bank">
                                                        <Image src={logoUrl} alt={account.institution || account.name} width={28} height={28} />
                                                    </span>
                                                ) : (
                                                    <span className="mobile-account-logo" style={{ background: getAccentColor(account.type) }}>
                                                        {getInitials(account.name)}
                                                    </span>
                                                )}
                                                <span className="mobile-account-copy">
                                                    <strong>{account.name}</strong>
                                                    {consentWarning ? (
                                                        <span style={{ color: consent.color, fontWeight: 600 }}>{consent.shortLabel}</span>
                                                    ) : syncBroken ? (
                                                        <span style={{ color: 'var(--warn)', fontWeight: 600 }}>sync selhává</span>
                                                    ) : (
                                                        <span>{account.currency}</span>
                                                    )}
                                                </span>
                                                <span className="num mobile-account-balance">{formatCurrency(account.balance, account.currency)}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mobile-tools-section">
                                <div className="mobile-tools-title">Rychlé akce</div>
                                <div className="mobile-quick-grid">
                                    <Link href="/settings" className="btn btn-sm" onClick={() => setIsMobileToolsOpen(false)}>{APPBAR_ICONS['/settings']}Nastavení</Link>
                                    {/* Menu stránky, co se nevešly do bottom navu, + rychlé akce */}
                                    {[...menuPages.slice(4), ...quickPages].map((item) => (
                                        <Link key={item.href} href={item.href} className="btn btn-sm" onClick={() => setIsMobileToolsOpen(false)}>{APPBAR_ICONS[item.href]}{item.label}</Link>
                                    ))}
                                </div>
                                <button
                                    className="btn btn-sm"
                                    onClick={handleLogout}
                                    style={{ marginTop: 10, width: '100%', color: 'var(--neg)' }}
                                >
                                    ↩ Odhlásit se
                                </button>
                            </div>
                        </aside>

                        <nav className={`bottom-nav ${navHidden ? 'bottom-nav--hidden' : ''}`}>
                            {bottomNavItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
                                >
                                    <span className="bottom-nav-icon">{APPBAR_ICONS[item.href] ?? item.icon}</span>
                                    <span className="bottom-nav-label">{item.label}</span>
                                </Link>
                            ))}
                            <button
                                type="button"
                                className={`bottom-nav-item ${isMobileToolsOpen ? 'active' : ''}`}
                                onClick={() => setIsMobileToolsOpen(true)}
                                aria-label="Otevřít menu"
                            >
                                <span className="bottom-nav-icon">{MenuIcon}</span>
                                <span className="bottom-nav-label">Menu</span>
                            </button>
                        </nav>
                    </>
                )}
            </div>
        </div>
    );
}
