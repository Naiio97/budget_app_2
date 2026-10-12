'use client';

import { useCallback } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { syncData } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

const SYNC_KEY = ['sync'];

/**
 * Synchronizace účtů s bankami. Stav „právě běží" je sdílený přes React Query,
 * takže víc tlačítek (horní lišta, karta účtů…) se navzájem nepřeklikává.
 */
export function useSync() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationKey: SYNC_KEY,
        mutationFn: syncData,
        onSuccess: async (result) => {
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
            queryClient.invalidateQueries({ queryKey: ['budget-transactions'] });
            queryClient.invalidateQueries({ queryKey: queryKeys.syncStatus });
            queryClient.invalidateQueries({ queryKey: queryKeys.pies });
        },
        onError: (error) => {
            console.error('Sync failed:', error);
            alert('Synchronizace selhala. Zkontrolujte logy nebo nastavení.');
        },
        // I selhaný běh se zapisuje do historie — obnovit vždy
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.syncHistory });
        },
    });

    const isSyncing = useIsMutating({ mutationKey: SYNC_KEY }) > 0;
    const { mutate } = mutation;
    const sync = useCallback(() => {
        if (!isSyncing) mutate();
    }, [isSyncing, mutate]);

    return { sync, isSyncing };
}
