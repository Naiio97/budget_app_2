'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState, useEffect } from 'react';
import { Icons } from '@/lib/icons';

interface MainLayoutProps {
    children: ReactNode;
    disableScroll?: boolean;
}

export default function MainLayout({ children, disableScroll = false }: MainLayoutProps) {
    const pathname = usePathname();
    const [isCompactNavOpen, setIsCompactNavOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

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

    const bottomNavItems = [
        { href: '/', label: 'Dashboard', icon: Icons.nav.dashboard },
        { href: '/transactions', label: 'Transakce', icon: Icons.nav.transactions },
        { href: '/rozpocet', label: 'Rozpočet', icon: Icons.nav.monthlyBudget },
        { href: '/investments', label: 'Investice', icon: Icons.nav.investments },
        { href: '/settings', label: 'Nastavení', icon: Icons.nav.settings },
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

    // Close compact nav when navigating
    useEffect(() => {
        setIsCompactNavOpen(false);
    }, [pathname]);



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

            {/* Mobile bottom navigation */}
            {isMobile && (
                <nav className="bottom-nav">
                    {bottomNavItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
                        >
                            <span className="bottom-nav-icon">{item.icon}</span>
                            <span className="bottom-nav-label">{item.label}</span>
                        </Link>
                    ))}
                </nav>
            )}
        </div>
        </div>
    );
}
