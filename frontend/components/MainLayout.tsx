'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface MainLayoutProps {
    children: ReactNode;
    accounts?: Array<{
        id: string;
        name: string;
        type: string;
        balance: number;
        currency: string;
    }>;
    disableScroll?: boolean;
}

export default function MainLayout({ children, accounts = [], disableScroll = false }: MainLayoutProps) {
    const pathname = usePathname();

    const navItems = [
        { href: '/', label: 'Dashboard', icon: '📊' },
        { href: '/transactions', label: 'Transakce', icon: '💳' },
        { href: '/settings', label: 'Nastavení', icon: '⚙️' },
    ];

    const formatCurrency = (amount: number, currency: string = 'CZK') => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="layout">
            <main className="main-content">
                <nav className="nav" style={{ flexShrink: 0 }}>
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
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

            <aside className="sidebar">
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
                    accounts.map((account) => (
                        <div key={account.id} className="glass account-card">
                            <div className={`account-icon ${account.type}`}>
                                {account.type === 'bank' ? '🏦' : '📈'}
                            </div>
                            <div className="account-info">
                                <div className="account-name">{account.name}</div>
                                <div className="account-balance">
                                    {formatCurrency(account.balance, account.currency)}
                                </div>
                            </div>
                        </div>
                    ))
                )}

                <div style={{ marginTop: 'var(--spacing-xl)' }}>
                    <h5 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                        Rychlé akce
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <button className="btn" style={{ justifyContent: 'flex-start' }}>
                            <span>➕</span>
                            <span>Přidat transakci</span>
                        </button>
                        <button className="btn" style={{ justifyContent: 'flex-start' }}>
                            <span>🔄</span>
                            <span>Synchronizovat</span>
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}
