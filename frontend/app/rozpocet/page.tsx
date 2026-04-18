'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import GlassCard from '@/components/GlassCard';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

interface MonthlyExpense {
    id: number;
    name: string;
    amount: number;
    my_percentage: number;
    my_amount: number;
    my_amount_override: number | null;
    is_paid: boolean;
    is_auto_paid: boolean;
    matched_transaction_id: string | null;
    recurring_expense_id: number | null;
}

interface MonthlyBudget {
    id: number;
    year_month: string;
    salary: number;
    other_income: number;
    meal_vouchers: number;
    investment_amount: number;
    surplus_to_savings: number;
    is_closed: boolean;
    total_income: number;
    total_expenses: number;
    remaining: number;
    expenses: MonthlyExpense[];
}

interface RecurringExpense {
    id: number;
    name: string;
    default_amount: number;
    is_auto_paid: boolean;
    match_pattern: string | null;
    category: string | null;
    order_index: number;
    is_active: boolean;
}

interface Envelope {
    id: number;
    name: string;
    amount: number;
    is_mine: boolean;
    note: string | null;
}

interface ManualAccount {
    id: number;
    name: string;
    balance: number;
    currency: string;
    my_balance: number;
    envelopes: Envelope[];
}

interface AnnualData {
    year: number;
    months: Array<{
        month: number;
        year_month: string;
        income: number;
        expenses: number;
        investments: number;
        savings: number;
        remaining: number;
    }>;
    totals: {
        income: number;
        expenses: number;
        investments: number;
        savings: number;
        net: number;
    };
    previous_year?: {
        income: number;
        expenses: number;
        investments: number;
        savings: number;
        net: number;
    };
    expense_breakdown: Record<string, number>;
    averages: {
        income: number;
        expenses: number;
        investments: number;
    };
}

const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

export default function RozpocetPage() {
    const queryClient = useQueryClient();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

    // Forms
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [newExpense, setNewExpense] = useState({ name: '', amount: '', is_auto_paid: false, match_pattern: '' });
    const [showAddAccount, setShowAddAccount] = useState(false);
    const [newAccount, setNewAccount] = useState({ name: '', balance: '' });
    const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
    const [editAccountBalance, setEditAccountBalance] = useState('');
    const [showAddItem, setShowAddItem] = useState<number | null>(null);
    const [newItem, setNewItem] = useState({ name: '', amount: '', is_mine: false, note: '' });
    const [isAutoSyncing, setIsAutoSyncing] = useState(false);
    const [editingMyAmounts, setEditingMyAmounts] = useState<Record<number, string>>({});
    const [editingAmounts, setEditingAmounts] = useState<Record<number, string>>({});

    // Track which months we've already auto-synced so we don't loop
    const autoSyncedMonths = useRef<Set<string>>(new Set());

    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    useQuery<RecurringExpense[]>({
        queryKey: queryKeys.recurringExpenses,
        queryFn: () => fetch(`${API_BASE}/recurring-expenses`).then(r => r.json()),
        staleTime: 5 * 60 * 1000,
    });

    const { data: manualAccounts = [] } = useQuery<ManualAccount[]>({
        queryKey: queryKeys.manualAccounts,
        queryFn: () => fetch(`${API_BASE}/manual-accounts/`).then(r => r.json()),
    });

    const { data: budget } = useQuery<MonthlyBudget>({
        queryKey: queryKeys.monthlyBudget(yearMonth),
        queryFn: () => fetch(`${API_BASE}/monthly-budget/${yearMonth}`).then(r => r.json()),
        enabled: viewMode === 'month',
    });

    const { data: annualData } = useQuery<AnnualData>({
        queryKey: queryKeys.annualOverview(selectedYear),
        queryFn: () => fetch(`${API_BASE}/annual-overview/${selectedYear}`).then(r => r.json()),
        enabled: viewMode === 'year',
    });

    const refreshBudget = useCallback(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.monthlyBudget(yearMonth) }),
        [queryClient, yearMonth]
    );

    const refreshManualAccounts = () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.manualAccounts });

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    // === Month navigation ===
    const goToPrevMonth = () => {
        if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
        else setSelectedMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
        else setSelectedMonth(m => m + 1);
    };

    // === Auto-sync on month open ===
    // - Income sync: only when salary is 0 (don't overwrite manually set values)
    // - Match transactions: always (idempotent, just marks expenses as paid)
    useEffect(() => {
        if (!budget || viewMode !== 'month') return;
        if (autoSyncedMonths.current.has(yearMonth)) return;
        autoSyncedMonths.current.add(yearMonth);

        const runAutoSync = async () => {
            setIsAutoSyncing(true);
            try {
                if (budget.salary === 0) {
                    await fetch(`${API_BASE}/monthly-budget/${yearMonth}/sync-income`, { method: 'POST' });
                }
                await fetch(`${API_BASE}/monthly-budget/${yearMonth}/match-transactions`, { method: 'POST' });
                await refreshBudget();
            } finally {
                setIsAutoSyncing(false);
            }
        };

        runAutoSync();
        // Záměrně závisíme jen na budget?.id — budget.salary čteme uvnitř, ale nechceme re-fire při jeho změně.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budget?.id, yearMonth, viewMode, refreshBudget]);

    // === Handlers ===

    const updateBudget = async (field: string, value: number) => {
        try {
            await fetch(`${API_BASE}/monthly-budget/${yearMonth}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to update budget:', err);
        }
    };

    const toggleExpensePaid = async (expenseId: number, isPaid: boolean) => {
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_paid: !isPaid })
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to update expense:', err);
        }
    };

    const saveExpenseAmount = async (expense: MonthlyExpense) => {
        const raw = editingAmounts[expense.id];
        if (raw === undefined) return;
        const newAmount = parseFloat(raw) || 0;
        setEditingAmounts(prev => { const next = { ...prev }; delete next[expense.id]; return next; });
        if (newAmount === expense.amount) return;
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expense.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: newAmount })
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to update expense:', err);
        }
    };

    const saveMyAmount = async (expense: MonthlyExpense) => {
        const raw = editingMyAmounts[expense.id];
        if (raw === undefined) return;
        const newMyAmount = parseFloat(raw) || 0;
        setEditingMyAmounts(prev => { const next = { ...prev }; delete next[expense.id]; return next; });
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expense.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ my_amount_override: newMyAmount }),
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to update my_amount:', err);
        }
    };

    const saveCustomOverride = async (expenseId: number, my_amount_override: number) => {
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ my_amount_override }),
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to save custom override:', err);
        }
    };

    const updateExpensePercentage = async (expenseId: number, my_percentage: number) => {
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ my_percentage, my_amount_override: -1 })
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to update expense percentage:', err);
        }
    };

    const createRecurringExpense = async () => {
        if (!newExpense.name || !newExpense.amount) return;
        try {
            await fetch(`${API_BASE}/recurring-expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newExpense.name,
                    default_amount: parseFloat(newExpense.amount),
                    is_auto_paid: newExpense.is_auto_paid,
                    match_pattern: newExpense.match_pattern || null
                })
            });
            await fetch(`${API_BASE}/monthly-budget/${yearMonth}/expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newExpense.name,
                    default_amount: parseFloat(newExpense.amount),
                    is_auto_paid: newExpense.is_auto_paid
                })
            });
            setNewExpense({ name: '', amount: '', is_auto_paid: false, match_pattern: '' });
            setShowAddExpense(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses });
            refreshBudget();
        } catch (err) {
            console.error('Failed to create expense:', err);
        }
    };

    const deleteMonthlyExpense = async (expenseId: number, recurringExpenseId: number | null) => {
        const deleteRecurring = recurringExpenseId && confirm('Smazat také šablonu pravidelného výdaje?\n\nANO = smazat ze všech budoucích měsíců\nNE = smazat jen z tohoto měsíce');
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expenseId}`, { method: 'DELETE' });
            if (deleteRecurring && recurringExpenseId) {
                await fetch(`${API_BASE}/recurring-expenses/${recurringExpenseId}`, { method: 'DELETE' });
                queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses });
            }
            refreshBudget();
        } catch (err) {
            console.error('Failed to delete expense:', err);
        }
    };

    const matchTransactions = async () => {
        try {
            const res = await fetch(`${API_BASE}/monthly-budget/${yearMonth}/match-transactions`, { method: 'POST' });
            const data = await res.json();
            alert(`Spárováno ${data.matched_count} výdajů:\n\n📝 Podle patternu: ${data.details?.by_pattern || 0}\n💰 Podle částky: ${data.details?.by_amount || 0}\n📂 Podle kategorie: ${data.details?.by_category || 0}`);
            refreshBudget();
        } catch (err) {
            console.error('Failed to match transactions:', err);
        }
    };

    const copyFromPrevious = async () => {
        try {
            const res = await fetch(`${API_BASE}/monthly-budget/${yearMonth}/copy-previous`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) alert(`Zkopírováno ${data.expenses_copied} výdajů z ${data.from}`);
            else alert(data.detail || 'Chyba při kopírování');
            refreshBudget();
        } catch (err) {
            console.error('Failed to copy from previous:', err);
        }
    };

    const deleteBudget = async () => {
        if (!confirm(`Opravdu chcete smazat rozpočet pro ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}?`)) return;
        try {
            await fetch(`${API_BASE}/monthly-budget/${yearMonth}`, { method: 'DELETE' });
            refreshBudget();
        } catch (err) {
            console.error('Failed to delete budget:', err);
        }
    };

    const syncIncome = async () => {
        try {
            const res = await fetch(`${API_BASE}/monthly-budget/${yearMonth}/sync-income`, { method: 'POST' });
            const data = await res.json();
            alert(`Načteno z transakcí:\nVýplata: ${formatCurrency(data.salary)}`);
            refreshBudget();
        } catch (err) {
            console.error('Failed to sync income:', err);
        }
    };

    const createManualAccount = async () => {
        if (!newAccount.name) return;
        try {
            await fetch(`${API_BASE}/manual-accounts/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newAccount.name, balance: parseFloat(newAccount.balance) || 0 })
            });
            setNewAccount({ name: '', balance: '' });
            setShowAddAccount(false);
            refreshManualAccounts();
        } catch (err) {
            console.error('Failed to create account:', err);
        }
    };

    const updateManualAccountBalance = async (accountId: number) => {
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ balance: parseFloat(editAccountBalance) })
            });
            setEditingAccountId(null);
            refreshManualAccounts();
        } catch (err) {
            console.error('Failed to update account:', err);
        }
    };

    const addAccountItem = async (accountId: number) => {
        if (!newItem.name || !newItem.amount) return;
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}/envelopes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newItem.name, amount: parseFloat(newItem.amount), is_mine: newItem.is_mine, note: newItem.note || null })
            });
            setNewItem({ name: '', amount: '', is_mine: false, note: '' });
            setShowAddItem(null);
            refreshManualAccounts();
        } catch (err) {
            console.error('Failed to add envelope:', err);
        }
    };

    const deleteAccountItem = async (accountId: number, itemId: number) => {
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}/envelopes/${itemId}`, { method: 'DELETE' });
            refreshManualAccounts();
        } catch (err) {
            console.error('Failed to delete envelope:', err);
        }
    };

    // === Computed stats ===
    const totalIncome = budget?.total_income || 0;
    const totalExpenses = budget?.total_expenses || 0;
    const remaining = budget?.remaining || 0;
    const investmentAmount = budget?.investment_amount || 0;
    const expensePct = totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0;
    const savingsRate = totalIncome > 0 ? Math.round(((investmentAmount + (budget?.surplus_to_savings || 0)) / totalIncome) * 100) : 0;
    const paidCount = budget?.expenses.filter(e => e.is_paid).length || 0;
    const totalCount = budget?.expenses.length || 0;
    const budgetUsedPct = Math.min(100, totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0);

    // === Render Functions ===

    const renderKpiBar = () => {
        if (!budget) return null;
        const isOverBudget = remaining < 0;

        return (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-md)',
            }}>
                {/* Příjmy */}
                <GlassCard style={{ padding: '12px 16px', margin: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Příjmy</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-success)' }}>{formatCurrency(totalIncome)}</div>
                    {isAutoSyncing && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{Icons.action.sync} Načítám...</div>}
                </GlassCard>

                {/* Výdaje */}
                <GlassCard style={{ padding: '12px 16px', margin: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Výdaje</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-danger, #ef4444)' }}>{formatCurrency(totalExpenses)}</div>
                    <div style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${budgetUsedPct}%`, background: budgetUsedPct > 90 ? 'var(--accent-danger, #ef4444)' : budgetUsedPct > 70 ? '#f59e0b' : 'var(--accent-success)', borderRadius: '2px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>{expensePct}% z příjmů</div>
                </GlassCard>

                {/* Zbývá */}
                <GlassCard style={{ padding: '12px 16px', margin: 0, background: isOverBudget ? 'rgba(239, 68, 68, 0.08)' : undefined }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Zbývá</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: isOverBudget ? 'var(--accent-danger, #ef4444)' : 'var(--accent-success)' }}>
                        {isOverBudget ? '−' : '+'}{formatCurrency(Math.abs(remaining))}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        {isOverBudget ? `${Icons.status.overBudget} Přečerpáno` : `${Icons.status.ok} V pohodě`}
                    </div>
                </GlassCard>

                {/* Zaplaceno */}
                <GlassCard style={{ padding: '12px 16px', margin: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Zaplaceno</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: paidCount === totalCount && totalCount > 0 ? 'var(--accent-success)' : 'var(--text-primary)' }}>
                        {paidCount} / {totalCount}
                    </div>
                    <div style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: totalCount > 0 ? `${(paidCount / totalCount) * 100}%` : '0%', background: 'var(--accent-success)', borderRadius: '2px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>výdajů</div>
                </GlassCard>

                {/* Spoření */}
                <GlassCard style={{ padding: '12px 16px', margin: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Spoření</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{formatCurrency(investmentAmount + (budget?.surplus_to_savings || 0))}</div>
                    <div style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, savingsRate)}%`, background: 'var(--accent-primary)', borderRadius: '2px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '3px' }}>{savingsRate}% z příjmů</div>
                </GlassCard>
            </div>
        );
    };

    const renderExpenseChart = () => {
        if (!budget?.expenses.length) return null;
        const sorted = [...budget.expenses].sort((a, b) => b.my_amount - a.my_amount);
        const maxAmount = sorted[0]?.my_amount || 1;

        return (
            <GlassCard>
                <h3 style={{ margin: '0 0 var(--spacing-md) 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{Icons.section.expensesByItem} Výdaje podle položek</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto', overflowX: 'clip', paddingRight: '4px', overscrollBehavior: 'contain' }}>
                    {sorted.map(exp => {
                        const pct = Math.round((exp.my_amount / totalExpenses) * 100);
                        const barWidth = Math.round((exp.my_amount / maxAmount) * 100);
                        return (
                            <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: exp.is_paid ? 'var(--accent-success)' : exp.is_auto_paid ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255,255,255,0.2)' }} />
                                <span style={{ fontSize: '0.78rem', width: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={exp.name}>{exp.name}</span>
                                <div style={{ flex: 1, height: '14px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${barWidth}%`, background: exp.is_paid ? 'var(--accent-success)' : 'var(--accent-primary)', borderRadius: '3px', opacity: exp.is_paid ? 0.8 : 1, transition: 'width 0.4s ease' }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '36px', textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', width: '72px', textAlign: 'right', flexShrink: 0 }}>{formatCurrency(exp.my_amount)}</span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', gap: '16px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                    <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-success)', marginRight: '4px' }} />Zaplaceno</span>
                    <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', marginRight: '4px' }} />Nezaplaceno</span>
                </div>
            </GlassCard>
        );
    };

    const renderIncomeSection = () => (
        <GlassCard>
            <div className="section-header-wrap">
                <h3 style={{ margin: 0, color: 'var(--accent-success)' }}>{Icons.section.income} Příjmy</h3>
                <div className="section-actions">
                    <button className="btn" onClick={syncIncome} style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}>
                        {Icons.action.sync} Načíst z transakcí
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                    { label: 'Výplata', field: 'salary', value: budget?.salary || 0 },
                    { label: 'Další příjem', field: 'other_income', value: budget?.other_income || 0 },
                    { label: 'Stravenky', field: 'meal_vouchers', value: budget?.meal_vouchers || 0 },
                ].map(item => (
                    <div key={item.field} className="income-input-row">
                        <span>{item.label}</span>
                        <input
                            type="number"
                            className="input"
                            value={item.value}
                            onChange={(e) => updateBudget(item.field, parseFloat(e.target.value) || 0)}
                            style={{ width: '120px', textAlign: 'right', padding: '4px 8px' }}
                        />
                    </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--accent-success)' }}>
                    <span>Příjmy celkem</span>
                    <span>{formatCurrency(totalIncome)}</span>
                </div>
            </div>
        </GlassCard>
    );

    const renderExpensesSection = () => (
        <GlassCard>
            <div className="section-header-wrap">
                <h3 style={{ margin: 0, color: 'var(--accent-error, #ef4444)' }}>{Icons.section.recurringExpenses} Pravidelné výdaje</h3>
                <div className="section-actions">
                    <button className="btn" onClick={copyFromPrevious} style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}>
                        {Icons.action.loadFromHistory} Z minula
                    </button>
                    <button className="btn" onClick={matchTransactions} style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}>
                        {Icons.action.match} Spárovat
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddExpense(true)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        + Přidat
                    </button>
                </div>
            </div>

            {showAddExpense && (
                <div style={{ padding: 'var(--spacing-md)', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input className="input" placeholder="Název výdaje" value={newExpense.name} onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="number" className="input" placeholder="Částka" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} style={{ flex: 1 }} />
                        <input className="input" placeholder="Match pattern (volitelné)" value={newExpense.match_pattern} onChange={(e) => setNewExpense({ ...newExpense, match_pattern: e.target.value })} style={{ flex: 1 }} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newExpense.is_auto_paid} onChange={(e) => setNewExpense({ ...newExpense, is_auto_paid: e.target.checked })} />
                        Automatická platba (zelená)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary" onClick={createRecurringExpense}>Uložit</button>
                        <button className="btn" onClick={() => setShowAddExpense(false)}>Zrušit</button>
                    </div>
                </div>
            )}

            {/* Progress header */}
            {totalCount > 0 && (
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                        <span>Zaplaceno {paidCount} z {totalCount}</span>
                        <span>{formatCurrency(budget?.expenses.filter(e => e.is_paid).reduce((s, e) => s + e.my_amount, 0) || 0)} / {formatCurrency(totalExpenses)}</span>
                    </div>
                    <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${totalCount > 0 ? (paidCount / totalCount) * 100 : 0}%`, background: 'var(--accent-success)', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                    </div>
                </div>
            )}

            <div style={{ maxHeight: '380px', overflowY: 'auto', overflowX: 'clip', overscrollBehavior: 'contain' }}>
                {budget?.expenses.map(expense => (
                    <div
                        key={expense.id}
                        className="expense-row"
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '7px 6px',
                            borderRadius: '6px',
                            background: expense.is_auto_paid ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
                            marginBottom: '2px',
                            borderLeft: expense.matched_transaction_id ? '3px solid var(--accent-success)' : '3px solid transparent',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                            <input
                                type="checkbox"
                                checked={expense.is_paid}
                                onChange={() => toggleExpensePaid(expense.id, expense.is_paid)}
                                style={{ cursor: 'pointer', flexShrink: 0 }}
                            />
                            <span style={{ textDecoration: expense.is_paid ? 'line-through' : 'none', opacity: expense.is_paid ? 0.55 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                                {expense.name}
                                {expense.matched_transaction_id && <span style={{ marginLeft: '5px', fontSize: '0.7rem', color: 'var(--accent-success)' }}>{Icons.status.ok} spárováno</span>}
                            </span>
                        </div>
                        <div className="expense-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <CustomSelect
                                compact
                                value={expense.my_amount_override !== null ? 'custom' : (expense.my_percentage === 100 ? '100' : expense.my_percentage === 50 ? '50' : 'custom')}
                                onChange={(val) => {
                                    if (val === '100') updateExpensePercentage(expense.id, 100);
                                    else if (val === '50') updateExpensePercentage(expense.id, 50);
                                    else {
                                        // 'custom' → uložit aktuální my_amount jako override, aby se select přepnul na "Vlastní"
                                        setEditingMyAmounts(prev => ({
                                            ...prev,
                                            [expense.id]: String(Math.round(expense.my_amount)),
                                        }));
                                        if (expense.my_amount_override === null) {
                                            saveCustomOverride(expense.id, Math.round(expense.my_amount));
                                        }
                                    }
                                }}
                                style={{ width: '78px' }}
                                options={[
                                    { value: '100', label: '100%' },
                                    { value: '50', label: '50%' },
                                    { value: 'custom', label: 'Vlastní' },
                                ]}
                            />
                            <input
                                type="number"
                                className="input"
                                value={editingAmounts[expense.id] ?? expense.amount}
                                onChange={(e) => setEditingAmounts(prev => ({ ...prev, [expense.id]: e.target.value }))}
                                onBlur={() => saveExpenseAmount(expense)}
                                style={{ width: '95px', textAlign: 'right', padding: '4px 8px' }}
                                title="Celková částka"
                            />
                            {(expense.my_percentage < 100 || expense.my_amount_override !== null) && (
                                <input
                                    type="number"
                                    className="input"
                                    value={editingMyAmounts[expense.id] ?? Math.round(expense.my_amount)}
                                    onChange={(e) => setEditingMyAmounts(prev => ({ ...prev, [expense.id]: e.target.value }))}
                                    onBlur={() => saveMyAmount(expense)}
                                    style={{ width: '85px', textAlign: 'right', padding: '4px 8px', color: 'var(--accent-primary)', borderColor: 'rgba(0,122,255,0.3)' }}
                                    title="Moje část (Kč)"
                                />
                            )}
                            <button
                                onClick={() => deleteMonthlyExpense(expense.id, expense.recurring_expense_id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.4, padding: '4px' }}
                            >{Icons.action.delete}</button>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Výdaje celkem</span>
                <span style={{ color: 'var(--accent-error, #ef4444)' }}>{formatCurrency(totalExpenses)}</span>
            </div>
        </GlassCard>
    );

    const renderSurplusSection = () => {
        const isOverBudget = remaining < 0;
        const netSavings = investmentAmount + (budget?.surplus_to_savings || 0);
        return (
            <GlassCard>
                <h3 style={{ margin: '0 0 var(--spacing-md) 0' }}>{Icons.section.surplus} Přebytek & Spoření</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem' }}>Investice tento měsíc</span>
                        <input
                            type="number"
                            className="input"
                            value={budget?.investment_amount || 0}
                            onChange={(e) => updateBudget('investment_amount', parseFloat(e.target.value) || 0)}
                            style={{ width: '110px', textAlign: 'right', padding: '4px 8px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem' }}>Posláno na spořící účet</span>
                        <input
                            type="number"
                            className="input"
                            value={budget?.surplus_to_savings || 0}
                            onChange={(e) => updateBudget('surplus_to_savings', parseFloat(e.target.value) || 0)}
                            style={{ width: '110px', textAlign: 'right', padding: '4px 8px' }}
                        />
                    </div>

                    {/* Savings rate bar */}
                    {totalIncome > 0 && (
                        <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Spořící sazba</span>
                                <span style={{ fontWeight: 600, color: savingsRate >= 15 ? 'var(--accent-success)' : savingsRate >= 10 ? '#f59e0b' : 'var(--accent-danger, #ef4444)' }}>
                                    {savingsRate}% {savingsRate >= 15 ? Icons.savingsRate.good : savingsRate >= 10 ? Icons.savingsRate.neutral : Icons.savingsRate.bad}
                                </span>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, savingsRate)}%`, background: savingsRate >= 15 ? 'var(--accent-success)' : savingsRate >= 10 ? '#f59e0b' : 'var(--accent-danger, #ef4444)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                                {/* 15% target marker */}
                                <div style={{ position: 'absolute', top: 0, left: '15%', width: '2px', height: '100%', background: 'rgba(255,255,255,0.4)' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                <span>{formatCurrency(netSavings)} ušetřeno</span>
                                <span>cíl: 15%</span>
                            </div>
                        </div>
                    )}

                    {/* Remaining */}
                    <div style={{
                        padding: 'var(--spacing-md)',
                        background: isOverBudget ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                        borderRadius: '8px',
                        textAlign: 'center',
                        border: `1px solid ${isOverBudget ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                    }}>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Zbylé peníze</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: isOverBudget ? 'var(--accent-danger, #ef4444)' : 'var(--accent-success)' }}>
                            {formatCurrency(remaining)}
                        </div>
                        {isOverBudget && <div style={{ fontSize: '0.78rem', color: 'var(--accent-danger, #ef4444)', marginTop: '2px' }}>{Icons.status.overBudget} Přečerpáno!</div>}
                    </div>
                </div>
            </GlassCard>
        );
    };

    const renderManualAccounts = () => (
        <GlassCard>
            <div className="section-header-wrap">
                <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>{Icons.section.savingsAccounts} Spořící účty</h3>
                <div className="section-actions">
                    <button className="btn btn-primary" onClick={() => setShowAddAccount(true)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        + Přidat
                    </button>
                </div>
            </div>

            {showAddAccount && (
                <div style={{ padding: 'var(--spacing-md)', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: 'var(--spacing-md)', display: 'flex', gap: '8px' }}>
                    <input className="input" placeholder="Název účtu" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} style={{ flex: 1 }} />
                    <input type="number" className="input" placeholder="Zůstatek" value={newAccount.balance} onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })} style={{ width: '120px' }} />
                    <button className="btn btn-primary" onClick={createManualAccount}>Uložit</button>
                    <button className="btn" onClick={() => setShowAddAccount(false)}>×</button>
                </div>
            )}

            {manualAccounts.map(account => (
                <div key={account.id} style={{ padding: 'var(--spacing-md)', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: 'var(--spacing-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600 }}>{account.name}</span>
                        {editingAccountId === account.id ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <input type="number" className="input" value={editAccountBalance} onChange={(e) => setEditAccountBalance(e.target.value)} style={{ width: '100px', padding: '4px 8px' }} />
                                <button className="btn btn-primary" onClick={() => updateManualAccountBalance(account.id)} style={{ padding: '4px 8px' }}>{Icons.action.confirm}</button>
                                <button className="btn" onClick={() => setEditingAccountId(null)} style={{ padding: '4px 8px' }}>×</button>
                            </div>
                        ) : (
                            <span onClick={() => { setEditingAccountId(account.id); setEditAccountBalance(String(account.balance)); }} style={{ cursor: 'pointer', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                {formatCurrency(account.balance)} {Icons.action.edit}
                            </span>
                        )}
                    </div>

                    {Array.isArray(account.envelopes) && account.envelopes.length > 0 && (
                        <div style={{ paddingLeft: '14px', borderLeft: '2px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Obálky:</div>
                            {account.envelopes.map(env => (
                                <div key={env.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '2px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {env.is_mine ? Icons.envelope.mine : Icons.envelope.shared} {env.name}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ color: env.is_mine ? 'var(--accent-success)' : '#f59e0b' }}>
                                            {env.is_mine ? '' : '−'}{formatCurrency(env.amount)}
                                        </span>
                                        <button onClick={() => deleteAccountItem(account.id, env.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', opacity: 0.4 }}>{Icons.action.delete}</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {showAddItem === account.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <input className="input" placeholder="Název" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} style={{ flex: 1, padding: '4px 8px' }} />
                                <input type="number" className="input" placeholder="Částka" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} style={{ width: '80px', padding: '4px 8px' }} />
                                <button className="btn btn-primary" onClick={() => addAccountItem(account.id)} style={{ padding: '4px 8px' }}>{Icons.action.confirm}</button>
                                <button className="btn" onClick={() => setShowAddItem(null)} style={{ padding: '4px 8px' }}>×</button>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer', paddingLeft: '2px' }}>
                                <input type="checkbox" checked={newItem.is_mine} onChange={(e) => setNewItem({ ...newItem, is_mine: e.target.checked })} />
                                Volné (moje peníze)
                            </label>
                        </div>
                    ) : (
                        <button onClick={() => setShowAddItem(account.id)} style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 0' }}>
                            + Přidat obálku
                        </button>
                    )}

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>
                            <span>Cizí rezervy</span>
                            <span>−{formatCurrency(account.balance - account.my_balance)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--accent-success)' }}>
                            <span>Volné k utracení</span>
                            <span>{formatCurrency(account.my_balance)}</span>
                        </div>
                        {account.balance > 0 && (
                            <div style={{ marginTop: '8px', height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (account.my_balance / account.balance) * 100)}%`, background: 'var(--accent-success)', borderRadius: '3px' }} />
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </GlassCard>
    );

    const renderAnnualOverview = () => {
        if (!annualData) return <div>Načítám...</div>;

        const maxValue = Math.max(...annualData.months.map(m => Math.max(m.income, m.expenses)));
        const activeMonths = annualData.months.filter(m => m.income > 0);
        const prev = annualData.previous_year;

        // YoY delta badge — returns null if previous value is 0 (avoid Infinity)
        const renderDelta = (current: number, previous: number | undefined, invert = false) => {
            if (previous === undefined || previous === 0) return null;
            const deltaPct = ((current - previous) / Math.abs(previous)) * 100;
            if (Math.abs(deltaPct) < 0.5) return null;
            // invert=true for expenses (increase = bad)
            const isGood = invert ? deltaPct < 0 : deltaPct > 0;
            const color = isGood ? 'var(--accent-success)' : 'var(--accent-danger, #ef4444)';
            const arrow = deltaPct > 0 ? '▲' : '▼';
            return (
                <span style={{ fontSize: '0.72rem', color, fontWeight: 600, marginLeft: '6px' }} title={`Oproti ${selectedYear - 1}: ${formatCurrency(previous)}`}>
                    {arrow} {Math.abs(deltaPct).toFixed(1)}%
                </span>
            );
        };

        // Cumulative net per month (running total of income - expenses)
        let runningNet = 0;
        const cumulativeNet = annualData.months.map(m => {
            runningNet += m.income - m.expenses;
            return runningNet;
        });
        const cumulativeMax = Math.max(...cumulativeNet, 0);
        const cumulativeMin = Math.min(...cumulativeNet, 0);
        const cumulativeRange = cumulativeMax - cumulativeMin || 1;

        // Best/worst month (by net = income - expenses), savings-rate sparkline
        const monthsWithNet = activeMonths.map(m => ({
            ...m,
            net: m.income - m.expenses,
            savingsRate: m.income > 0 ? (m.investments / m.income) * 100 : 0,
        }));
        const bestMonth = monthsWithNet.length > 0
            ? monthsWithNet.reduce((a, b) => (a.net > b.net ? a : b))
            : null;
        const worstMonth = monthsWithNet.length > 0
            ? monthsWithNet.reduce((a, b) => (a.net < b.net ? a : b))
            : null;

        const avgSavingsRate = annualData.totals.income > 0
            ? (annualData.totals.investments / annualData.totals.income) * 100
            : 0;

        // Sparkline path for savings rate across all 12 months
        const sparkW = 280;
        const sparkH = 44;
        const maxSavingsRate = Math.max(...annualData.months.map(m => m.income > 0 ? (m.investments / m.income) * 100 : 0), 10);
        const sparkPoints = annualData.months.map((m, i) => {
            const x = (i / 11) * sparkW;
            const rate = m.income > 0 ? (m.investments / m.income) * 100 : 0;
            const y = sparkH - (rate / maxSavingsRate) * sparkH;
            return { x, y, rate, hasData: m.income > 0 };
        });
        const sparkPath = sparkPoints
            .filter(p => p.hasData)
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join(' ');

        return (
            <>
                <div className="dashboard-grid" style={{ gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <GlassCard>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Příjmy celkem</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-success)' }}>
                            {formatCurrency(annualData.totals.income)}
                            {renderDelta(annualData.totals.income, prev?.income)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>⌀ {formatCurrency(annualData.averages.income)}/měs</div>
                    </GlassCard>
                    <GlassCard>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Výdaje celkem</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-danger, #ef4444)' }}>
                            {formatCurrency(annualData.totals.expenses)}
                            {renderDelta(annualData.totals.expenses, prev?.expenses, true)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>⌀ {formatCurrency(annualData.averages.expenses)}/měs</div>
                    </GlassCard>
                    <GlassCard>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Investice</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {formatCurrency(annualData.totals.investments)}
                            {renderDelta(annualData.totals.investments, prev?.investments)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>⌀ {formatCurrency(annualData.averages.investments)}/měs</div>
                    </GlassCard>
                    <GlassCard>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Čistý zisk</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: annualData.totals.net >= 0 ? 'var(--accent-success)' : 'var(--accent-danger, #ef4444)' }}>
                            {formatCurrency(annualData.totals.net)}
                            {renderDelta(annualData.totals.net, prev?.net)}
                        </div>
                        {activeMonths.length > 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                úspor. sazba: {Math.round(avgSavingsRate)}%
                            </div>
                        )}
                    </GlassCard>
                </div>

                {/* Monthly chart with cumulative net overlay */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ margin: '0 0 var(--spacing-md) 0' }}>{Icons.section.monthlyOverview} Měsíční přehled {selectedYear}</h3>
                    <div style={{ position: 'relative', height: '180px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '180px' }}>
                            {annualData.months.map((month, idx) => (
                                <div
                                    key={month.month}
                                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', cursor: 'pointer' }}
                                    onClick={() => { setViewMode('month'); setSelectedMonth(month.month); }}
                                    title={`${MONTH_NAMES[idx]}: Příjmy ${formatCurrency(month.income)}, Výdaje ${formatCurrency(month.expenses)}, Kumul. čistý ${formatCurrency(cumulativeNet[idx])}`}
                                >
                                    <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '160px' }}>
                                        <div style={{ width: '10px', height: maxValue > 0 ? `${(month.income / maxValue) * 100}%` : '0%', background: 'var(--accent-success)', borderRadius: '2px 2px 0 0', minHeight: month.income > 0 ? '4px' : '0', transition: 'height 0.3s ease' }} />
                                        <div style={{ width: '10px', height: maxValue > 0 ? `${(month.expenses / maxValue) * 100}%` : '0%', background: 'var(--accent-danger, #ef4444)', borderRadius: '2px 2px 0 0', minHeight: month.expenses > 0 ? '4px' : '0', opacity: month.expenses > month.income ? 1 : 0.75, transition: 'height 0.3s ease' }} />
                                    </div>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>{MONTH_NAMES[idx].substring(0, 3)}</span>
                                </div>
                            ))}
                        </div>
                        {/* Cumulative net overlay — only show if there's any activity */}
                        {activeMonths.length > 0 && (
                            <svg
                                viewBox={`0 0 100 160`}
                                preserveAspectRatio="none"
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '160px', pointerEvents: 'none' }}
                            >
                                <polyline
                                    points={cumulativeNet.map((val, i) => {
                                        const x = (i / 11) * 100;
                                        const y = 160 - ((val - cumulativeMin) / cumulativeRange) * 160;
                                        return `${x},${y.toFixed(2)}`;
                                    }).join(' ')}
                                    fill="none"
                                    stroke="var(--accent-primary)"
                                    strokeWidth="1.2"
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinejoin="round"
                                    strokeDasharray="4 3"
                                />
                            </svg>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center', marginTop: 'var(--spacing-sm)', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                        <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--accent-success)', borderRadius: '2px', marginRight: '4px' }} />Příjmy</span>
                        <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--accent-danger, #ef4444)', borderRadius: '2px', marginRight: '4px' }} />Výdaje</span>
                        <span><span style={{ display: 'inline-block', width: '14px', height: '2px', background: 'var(--accent-primary)', marginRight: '4px', verticalAlign: 'middle' }} />Kumulativní čistý</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '4px' }}>Klikni na měsíc pro detail</div>
                </GlassCard>

                {/* Best/Worst month + savings rate sparkline */}
                {activeMonths.length > 0 && (
                    <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ margin: '0 0 var(--spacing-md) 0' }}>{Icons.section.bestWorst} Nejlepší &amp; nejhorší měsíc</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                            {bestMonth && (
                                <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.08)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>🥇 Nejlepší měsíc</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-success)', marginTop: '2px' }}>
                                        {MONTH_NAMES[bestMonth.month - 1]}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                        {formatCurrency(bestMonth.net)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                        úspor. sazba {bestMonth.savingsRate.toFixed(0)}%
                                    </div>
                                </div>
                            )}
                            {worstMonth && worstMonth.month !== bestMonth?.month && (
                                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{Icons.section.trend} Nejhorší měsíc</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-danger, #ef4444)', marginTop: '2px' }}>
                                        {MONTH_NAMES[worstMonth.month - 1]}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                        {formatCurrency(worstMonth.net)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                        úspor. sazba {worstMonth.savingsRate.toFixed(0)}%
                                    </div>
                                </div>
                            )}
                            <div style={{ padding: '12px', background: 'rgba(0, 122, 255, 0.06)', borderRadius: '8px', border: '1px solid rgba(0, 122, 255, 0.2)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{Icons.section.trend} Trend úspor. sazby</div>
                                <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" style={{ marginTop: '6px' }}>
                                    {sparkPath && (
                                        <path d={sparkPath} fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                                    )}
                                    {sparkPoints.filter(p => p.hasData).map((p, i) => (
                                        <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--accent-primary)" />
                                    ))}
                                </svg>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '2px' }}>
                                    ⌀ {avgSavingsRate.toFixed(0)}% za rok
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                )}

                {/* Expense breakdown */}
                <GlassCard>
                    <h3 style={{ margin: '0 0 var(--spacing-md) 0' }}>{Icons.section.expensesByItem} Výdaje podle položek</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {Object.entries(annualData.expense_breakdown)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 15)
                            .map(([name, amount]) => {
                                const pct = (amount / annualData.totals.expenses) * 100;
                                return (
                                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ width: '140px', fontSize: '0.83rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                        <div style={{ flex: 1, height: '14px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent-primary)', borderRadius: '3px' }} />
                                        </div>
                                        <span style={{ width: '90px', textAlign: 'right', fontSize: '0.83rem' }}>{formatCurrency(amount)}</span>
                                        <span style={{ width: '40px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{pct.toFixed(0)}%</span>
                                    </div>
                                );
                            })}
                    </div>
                </GlassCard>
            </>
        );
    };

    const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;

    return (
        <MainLayout>
            <div className="page-container">
                {/* Header */}
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{Icons.nav.monthlyBudget} Měsíční rozpočet</h1>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {isAutoSyncing && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%' }} />
                                    Auto-sync...
                                </span>
                            )}
                            <button
                                onClick={() => setViewMode(viewMode === 'month' ? 'year' : 'month')}
                                className="btn"
                                style={{ background: viewMode === 'year' ? 'var(--accent-warning, #f59e0b)' : 'rgba(255,255,255,0.05)', color: viewMode === 'year' ? '#000' : 'var(--text-primary)', padding: '6px 12px', fontSize: '0.85rem', fontWeight: viewMode === 'year' ? 600 : 400 }}
                            >
                                {viewMode === 'year' ? '← Na měsíc' : `${Icons.nav.reports} Roční přehled`}
                            </button>
                            {viewMode === 'month' && (
                                <button className="btn" onClick={deleteBudget} style={{ fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger, #ef4444)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '6px 12px' }}>
                                    {Icons.action.delete} Smazat
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Month navigation */}
                    {viewMode === 'month' && (
                        <div className="month-nav" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button className="btn month-nav-arrow" onClick={goToPrevMonth} style={{ padding: '8px 12px', fontSize: '1rem' }}>←</button>
                            <CustomSelect
                                value={selectedMonth.toString()}
                                onChange={(val) => setSelectedMonth(Number(val))}
                                style={{ width: '150px' }}
                                options={MONTH_NAMES.map((name, idx) => ({ value: (idx + 1).toString(), label: name }))}
                            />
                            <CustomSelect
                                value={selectedYear.toString()}
                                onChange={(val) => setSelectedYear(Number(val))}
                                style={{ width: '110px' }}
                                options={Array.from({ length: 11 }, (_, i) => selectedYear - 5 + i).sort((a, b) => b - a).map(y => ({ value: y.toString(), label: y.toString() }))}
                            />
                            <button className="btn month-nav-arrow" onClick={goToNextMonth} style={{ padding: '8px 12px', fontSize: '1rem' }}>→</button>
                            {!isCurrentMonth && (
                                <button className="btn" onClick={() => { setSelectedMonth(currentMonth); setSelectedYear(currentYear); }} style={{ fontSize: '0.8rem', padding: '6px 10px', background: 'rgba(255,255,255,0.05)' }}>
                                    Dnes
                                </button>
                            )}
                        </div>
                    )}

                    {/* Year navigation */}
                    {viewMode === 'year' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button className="btn" onClick={() => setSelectedYear(y => y - 1)} style={{ padding: '8px 12px', fontSize: '1rem' }}>←</button>
                            <span style={{ fontWeight: 600, fontSize: '1.1rem', minWidth: '60px', textAlign: 'center' }}>{selectedYear}</span>
                            <button className="btn" onClick={() => setSelectedYear(y => y + 1)} style={{ padding: '8px 12px', fontSize: '1rem' }}>→</button>
                        </div>
                    )}
                </div>

                {/* Content */}
                {viewMode === 'month' ? (
                    <>
                        {renderKpiBar()}
                        <div className="rozpocet-grid">
                            <div className="grid-col1-wrapper">
                                <div className="grid-income">{renderIncomeSection()}</div>
                                <div className="grid-surplus">{renderSurplusSection()}</div>
                            </div>
                            <div className="grid-expenses">
                                {renderExpensesSection()}
                                {renderExpenseChart()}
                            </div>
                            <div className="grid-manual">
                                {renderManualAccounts()}
                            </div>
                        </div>
                    </>
                ) : (
                    renderAnnualOverview()
                )}
            </div>
        </MainLayout>
    );
}
