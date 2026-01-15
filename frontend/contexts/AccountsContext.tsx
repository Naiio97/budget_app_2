'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getDashboard } from '@/lib/api';

interface Account {
    id: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
    institution?: string;
}

interface AccountsContextType {
    accounts: Account[];
    loading: boolean;
    refreshAccounts: () => Promise<void>;
}

const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

export function AccountsProvider({ children }: { children: ReactNode }) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);

    const refreshAccounts = useCallback(async () => {
        try {
            const data = await getDashboard();
            setAccounts(data.accounts || []);
        } catch (err) {
            console.error('Failed to load accounts:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    React.useEffect(() => {
        refreshAccounts();
    }, [refreshAccounts]);

    return (
        <AccountsContext.Provider value={{ accounts, loading, refreshAccounts }}>
            {children}
        </AccountsContext.Provider>
    );
}

export function useAccounts() {
    const context = useContext(AccountsContext);
    if (context === undefined) {
        throw new Error('useAccounts must be used within an AccountsProvider');
    }
    return context;
}
