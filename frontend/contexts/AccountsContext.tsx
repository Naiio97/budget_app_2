'use client';

import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDashboard } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

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
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: queryKeys.dashboard,
        queryFn: getDashboard,
    });

    const refreshAccounts = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    }, [queryClient]);

    return (
        <AccountsContext.Provider value={{
            accounts: data?.accounts || [],
            loading: isLoading,
            refreshAccounts,
        }}>
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
