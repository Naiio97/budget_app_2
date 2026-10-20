'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import TransactionList from '@/components/TransactionList';
import { Budget, Transaction, PaginatedResponse, getTransactions } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

// Rozbalený seznam transakcí pod kartou rozpočtu. Filtruje stejně jako
// backendový výpočet `spent` (budgets.get_category_spending): aktuální měsíc,
// jen výdaje, kategorie rozpočtu. Mountuje se až při rozbalení → lazy fetch.

function currentMonthRange(): { date_from: string; date_to: string } {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
        date_from: `${now.getFullYear()}-${mm}-01`,
        date_to: `${now.getFullYear()}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
}

const PREVIEW = 5;

export default function BudgetTransactions({ budget }: { budget: Budget }) {
    const queryClient = useQueryClient();
    const [showAll, setShowAll] = useState(false);
    const { date_from, date_to } = currentMonthRange();

    const { data, isLoading, isError } = useQuery<PaginatedResponse<Transaction>>({
        queryKey: queryKeys.budgetTransactions(budget.id, budget.categories, date_from),
        queryFn: () => getTransactions({
            categories: budget.categories,
            amount_type: 'expense',
            date_from,
            date_to,
            page: 1,
            limit: 200,
        }),
    });

    // Překategorizování mění, co do rozpočtu patří → přepočítat čísla i seznamy
    const handleCategoryChange = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets });
        queryClient.invalidateQueries({ queryKey: queryKeys.budgetOverview });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        queryClient.invalidateQueries({ queryKey: ['budget-transactions'] });
    };

    if (isLoading) {
        return <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Načítám transakce...</p>;
    }
    if (isError || !data) {
        return <p style={{ fontSize: 13, color: 'var(--neg)', margin: 0 }}>Transakce se nepodařilo načíst.</p>;
    }
    if (data.items.length === 0) {
        return <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Tento měsíc tu zatím nejsou žádné platby.</p>;
    }

    const shown = showAll ? data.items : data.items.slice(0, PREVIEW);

    return (
        <div className="bud-tx">
            <div className="bud-tx-head">
                <h4>Poslední platby v rozpočtu</h4>
                {data.items.length > PREVIEW && (
                    <button type="button" className="dash-link bud-tx-toggle" onClick={() => setShowAll(v => !v)}>
                        {showAll ? 'Zobrazit méně' : `Zobrazit vše (${data.total})`}
                    </button>
                )}
            </div>
            <TransactionList transactions={shown} showAccount variant="table" onCategoryChange={handleCategoryChange} />
            {showAll && data.total > data.items.length && (
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    Zobrazeno {data.items.length} z {data.total} transakcí
                </span>
            )}
        </div>
    );
}
