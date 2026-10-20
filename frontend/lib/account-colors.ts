'use client';

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccountColors, saveAccountColor } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { avatarColor } from '@/lib/account-avatar';

// Barvy, ze kterých si uživatel v Nastavení → Účty vybírá. Stejný jazyk jako
// ostatní tlumené barvy aplikace (avatary, grafy).
export const ACCOUNT_COLOR_PALETTE: Array<{ name: string; value: string }> = [
    { name: 'Modrá', value: '#3b7dd8' },
    { name: 'Tyrkysová', value: '#4a9db0' },
    { name: 'Zelená', value: '#2f9c78' },
    { name: 'Limetková', value: '#84a93a' },
    { name: 'Žlutá', value: '#c9a227' },
    { name: 'Oranžová', value: '#c0794d' },
    { name: 'Červená', value: '#cf5d5d' },
    { name: 'Růžová', value: '#c0609a' },
    { name: 'Fialová', value: '#7a67c4' },
    { name: 'Indigo', value: '#5560c9' },
    { name: 'Šedá', value: '#6b7586' },
    { name: 'Půlnoční', value: '#24303f' },
];

type ColorMap = Record<string, string>;

/**
 * Uživatelem zvolené barvy účtů (uložené na backendu). `colorFor(id, name)` vrací
 * zvolenou barvu, jinak odvozenou z názvu — stejně jako dřív.
 */
export function useAccountColors() {
    const queryClient = useQueryClient();
    const { data } = useQuery({
        queryKey: queryKeys.accountColors,
        queryFn: getAccountColors,
        staleTime: 5 * 60_000,
    });
    const colors = useMemo<ColorMap>(() => data?.colors ?? {}, [data]);

    const mutation = useMutation({
        mutationFn: ({ id, color }: { id: string; color: string | null }) => saveAccountColor(id, color),
        // Optimisticky: barva se změní hned ve všech kartách, při chybě se vrátí
        onMutate: async ({ id, color }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.accountColors });
            const prev = queryClient.getQueryData<{ colors: ColorMap }>(queryKeys.accountColors);
            const next = { ...(prev?.colors ?? {}) };
            if (color) next[id] = color; else delete next[id];
            queryClient.setQueryData(queryKeys.accountColors, { colors: next });
            return { prev };
        },
        onError: (_e, _v, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(queryKeys.accountColors, ctx.prev);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.accountColors }),
    });

    const setColor = useCallback((id: string, color: string | null) => mutation.mutate({ id, color }), [mutation]);
    const colorFor = useCallback((id: string, name: string) => colors[id] ?? avatarColor(name), [colors]);

    return { colors, setColor, colorFor };
}
