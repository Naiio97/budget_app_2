'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { syncData, getSyncStatus, SyncStatus } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useAccounts } from '@/contexts/AccountsContext';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';

interface MainLayoutProps {
    children: ReactNode;
    disableScroll?: boolean;
}

export default function MainLayout({ children, disableScroll = false }: MainLayoutProps) {
    const pathname = usePathname();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isCompactNavOpen, setIsCompactNavOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const { accounts } = useAccounts();
    const queryClient = useQueryClient();

    const { data: syncStatus } = useQuery<SyncStatus>({
        queryKey: queryKeys.syncStatus,
        queryFn: getSyncStatus,
        refetchInterval: 60_000, // refresh every minute
    });

    // All navigation items
    const navItems = [
        { href: '/', label: 'Dashboard', icon: Icons.nav.dashboard },
        { href: '/transactions', label: 'Transakce', icon: Icons.nav.transactions },
        { href: '/rozpocet', label: 'Měs. rozpočet', icon: Icons.nav.monthlyBudget },
        { href: '/budgets', label: 'Rozpočty', icon: Icons.nav.budgets },
        { href: '/reports', label: 'Přehledy', icon: Icons.nav.reports },
        { href: '/investments', label: 'Investice', icon: Icons.nav.investments },
        { href: '/settings', label: 'Nastavení', icon: Icons.nav.settings },
    ];

    // Bottom nav shows max 5 items (most important ones)
    const bottomNavItems = [
        { href: '/', label: 'Dashboard', icon: Icons.nav.dashboard },
        { href: '/transactions', label: 'Transakce', icon: Icons.nav.transactions },
        { href: '/rozpocet', label: 'Rozpočet', icon: Icons.nav.monthlyBudget },
        { href: '/investments', label: 'Investice', icon: Icons.nav.investments },
        { href: '/settings', label: 'Více', icon: Icons.nav.more },
    ];

    useEffect(() => {
        const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
        const initial = saved ?? 'dark';
        setTheme(initial);
        document.documentElement.setAttribute('data-mode', initial);
    }, []);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-mode', next);
    };

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Close sidebars when navigating
    useEffect(() => {
        setIsMobileSidebarOpen(false);
        setIsCompactNavOpen(false);
    }, [pathname]);

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            await syncData();
            // Invalidate všechna relevantní data najednou
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

        if (logoFile) {
            return `/logos/${logoFile}.png`;
        }
        return null;
    };

    const getAccountHref = (account: { id: string; type: string }) => {
        if (account.type === 'investment') return '/investments';
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

    const renderSidebarContent = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', flex: '1 1 auto', minHeight: 0 }}>

            {/* Net worth hero */}
            <div className="surface" style={{ padding: 'var(--spacing-md)' }}>
                <div className="kpi-label">Čisté jmění</div>
                <div className="kpi-value num" style={{ fontSize: '1.6rem', marginTop: 4 }}>
                    {formatCurrency(totalBalance)}
                </div>
                <div className="kpi-sub" style={{ marginTop: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>{accounts.length} účtů</span>
                </div>
            </div>

            {/* Accounts list */}
            <div>
                <div className="card-head" style={{ padding: '6px 4px 8px' }}>
                    <h4 style={{ fontSize: 13 }}>Účty</h4>
                    <span className="muted">{accounts.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {accounts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--spacing-md)', color: 'var(--text-3)', fontSize: 13 }}>
                            Žádné účty
                        </div>
                    ) : (
                        accounts.map((account) => {
                            const logoUrl = getBankLogo(account.institution);
                            const href = getAccountHref(account);
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
                                    <div style={{ minWidth: 0 }}>
                                        <div className="acc-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</div>
                                        <div className="acc-balance">{account.currency}</div>
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

            {/* Mobile-only navigation */}
            {isMobile && (
                <div>
                    <div className="card-head" style={{ padding: '6px 4px 8px' }}>
                        <h4 style={{ fontSize: 13 }}>Navigace</h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {navItems.map((item) => (
                            <Link key={item.href} href={item.href}
                                className={`btn ${pathname === item.href ? 'btn-primary' : ''}`}
                                style={{ justifyContent: 'flex-start' }}
                            >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick actions */}
            <div>
                <div className="card-head" style={{ padding: '6px 4px 8px' }}>
                    <h4 style={{ fontSize: 13 }}>Rychlé akce</h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button className="btn btn-sm" onClick={handleSync} disabled={isSyncing}
                        style={{ justifyContent: 'flex-start' }}>
                        {isSyncing ? (
                            <><span style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} /><span>Sync...</span></>
                        ) : (
                            <><span>{Icons.action.sync}</span><span>Sync</span></>
                        )}
                    </button>
                    <Link href="/settings" className="btn btn-sm" style={{ justifyContent: 'flex-start', textDecoration: 'none' }}>
                        <span>{Icons.nav.settings}</span><span>Nastavení</span>
                    </Link>
                    <Link href="/transactions" className="btn btn-sm" style={{ justifyContent: 'flex-start', textDecoration: 'none' }}>
                        <span>{Icons.nav.transactions}</span><span>Transakce</span>
                    </Link>
                    <Link href="/reports" className="btn btn-sm" style={{ justifyContent: 'flex-start', textDecoration: 'none' }}>
                        <span>{Icons.nav.reports}</span><span>Přehledy</span>
                    </Link>
                </div>
                {/* Sync status */}
                {syncStatus && syncStatus.status !== 'never' && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {syncStatus.last_sync && (
                            <span>Poslední sync: {new Date(syncStatus.last_sync).toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })}</span>
                        )}
                        <span style={{ color: syncStatus.syncs_today >= 4 ? 'var(--neg)' : syncStatus.syncs_today >= 3 ? 'var(--warn)' : 'var(--text-3)', fontWeight: syncStatus.syncs_today >= 3 ? 600 : undefined }}>
                            {syncStatus.syncs_today}/4 dnes{syncStatus.syncs_today >= 4 && ' — denní limit'}
                        </span>
                    </div>
                )}
            </div>

        </div>
    );

    return (
        <div className="app-root">
            {/* Koruna appbar — desktop only */}
            <header className="appbar">
                <div className="appbar-logo">
                    <span className="appbar-logo-mark">K</span>
                    <span>Koruna</span>
                </div>
                <nav className="appbar-nav">
                    {navItems.slice(0, 6).map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`appbar-nav-item ${pathname === item.href ? 'active' : ''}`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <button
                    onClick={toggleTheme}
                    aria-label="Přepnout motiv"
                    style={{
                        background: 'var(--surface-sunken)',
                        border: '0.5px solid var(--border)',
                        borderRadius: 'var(--radius-full)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: 16,
                        width: 36,
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </header>

        <div className="layout">
            <main className="main-content">
                {/* Hamburger menu for medium screens */}
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

                {/* Desktop top nav - hidden on mobile, slides in as left sidebar on compact */}
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

                {disableScroll ? (
                    children
                ) : (
                    <div className="main-scroll-area" style={{ flex: 1, overflowY: 'auto', minHeight: 0, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                        {children}
                    </div>
                )}
            </main>

            {/* Desktop sidebar */}
            <aside className={`sidebar ${isMobile && isMobileSidebarOpen ? 'sidebar-open' : ''}`}>
                {isMobile && (
                    <button
                        className="sidebar-close-btn"
                        onClick={() => setIsMobileSidebarOpen(false)}
                        aria-label="Zavřít menu"
                    >
                        ✕
                    </button>
                )}
                {renderSidebarContent()}
            </aside>

            {/* Mobile overlay when sidebar is open */}
            {isMobile && isMobileSidebarOpen && (
                <div
                    className="mobile-overlay"
                    onClick={() => setIsMobileSidebarOpen(false)}
                />
            )}

            {/* Mobile bottom navigation */}
            {isMobile && (
                <nav className="bottom-nav">
                    {bottomNavItems.map((item) => {
                        // The last item ("Více") toggles the sidebar
                        if (item.label === 'Více') {
                            return (
                                <button
                                    key="more"
                                    className={`bottom-nav-item ${isMobileSidebarOpen ? 'active' : ''}`}
                                    onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                                >
                                    <span className="bottom-nav-icon">{item.icon}</span>
                                    <span className="bottom-nav-label">{item.label}</span>
                                </button>
                            );
                        }
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
                            >
                                <span className="bottom-nav-icon">{item.icon}</span>
                                <span className="bottom-nav-label">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            )}
        </div>
        </div>
    );
}
