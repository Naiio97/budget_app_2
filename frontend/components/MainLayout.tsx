'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { syncData } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useAccounts } from '@/contexts/AccountsContext';

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
    const { accounts, loading, refreshAccounts } = useAccounts();

    // All navigation items
    const navItems = [
        { href: '/', label: 'Dashboard', icon: '📊' },
        { href: '/transactions', label: 'Transakce', icon: '💳' },
        { href: '/rozpocet', label: 'Měs. rozpočet', icon: '📅' },
        { href: '/budgets', label: 'Rozpočty', icon: '💰' },
        { href: '/reports', label: 'Přehledy', icon: '📊' },
        { href: '/investments', label: 'Investice', icon: '📈' },
        { href: '/settings', label: 'Nastavení', icon: '⚙️' },
    ];

    // Bottom nav shows max 5 items (most important ones)
    const bottomNavItems = [
        { href: '/', label: 'Dashboard', icon: '📊' },
        { href: '/transactions', label: 'Transakce', icon: '💳' },
        { href: '/rozpocet', label: 'Rozpočet', icon: '📅' },
        { href: '/budgets', label: 'Rozpočty', icon: '💰' },
        { href: '/settings', label: 'Více', icon: '☰' },
    ];

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
            window.location.reload();
        } catch (error) {
            console.error('Sync failed:', error);
            alert('Synchronizace selhala. Zkontrolujte logy nebo nastavení.');
        } finally {
            setIsSyncing(false);
        }
    };

    const getBankLogo = (institution: string | undefined, type: string) => {
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

    const renderSidebarContent = () => (
        <>
            <h4 style={{ marginBottom: 'var(--spacing-lg)', color: 'var(--text-secondary)' }}>
                Napojené účty
            </h4>

            {accounts.length === 0 ? (
                <div className="glass glass-card" style={{ textAlign: 'center' }}>
                    <p className="text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
                        Zatím nemáte připojené žádné účty
                    </p>
                    <Link href="/settings" className="btn btn-primary">
                        Připojit účet
                    </Link>
                </div>
            ) : (
                accounts.map((account) => {
                    const logoUrl = getBankLogo(account.institution, account.type);
                    let href = `/accounts/${account.id}`;
                    if (account.type === 'investment') {
                        href = '/investments';
                    } else if (account.type === 'manual' || account.id.startsWith('manual-')) {
                        const manualId = account.id.replace('manual-', '');
                        href = `/manual-account/${manualId}`;
                    }

                    return (
                        <Link
                            key={account.id}
                            href={href}
                            className="glass account-card"
                        >
                            {logoUrl ? (
                                <div className="account-icon" style={{ background: 'white', overflow: 'hidden', padding: '4px' }}>
                                    <img src={logoUrl} alt={account.institution || account.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                            ) : (
                                <div className={`account-icon ${account.type}`}>
                                    {account.type === 'bank' ? '🏦' : account.type === 'manual' ? '💼' : '📈'}
                                </div>
                            )}
                            <div className="account-info">
                                <div className="account-name">{account.name}</div>
                                <div className="account-balance">
                                    {formatCurrency(account.balance, account.currency)}
                                </div>
                            </div>
                        </Link>
                    );
                })
            )}

            {/* Quick Actions - also shows extra nav links on mobile */}
            <div style={{ marginTop: 'var(--spacing-xl)' }}>
                {isMobile && (
                    <>
                        <h5 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                            Navigace
                        </h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`btn ${pathname === item.href ? 'btn-primary' : ''}`}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                </Link>
                            ))}
                        </div>
                    </>
                )}

                <h5 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                    Rychlé akce
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    <button className="btn" style={{ justifyContent: 'flex-start' }}>
                        <span>➕</span>
                        <span>Přidat transakci</span>
                    </button>
                    <button
                        className="btn"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={handleSync}
                        disabled={isSyncing}
                    >
                        {isSyncing ? (
                            <>
                                <span style={{
                                    animation: 'spin 1s linear infinite',
                                    display: 'inline-block',
                                    width: '1em',
                                    height: '1em',
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    borderTopColor: 'white',
                                    borderRadius: '50%',
                                    marginRight: '8px'
                                }} />
                                <span>Synchronizuji...</span>
                            </>
                        ) : (
                            <>
                                <span>🔄</span>
                                <span>Synchronizovat</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </>
    );

    return (
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
                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginRight: '-12px', paddingRight: '12px' }}>
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
    );
}
