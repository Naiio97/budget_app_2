'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
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

interface IncomeItem {
    id: number;
    name: string;
    amount: number;
    order_index: number;
    is_salary: boolean;
}

interface MonthlyBudget {
    id: number;
    year_month: string;
    income_items: IncomeItem[];
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
    const [editingBudgetFields, setEditingBudgetFields] = useState<Record<string, string>>({});
    const [editingIncomeAmounts, setEditingIncomeAmounts] = useState<Record<number, string>>({});
    const [editingIncomeNames, setEditingIncomeNames] = useState<Record<number, string>>({});
    const [editingExpenseNames, setEditingExpenseNames] = useState<Record<number, string>>({});

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
    });

    const { data: prevYearData } = useQuery<AnnualData>({
        queryKey: queryKeys.annualOverview(selectedYear - 1),
        queryFn: () => fetch(`${API_BASE}/annual-overview/${selectedYear - 1}`).then(r => r.json()),
        enabled: selectedMonth === 1,
    });

    const refreshBudget = useCallback(() =>
        queryClient.invalidateQueries({ queryKey: queryKeys.monthlyBudget(yearMonth) }),
        [queryClient, yearMonth]
    );

    const refreshManualAccounts = () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.manualAccounts });

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    const goToPrevMonth = () => {
        if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
        else setSelectedMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
        else setSelectedMonth(m => m + 1);
    };

    useEffect(() => {
        if (!budget || viewMode !== 'month') return;
        if (autoSyncedMonths.current.has(yearMonth)) return;
        autoSyncedMonths.current.add(yearMonth);

        const runAutoSync = async () => {
            setIsAutoSyncing(true);
            try {
                const salaryRow = budget.income_items.find(i => i.is_salary);
                if (!salaryRow || salaryRow.amount === 0) {
                    await fetch(`${API_BASE}/monthly-budget/${yearMonth}/sync-income`, { method: 'POST' });
                }
                await fetch(`${API_BASE}/monthly-budget/${yearMonth}/match-transactions`, { method: 'POST' });
                await refreshBudget();
            } finally {
                setIsAutoSyncing(false);
            }
        };

        runAutoSync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budget?.id, yearMonth, viewMode, refreshBudget]);

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

    const commitBudgetField = (field: string, currentValue: number) => {
        const raw = editingBudgetFields[field];
        setEditingBudgetFields(prev => { const next = { ...prev }; delete next[field]; return next; });
        if (raw === undefined) return;
        const newValue = parseFloat(raw) || 0;
        if (newValue === currentValue) return;
        updateBudget(field, newValue);
    };

    const commitIncomeAmount = async (item: IncomeItem) => {
        const raw = editingIncomeAmounts[item.id];
        setEditingIncomeAmounts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
        if (raw === undefined) return;
        const newValue = parseFloat(raw) || 0;
        if (newValue === item.amount) return;
        try {
            await fetch(`${API_BASE}/monthly-income-items/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: newValue }),
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to update income amount:', err);
        }
    };

    const commitIncomeName = async (item: IncomeItem) => {
        const raw = editingIncomeNames[item.id];
        setEditingIncomeNames(prev => { const next = { ...prev }; delete next[item.id]; return next; });
        if (raw === undefined) return;
        const newName = raw.trim();
        if (!newName || newName === item.name) return;
        try {
            await fetch(`${API_BASE}/monthly-income-items/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to rename income item:', err);
        }
    };

    const addIncomeItem = async () => {
        try {
            await fetch(`${API_BASE}/monthly-budget/${yearMonth}/income-items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Nový příjem', amount: 0, is_salary: false }),
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to add income item:', err);
        }
    };

    const deleteIncomeItem = async (itemId: number) => {
        try {
            await fetch(`${API_BASE}/monthly-income-items/${itemId}`, { method: 'DELETE' });
            refreshBudget();
        } catch (err) {
            console.error('Failed to delete income item:', err);
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

    const saveExpenseName = async (expense: MonthlyExpense) => {
        const raw = editingExpenseNames[expense.id];
        if (raw === undefined) return;
        const newName = raw.trim();
        setEditingExpenseNames(prev => { const next = { ...prev }; delete next[expense.id]; return next; });
        if (!newName || newName === expense.name) return;
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expense.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to rename expense:', err);
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

    const deleteMonthlyExpense = async (expenseId: number) => {
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expenseId}`, { method: 'DELETE' });
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

    const deleteBudgetMonth = async () => {
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

    // === Render functions ===

    const renderKpiBar = () => {
        if (!budget) return null;
        const isOverBudget = remaining < 0;
        const prevMonthIncome = selectedMonth === 1
            ? prevYearData?.months.find(m => m.month === 12)?.income ?? 0
            : annualData?.months.find(m => m.month === selectedMonth - 1)?.income ?? 0;
        const incomeDelta = totalIncome - prevMonthIncome;
        const hasPrevMonth = prevMonthIncome > 0;
        const otherActiveIncomeMonths = annualData?.months.filter(m => m.income > 0 && m.month !== selectedMonth) ?? [];
        const avgIncome = otherActiveIncomeMonths.length > 0
            ? otherActiveIncomeMonths.reduce((s, m) => s + m.income, 0) / otherActiveIncomeMonths.length
            : 0;
        const budgetUsedPct = Math.min(100, totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0);

        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--spacing-md)' }}>
                <div className="surface kpi">
                    <div className="kpi-label">Příjmy</div>
                    <div className="kpi-value num" style={{ color: 'var(--pos)', fontSize: 22 }}>{formatCurrency(totalIncome)}</div>
                    <div className="kpi-sub">
                        {isAutoSyncing ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 10, height: 10, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                                Sync...
                            </span>
                        ) : hasPrevMonth && totalIncome > 0 ? (
                            <span style={{ color: incomeDelta >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                                {incomeDelta >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(incomeDelta))} vs. min. měs.
                            </span>
                        ) : avgIncome > 0 ? (
                            <span>⌀ {formatCurrency(avgIncome)}/měs</span>
                        ) : null}
                    </div>
                </div>

                <div className="surface kpi">
                    <div className="kpi-label">Výdaje</div>
                    <div className="kpi-value num" style={{ color: 'var(--neg)', fontSize: 22 }}>{formatCurrency(totalExpenses)}</div>
                    <div className="kpi-sub">
                        <div className="progress" style={{ flex: 1 }}>
                            <span style={{ width: `${budgetUsedPct}%`, background: budgetUsedPct > 90 ? 'var(--neg)' : budgetUsedPct > 70 ? 'var(--warn)' : 'var(--pos)' }} />
                        </div>
                        <span>{expensePct}%</span>
                    </div>
                </div>

                <div className="surface kpi" style={isOverBudget ? { background: 'color-mix(in srgb, var(--neg) 6%, var(--surface))' } : undefined}>
                    <div className="kpi-label">Zbývá</div>
                    <div className="kpi-value num" style={{ color: isOverBudget ? 'var(--neg)' : 'var(--pos)', fontSize: 22 }}>
                        {isOverBudget ? '−' : '+'}{formatCurrency(Math.abs(remaining))}
                    </div>
                    <div className="kpi-sub">
                        <span className={isOverBudget ? 'chip chip-danger' : 'chip chip-success'}>
                            {isOverBudget ? `${Icons.status.overBudget} Přečerpáno` : `${Icons.status.ok} V pohodě`}
                        </span>
                    </div>
                </div>

                <div className="surface kpi">
                    <div className="kpi-label">Zaplaceno</div>
                    <div className="kpi-value num" style={{ color: paidCount === totalCount && totalCount > 0 ? 'var(--pos)' : 'var(--text)', fontSize: 22 }}>
                        {paidCount} / {totalCount}
                    </div>
                    <div className="kpi-sub">
                        <div className="progress" style={{ flex: 1 }}>
                            <span style={{ width: totalCount > 0 ? `${(paidCount / totalCount) * 100}%` : '0%', background: 'var(--pos)' }} />
                        </div>
                    </div>
                </div>

                <div className="surface kpi">
                    <div className="kpi-label">Spoření</div>
                    <div className="kpi-value num" style={{ color: 'var(--accent)', fontSize: 22 }}>{formatCurrency(investmentAmount + (budget?.surplus_to_savings || 0))}</div>
                    <div className="kpi-sub">
                        <div className="progress" style={{ flex: 1 }}>
                            <span style={{ width: `${Math.min(100, savingsRate)}%` }} />
                        </div>
                        <span>{savingsRate}%</span>
                    </div>
                </div>
            </div>
        );
    };

    const renderIncomeSection = () => (
        <div className="surface">
            <div className="card-head">
                <h3>{Icons.section.income} Příjmy</h3>
                <div className="section-actions">
                    <button className="btn btn-sm" onClick={syncIncome}>{Icons.action.sync} Načíst</button>
                </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(budget?.income_items || []).map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            className="input"
                            value={editingIncomeNames[item.id] ?? item.name}
                            onChange={(e) => setEditingIncomeNames(prev => ({ ...prev, [item.id]: e.target.value }))}
                            onBlur={() => commitIncomeName(item)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ flex: 1, padding: '6px 10px', fontSize: '0.875rem' }}
                        />
                        <input
                            type="number"
                            className="input"
                            placeholder="0"
                            value={editingIncomeAmounts[item.id] ?? (item.amount === 0 ? '' : String(item.amount))}
                            onChange={(e) => setEditingIncomeAmounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                            onBlur={() => commitIncomeAmount(item)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: 120, textAlign: 'right', padding: '6px 10px', fontSize: '0.875rem' }}
                        />
                        <button onClick={() => deleteIncomeItem(item.id)} className="btn btn-icon btn-ghost btn-sm" title="Smazat">
                            {Icons.action.delete}
                        </button>
                    </div>
                ))}
                <button className="btn btn-sm" onClick={addIncomeItem} style={{ alignSelf: 'flex-start' }}>
                    + Přidat příjem
                </button>
                <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14 }}>
                    <span>Celkem</span>
                    <span style={{ color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalIncome)}</span>
                </div>
            </div>
        </div>
    );

    const renderSurplusSection = () => {
        const isOverBudget = remaining < 0;
        const netSavings = investmentAmount + (budget?.surplus_to_savings || 0);
        return (
            <div className="surface">
                <div className="card-head">
                    <h3>{Icons.section.surplus} Přebytek & Spoření</h3>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Investice</span>
                        <input
                            type="number"
                            className="input"
                            placeholder="0"
                            value={editingBudgetFields['investment_amount'] ?? ((budget?.investment_amount || 0) === 0 ? '' : String(budget?.investment_amount))}
                            onChange={(e) => setEditingBudgetFields(prev => ({ ...prev, investment_amount: e.target.value }))}
                            onBlur={() => commitBudgetField('investment_amount', budget?.investment_amount || 0)}
                            style={{ width: 110, textAlign: 'right', padding: '6px 10px', fontSize: '0.875rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Spořící účet</span>
                        <input
                            type="number"
                            className="input"
                            placeholder="0"
                            value={editingBudgetFields['surplus_to_savings'] ?? ((budget?.surplus_to_savings || 0) === 0 ? '' : String(budget?.surplus_to_savings))}
                            onChange={(e) => setEditingBudgetFields(prev => ({ ...prev, surplus_to_savings: e.target.value }))}
                            onBlur={() => commitBudgetField('surplus_to_savings', budget?.surplus_to_savings || 0)}
                            style={{ width: 110, textAlign: 'right', padding: '6px 10px', fontSize: '0.875rem' }}
                        />
                    </div>

                    {totalIncome > 0 && (
                        <div style={{ padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                                <span style={{ color: 'var(--text-2)' }}>Spořící sazba</span>
                                <span style={{ fontWeight: 600, color: savingsRate >= 15 ? 'var(--pos)' : savingsRate >= 10 ? 'var(--warn)' : 'var(--neg)' }}>
                                    {savingsRate}% {savingsRate >= 15 ? Icons.savingsRate.good : savingsRate >= 10 ? Icons.savingsRate.neutral : Icons.savingsRate.bad}
                                </span>
                            </div>
                            <div className="progress" style={{ position: 'relative' }}>
                                <span style={{ width: `${Math.min(100, savingsRate)}%`, background: savingsRate >= 15 ? 'var(--pos)' : savingsRate >= 10 ? 'var(--warn)' : 'var(--neg)' }} />
                                <div style={{ position: 'absolute', top: 0, left: '15%', width: 1, height: '100%', background: 'var(--border-strong)' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                                <span>{formatCurrency(netSavings)} ušetřeno</span>
                                <span>cíl: 15%</span>
                            </div>
                        </div>
                    )}

                    <div style={{
                        padding: 'var(--spacing-md)', textAlign: 'center',
                        background: isOverBudget
                            ? 'color-mix(in srgb, var(--neg) 8%, transparent)'
                            : 'color-mix(in srgb, var(--pos) 8%, transparent)',
                        borderRadius: 'var(--radius-md)',
                        border: `0.5px solid ${isOverBudget ? 'color-mix(in srgb, var(--neg) 20%, transparent)' : 'color-mix(in srgb, var(--pos) 20%, transparent)'}`,
                    }}>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Zbylé peníze</div>
                        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: isOverBudget ? 'var(--neg)' : 'var(--pos)' }}>
                            {formatCurrency(remaining)}
                        </div>
                        {isOverBudget && <div style={{ fontSize: 12, color: 'var(--neg)', marginTop: 4 }}>{Icons.status.overBudget} Přečerpáno</div>}
                    </div>
                </div>
            </div>
        );
    };

    const renderExpensesSection = () => (
        <div className="surface">
            <div className="card-head">
                <h3>{Icons.section.recurringExpenses} Pravidelné výdaje</h3>
                <div className="section-actions">
                    <button className="btn btn-sm" onClick={copyFromPrevious}>{Icons.action.loadFromHistory} Z minula</button>
                    <button className="btn btn-sm" onClick={matchTransactions}>{Icons.action.match} Spárovat</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddExpense(true)}>+ Přidat</button>
                </div>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {showAddExpense && (
                    <div style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="input" placeholder="Název výdaje" value={newExpense.name} onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })} />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input type="number" className="input" placeholder="Částka" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} style={{ flex: 1 }} />
                            <input className="input" placeholder="Match pattern (volitelné)" value={newExpense.match_pattern} onChange={(e) => setNewExpense({ ...newExpense, match_pattern: e.target.value })} style={{ flex: 1 }} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={newExpense.is_auto_paid} onChange={(e) => setNewExpense({ ...newExpense, is_auto_paid: e.target.checked })} />
                            Automatická platba
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={createRecurringExpense}>Uložit</button>
                            <button className="btn btn-sm" onClick={() => setShowAddExpense(false)}>Zrušit</button>
                        </div>
                    </div>
                )}

                {totalCount > 0 && (
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
                            <span>Zaplaceno {paidCount} / {totalCount}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(budget?.expenses.filter(e => e.is_paid).reduce((s, e) => s + e.my_amount, 0) || 0)} / {formatCurrency(totalExpenses)}
                            </span>
                        </div>
                        <div className="progress">
                            <span style={{ width: `${totalCount > 0 ? (paidCount / totalCount) * 100 : 0}%`, background: 'var(--pos)' }} />
                        </div>
                    </div>
                )}

                <div style={{ maxHeight: 380, overflowY: 'auto', overflowX: 'clip', overscrollBehavior: 'contain' }}>
                    {budget?.expenses.map(expense => (
                        <div
                            key={expense.id}
                            className="expense-row"
                            style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '7px 6px', borderRadius: 'var(--radius-sm)',
                                background: expense.is_auto_paid ? 'color-mix(in srgb, var(--pos) 6%, transparent)' : 'transparent',
                                marginBottom: 2,
                                borderLeft: expense.matched_transaction_id ? `3px solid var(--pos)` : '3px solid transparent',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <input
                                    type="checkbox"
                                    className="expense-check"
                                    checked={expense.is_paid}
                                    onChange={() => toggleExpensePaid(expense.id, expense.is_paid)}
                                />
                                <input
                                    value={editingExpenseNames[expense.id] ?? expense.name}
                                    onChange={(e) => setEditingExpenseNames(prev => ({ ...prev, [expense.id]: e.target.value }))}
                                    onBlur={() => saveExpenseName(expense)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    style={{
                                        flex: 1, minWidth: 0,
                                        padding: '2px 4px',
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'inherit', fontSize: '0.875rem',
                                        textDecoration: expense.is_paid ? 'line-through' : 'none',
                                        opacity: expense.is_paid ? 0.5 : 1,
                                    }}
                                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                                    onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                                />
                            </div>
                            <div className="expense-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <CustomSelect
                                    compact
                                    value={expense.my_amount_override !== null ? 'custom' : (expense.my_percentage === 100 ? '100' : expense.my_percentage === 50 ? '50' : 'custom')}
                                    onChange={(val) => {
                                        if (val === '100') updateExpensePercentage(expense.id, 100);
                                        else if (val === '50') updateExpensePercentage(expense.id, 50);
                                        else {
                                            setEditingMyAmounts(prev => ({ ...prev, [expense.id]: String(Math.round(expense.my_amount)) }));
                                            if (expense.my_amount_override === null) saveCustomOverride(expense.id, Math.round(expense.my_amount));
                                        }
                                    }}
                                    style={{ width: 78 }}
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
                                    style={{ width: 95, textAlign: 'right', padding: '4px 8px', fontSize: '0.875rem' }}
                                    title="Celková částka"
                                />
                                {(expense.my_percentage < 100 || expense.my_amount_override !== null) && (
                                    <input
                                        type="number"
                                        className="input"
                                        value={editingMyAmounts[expense.id] ?? Math.round(expense.my_amount)}
                                        onChange={(e) => setEditingMyAmounts(prev => ({ ...prev, [expense.id]: e.target.value }))}
                                        onBlur={() => saveMyAmount(expense)}
                                        style={{ width: 85, textAlign: 'right', padding: '4px 8px', fontSize: '0.875rem', color: 'var(--accent)', borderColor: 'var(--accent-soft)' }}
                                        title="Moje část (Kč)"
                                    />
                                )}
                                <button
                                    onClick={() => deleteMonthlyExpense(expense.id)}
                                    className="btn btn-icon btn-ghost btn-sm"
                                    style={{ opacity: 0.4, fontSize: '0.8rem' }}
                                >{Icons.action.delete}</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 10, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14 }}>
                    <span>Celkem</span>
                    <span style={{ color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalExpenses)}</span>
                </div>
            </div>
        </div>
    );

    const renderExpenseChart = () => {
        if (!budget?.expenses.length) return null;
        const sorted = [...budget.expenses].sort((a, b) => b.my_amount - a.my_amount);
        const maxAmount = sorted[0]?.my_amount || 1;

        return (
            <div className="surface">
                <div className="card-head">
                    <h3>{Icons.section.expensesByItem} Výdaje podle položek</h3>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 360, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                    {sorted.map(exp => {
                        const pct = Math.round((exp.my_amount / totalExpenses) * 100);
                        const barWidth = Math.round((exp.my_amount / maxAmount) * 100);
                        return (
                            <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: exp.is_paid ? 'var(--pos)' : exp.is_auto_paid ? 'color-mix(in srgb, var(--pos) 40%, transparent)' : 'var(--border-strong)' }} />
                                <span style={{ fontSize: '0.78rem', width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={exp.name}>{exp.name}</span>
                                <div className="progress" style={{ flex: 1 }}>
                                    <span style={{ width: `${barWidth}%`, background: exp.is_paid ? 'var(--pos)' : 'var(--accent)' }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', width: 30, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', width: 72, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(exp.my_amount)}</span>
                            </div>
                        );
                    })}
                    <div style={{ marginTop: 6, display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-3)' }}>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--pos)', marginRight: 4 }} />Zaplaceno</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginRight: 4 }} />Nezaplaceno</span>
                    </div>
                </div>
            </div>
        );
    };

    const renderManualAccounts = () => (
        <div className="surface">
            <div className="card-head">
                <h3>{Icons.section.savingsAccounts} Spořící účty</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddAccount(true)}>+ Přidat</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {showAddAccount && (
                    <div style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', display: 'flex', gap: 8 }}>
                        <input className="input" placeholder="Název účtu" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} style={{ flex: 1 }} />
                        <input type="number" className="input" placeholder="Zůstatek" value={newAccount.balance} onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })} style={{ width: 110 }} />
                        <button className="btn btn-primary btn-sm" onClick={createManualAccount}>Uložit</button>
                        <button className="btn btn-sm" onClick={() => setShowAddAccount(false)}>×</button>
                    </div>
                )}

                {manualAccounts.map(account => (
                    <div key={account.id} style={{ padding: 'var(--spacing-md)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{account.name}</span>
                            {editingAccountId === account.id ? (
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <input type="number" className="input" value={editAccountBalance} onChange={(e) => setEditAccountBalance(e.target.value)} style={{ width: 100, padding: '4px 8px' }} />
                                    <button className="btn btn-primary btn-sm" onClick={() => updateManualAccountBalance(account.id)}>{Icons.action.confirm}</button>
                                    <button className="btn btn-sm" onClick={() => setEditingAccountId(null)}>×</button>
                                </div>
                            ) : (
                                <span onClick={() => { setEditingAccountId(account.id); setEditAccountBalance(String(account.balance)); }}
                                    style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCurrency(account.balance)} {Icons.action.edit}
                                </span>
                            )}
                        </div>

                        {Array.isArray(account.envelopes) && account.envelopes.length > 0 && (
                            <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Obálky</div>
                                {account.envelopes.map(env => (
                                    <div key={env.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 3 }}>
                                        <span style={{ color: 'var(--text-2)' }}>
                                            {env.is_mine ? Icons.envelope.mine : Icons.envelope.shared} {env.name}
                                        </span>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span style={{ color: env.is_mine ? 'var(--pos)' : 'var(--warn)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                                                {env.is_mine ? '' : '−'}{formatCurrency(env.amount)}
                                            </span>
                                            <button onClick={() => deleteAccountItem(account.id, env.id)} className="btn btn-icon btn-ghost btn-sm" style={{ opacity: 0.4 }}>{Icons.action.delete}</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showAddItem === account.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <input className="input" placeholder="Název" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} style={{ flex: 1, padding: '4px 8px' }} />
                                    <input type="number" className="input" placeholder="Částka" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} style={{ width: 80, padding: '4px 8px' }} />
                                    <button className="btn btn-primary btn-sm" onClick={() => addAccountItem(account.id)}>{Icons.action.confirm}</button>
                                    <button className="btn btn-sm" onClick={() => setShowAddItem(null)}>×</button>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={newItem.is_mine} onChange={(e) => setNewItem({ ...newItem, is_mine: e.target.checked })} />
                                    Volné (moje peníze)
                                </label>
                            </div>
                        ) : (
                            <button onClick={() => setShowAddItem(account.id)} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                                + Přidat obálku
                            </button>
                        )}

                        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 3 }}>
                                <span>Cizí rezervy</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(account.balance - account.my_balance)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 14 }}>
                                <span>Volné k utracení</span>
                                <span style={{ color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(account.my_balance)}</span>
                            </div>
                            {account.balance > 0 && (
                                <div className="progress" style={{ marginTop: 8 }}>
                                    <span style={{ width: `${Math.min(100, (account.my_balance / account.balance) * 100)}%`, background: 'var(--pos)' }} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderAnnualOverview = () => {
        if (!annualData) return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl)' }}>
                <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
        );

        const maxValue = Math.max(...annualData.months.map(m => Math.max(m.income, m.expenses)));
        const activeMonths = annualData.months.filter(m => m.income > 0);
        const prev = annualData.previous_year;

        const renderDelta = (current: number, previous: number | undefined, invert = false) => {
            if (previous === undefined || previous === 0) return null;
            const deltaPct = ((current - previous) / Math.abs(previous)) * 100;
            if (Math.abs(deltaPct) < 0.5) return null;
            const isGood = invert ? deltaPct < 0 : deltaPct > 0;
            const color = isGood ? 'var(--pos)' : 'var(--neg)';
            const arrow = deltaPct > 0 ? '▲' : '▼';
            return (
                <span style={{ fontSize: 11, color, fontWeight: 600, marginLeft: 6 }} title={`Oproti ${selectedYear - 1}: ${formatCurrency(previous)}`}>
                    {arrow} {Math.abs(deltaPct).toFixed(1)}%
                </span>
            );
        };

        let runningNet = 0;
        const cumulativeNet = annualData.months.map(m => {
            runningNet += m.income - m.expenses;
            return runningNet;
        });
        const cumulativeMax = Math.max(...cumulativeNet, 0);
        const cumulativeMin = Math.min(...cumulativeNet, 0);
        const cumulativeRange = cumulativeMax - cumulativeMin || 1;

        const monthsWithNet = activeMonths.map(m => ({
            ...m, net: m.income - m.expenses,
            savingsRate: m.income > 0 ? (m.investments / m.income) * 100 : 0,
        }));
        const bestMonth = monthsWithNet.length > 0 ? monthsWithNet.reduce((a, b) => (a.net > b.net ? a : b)) : null;
        const worstMonth = monthsWithNet.length > 0 ? monthsWithNet.reduce((a, b) => (a.net < b.net ? a : b)) : null;
        const avgSavingsRate = annualData.totals.income > 0 ? (annualData.totals.investments / annualData.totals.income) * 100 : 0;
        const sparkW = 280; const sparkH = 44;
        const maxSavingsRate = Math.max(...annualData.months.map(m => m.income > 0 ? (m.investments / m.income) * 100 : 0), 10);
        const sparkPoints = annualData.months.map((m, i) => ({
            x: (i / 11) * sparkW,
            y: sparkH - ((m.income > 0 ? (m.investments / m.income) * 100 : 0) / maxSavingsRate) * sparkH,
            hasData: m.income > 0,
        }));
        const sparkPath = sparkPoints.filter(p => p.hasData).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    {[
                        { label: 'Příjmy celkem', value: annualData.totals.income, prev: prev?.income, color: 'var(--pos)', avg: annualData.averages.income },
                        { label: 'Výdaje celkem', value: annualData.totals.expenses, prev: prev?.expenses, color: 'var(--neg)', avg: annualData.averages.expenses, invert: true },
                        { label: 'Investice', value: annualData.totals.investments, prev: prev?.investments, color: 'var(--accent)', avg: annualData.averages.investments },
                        { label: 'Čistý zisk', value: annualData.totals.net, prev: prev?.net, color: annualData.totals.net >= 0 ? 'var(--pos)' : 'var(--neg)' },
                    ].map(item => (
                        <div key={item.label} className="surface kpi">
                            <div className="kpi-label">{item.label}</div>
                            <div className="kpi-value num" style={{ color: item.color, fontSize: 20 }}>
                                {formatCurrency(item.value)}
                                {renderDelta(item.value, item.prev, item.invert)}
                            </div>
                            {item.avg !== undefined && (
                                <div className="kpi-sub">⌀ {formatCurrency(item.avg)}/měs</div>
                            )}
                            {item.label === 'Čistý zisk' && activeMonths.length > 0 && (
                                <div className="kpi-sub">úspor. {Math.round(avgSavingsRate)}%</div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Monthly bar chart */}
                <div className="surface">
                    <div className="card-head">
                        <h3>{Icons.section.monthlyOverview} Měsíční přehled {selectedYear}</h3>
                    </div>
                    <div className="card-body">
                        <div style={{ position: 'relative', height: 180 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 180 }}>
                                {annualData.months.map((month, idx) => (
                                    <div key={month.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                                        onClick={() => { setViewMode('month'); setSelectedMonth(month.month); }}
                                        title={`${MONTH_NAMES[idx]}: ${formatCurrency(month.income)} / ${formatCurrency(month.expenses)}`}>
                                        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 160 }}>
                                            <div style={{ width: 10, height: maxValue > 0 ? `${(month.income / maxValue) * 100}%` : '0%', background: 'var(--pos)', borderRadius: '2px 2px 0 0', minHeight: month.income > 0 ? 4 : 0, transition: 'height 0.3s ease' }} />
                                            <div style={{ width: 10, height: maxValue > 0 ? `${(month.expenses / maxValue) * 100}%` : '0%', background: 'var(--neg)', borderRadius: '2px 2px 0 0', minHeight: month.expenses > 0 ? 4 : 0, opacity: month.expenses > month.income ? 1 : 0.7, transition: 'height 0.3s ease' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>{MONTH_NAMES[idx].substring(0, 3)}</span>
                                    </div>
                                ))}
                            </div>
                            {activeMonths.length > 0 && (
                                <svg viewBox="0 0 100 160" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 160, pointerEvents: 'none' }}>
                                    <polyline
                                        points={cumulativeNet.map((val, i) => `${(i / 11) * 100},${(160 - ((val - cumulativeMin) / cumulativeRange) * 160).toFixed(2)}`).join(' ')}
                                        fill="none" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeDasharray="4 3"
                                    />
                                </svg>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 'var(--spacing-sm)', fontSize: 12, flexWrap: 'wrap', color: 'var(--text-3)' }}>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--pos)', borderRadius: 2, marginRight: 4 }} />Příjmy</span>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--neg)', borderRadius: 2, marginRight: 4 }} />Výdaje</span>
                            <span><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--accent)', marginRight: 4, verticalAlign: 'middle' }} />Kumulativní čistý</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>Klikni na měsíc pro detail</div>
                    </div>
                </div>

                {activeMonths.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-md)' }}>
                        {bestMonth && (
                            <div className="surface" style={{ padding: 'var(--spacing-md)', background: 'color-mix(in srgb, var(--pos) 6%, var(--surface))' }}>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>🥇 Nejlepší měsíc</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--pos)' }}>{MONTH_NAMES[bestMonth.month - 1]}</div>
                                <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatCurrency(bestMonth.net)}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>úspor. {bestMonth.savingsRate.toFixed(0)}%</div>
                            </div>
                        )}
                        {worstMonth && worstMonth.month !== bestMonth?.month && (
                            <div className="surface" style={{ padding: 'var(--spacing-md)', background: 'color-mix(in srgb, var(--neg) 6%, var(--surface))' }}>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{Icons.section.trend} Nejhorší měsíc</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neg)' }}>{MONTH_NAMES[worstMonth.month - 1]}</div>
                                <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatCurrency(worstMonth.net)}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>úspor. {worstMonth.savingsRate.toFixed(0)}%</div>
                            </div>
                        )}
                        <div className="surface" style={{ padding: 'var(--spacing-md)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{Icons.section.trend} Trend úspor. sazby</div>
                            <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" style={{ marginTop: 6 }}>
                                {sparkPath && <path d={sparkPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                                {sparkPoints.filter(p => p.hasData).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--accent)" />)}
                            </svg>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 2 }}>⌀ {avgSavingsRate.toFixed(0)}% za rok</div>
                        </div>
                    </div>
                )}

                <div className="surface">
                    <div className="card-head">
                        <h3>{Icons.section.expensesByItem} Výdaje podle položek</h3>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(annualData.expense_breakdown)
                            .sort(([, a], [, b]) => b - a).slice(0, 15)
                            .map(([name, amount]) => {
                                const pct = (amount / annualData.totals.expenses) * 100;
                                return (
                                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 140, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{name}</span>
                                        <div className="progress" style={{ flex: 1 }}>
                                            <span style={{ width: `${pct}%` }} />
                                        </div>
                                        <span style={{ width: 90, textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatCurrency(amount)}</span>
                                        <span style={{ width: 36, textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>{pct.toFixed(0)}%</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>
        );
    };

    const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;
    const monthLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

    return (
        <MainLayout>
            <div className="page-container" style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>

                {/* Page header */}
                <div className="page-head">
                    <div>
                        <h1>Měsíční rozpočet</h1>
                        <div className="sub">{monthLabel}{isAutoSyncing ? ' · Synchronizuji...' : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => setViewMode(viewMode === 'month' ? 'year' : 'month')} className={`btn btn-sm ${viewMode === 'year' ? 'btn-primary' : ''}`}>
                            {viewMode === 'year' ? '← Měsíc' : `${Icons.nav.reports} Roční přehled`}
                        </button>
                        {viewMode === 'month' && (
                            <button className="btn btn-sm" onClick={deleteBudgetMonth} style={{ color: 'var(--neg)', borderColor: 'color-mix(in srgb, var(--neg) 30%, transparent)' }}>
                                {Icons.action.delete} Smazat
                            </button>
                        )}
                    </div>
                </div>

                {/* Month / year navigation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {viewMode === 'month' ? (
                        <>
                            <button className="btn btn-sm" onClick={goToPrevMonth}>←</button>
                            <CustomSelect
                                value={selectedMonth.toString()}
                                onChange={(val) => setSelectedMonth(Number(val))}
                                style={{ width: 150 }}
                                options={MONTH_NAMES.map((name, idx) => ({ value: (idx + 1).toString(), label: name }))}
                            />
                            <CustomSelect
                                value={selectedYear.toString()}
                                onChange={(val) => setSelectedYear(Number(val))}
                                style={{ width: 110 }}
                                options={Array.from({ length: 11 }, (_, i) => selectedYear - 5 + i).sort((a, b) => b - a).map(y => ({ value: y.toString(), label: y.toString() }))}
                            />
                            <button className="btn btn-sm" onClick={goToNextMonth}>→</button>
                            {!isCurrentMonth && (
                                <button className="btn btn-sm" onClick={() => { setSelectedMonth(currentMonth); setSelectedYear(currentYear); }}>
                                    Dnes
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button className="btn btn-sm" onClick={() => setSelectedYear(y => y - 1)}>←</button>
                            <span style={{ fontWeight: 600, fontSize: 15, minWidth: 60, textAlign: 'center' }}>{selectedYear}</span>
                            <button className="btn btn-sm" onClick={() => setSelectedYear(y => y + 1)}>→</button>
                        </>
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
