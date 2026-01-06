'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { syncData } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

interface MainLayoutProps {
    children: ReactNode;
    accounts?: Array<{
        id: string;
        name: string;
        type: string;
        balance: number;
        currency: string;
        institution?: string;
    }>;
    disableScroll?: boolean;
}

export default function MainLayout({ children, accounts = [], disableScroll = false }: MainLayoutProps) {
    const pathname = usePathname();
    const [isSyncing, setIsSyncing] = useState(false);

    const navItems = [
        { href: '/', label: 'Dashboard', icon: '📊' },
        { href: '/transactions', label: 'Transakce', icon: '💳' },
        { href: '/budgets', label: 'Rozpočty', icon: '💰' },
        { href: '/investments', label: 'Investice', icon: '📈' },
        { href: '/settings', label: 'Nastavení', icon: '⚙️' },
    ];

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            await syncData();
            // Optional: force reload to show new data
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
                    accounts.map((account) => {
                        const logoUrl = getBankLogo(account.institution, account.type);
                        const href = account.type === 'investment'
                            ? '/investments'
                            : `/accounts/${account.id}`;

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
                                        {account.type === 'bank' ? '🏦' : '📈'}
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

                <div style={{ marginTop: 'var(--spacing-xl)' }}>
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
            </aside>
        </div>
    );
}
