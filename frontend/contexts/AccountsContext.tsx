'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
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
    const requestIdRef = useRef(0);

    const refreshAccounts = useCallback(async () => {
        const currentRequestId = ++requestIdRef.current;
        try {
            const data = await getDashboard();
            // Only apply if this is still the most recent request
            if (currentRequestId === requestIdRef.current) {
                setAccounts(data.accounts || []);
            }
        } catch (err) {
            console.error('Failed to load accounts:', err);
        } finally {
            if (currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
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
