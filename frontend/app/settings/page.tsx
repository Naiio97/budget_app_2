'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import Toast, { ToastMessage } from '@/components/Toast';
import { apiFetch, getSyncStatus, SyncStatus, getDashboard, getApiKeys, ApiKeysResponse, Account } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import AccountsTab from './AccountsTab';
import CategoriesTab from './CategoriesTab';
import AdvancedTab from './AdvancedTab';
import MenuTab from './MenuTab';

type Tab = 'accounts' | 'categories' | 'menu' | 'advanced';

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const refreshAccounts = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }), [queryClient]);

    const [tab, setTab] = useState<Tab>('accounts');
    const [toast, setToast] = useState<ToastMessage>(null);

    // Sdílený stav mezi taby: seznam účtů (Účty + sync v Pokročilých),
    // API klíče (connect modal v Účtech + formulář v Pokročilých), stav syncu.
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [apiKeysLoaded, setApiKeysLoaded] = useState<ApiKeysResponse | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

    // Fit-mode (two scrolling columns) is desktop-only; on phones the page
    // scrolls normally so cards stack instead of fighting over a fixed height.
    const [isNarrow, setIsNarrow] = useState(false);
    useEffect(() => {
        const check = () => setIsNarrow(window.innerWidth <= 1200);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        (async () => {
            // Návrat z bankovní autorizace (GoCardless redirect) — dokončit
            // připojení dřív, než se načtou účty.
            const urlParams = new URLSearchParams(window.location.search);
            const ref = urlParams.get('ref');
            if (ref) {
                try {
                    const res = await apiFetch(`/accounts/connect/bank/callback?ref=${ref}`);
                    if (!res.ok) {
                        console.error('Bank connect callback failed:', res.status, await res.text().catch(() => ''));
                        alert('Připojení banky se nepodařilo dokončit. Zkuste to prosím znovu, případně spusťte synchronizaci.');
                    }
                    window.history.replaceState({}, '', '/settings');
                } catch (err) { console.error(err); }
            }
            try {
                const [status, dashData, keys] = await Promise.all([getSyncStatus(), getDashboard(true), getApiKeys()]);
                setSyncStatus(status);
                setApiKeysLoaded(keys);
                setAccounts(dashData.accounts || []);
            } catch (err) { console.error(err); }
            refreshAccounts();
        })();
    }, [refreshAccounts]);

    return (
        <MainLayout disableScroll={tab === 'categories' && !isNarrow}>
            <div className={`page-container settings-page ${tab === 'categories' && !isNarrow ? 'settings-page-fit' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                {/* Page head */}
                <div className="page-head">
                    <div>
                        <h1>Nastavení</h1>
                        <div className="sub">Účty, kategorie a propojení</div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                    {([['accounts', 'Účty'], ['categories', 'Kategorie'], ['menu', 'Menu'], ['advanced', 'Pokročilé']] as [Tab, string][]).map(([val, label]) => (
                        <div key={val} className={`seg-item ${tab === val ? 'active' : ''}`} onClick={() => setTab(val)}>
                            {label}
                        </div>
                    ))}
                </div>

                {tab === 'accounts' && (
                    <AccountsTab accounts={accounts} setAccounts={setAccounts} apiKeysLoaded={apiKeysLoaded} refreshAccounts={refreshAccounts} />
                )}
                {tab === 'categories' && <CategoriesTab setToast={setToast} />}
                {tab === 'advanced' && (
                    <AdvancedTab
                        syncStatus={syncStatus}
                        setSyncStatus={setSyncStatus}
                        setAccounts={setAccounts}
                        refreshAccounts={refreshAccounts}
                        apiKeysLoaded={apiKeysLoaded}
                        setApiKeysLoaded={setApiKeysLoaded}
                        setToast={setToast}
                    />
                )}
                {tab === 'menu' && <MenuTab />}

                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        </MainLayout>
    );
}
