'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import GlassCard from '@/components/GlassCard';
import { queryKeys } from '@/lib/queryKeys';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

interface MonthlyExpense {
    id: number;
    name: string;
    amount: number;
    my_percentage: number;
    my_amount: number;
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

interface ManualAccountItem {
    id: number;
    name: string;
    amount: number;
    note: string | null;
}

interface ManualAccount {
    id: number;
    name: string;
    balance: number;
    currency: string;
    items: ManualAccountItem[];
    items_total: number;
    available_balance: number;
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

    // Current view
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
    const [newItem, setNewItem] = useState({ name: '', amount: '', note: '' });

    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    const { data: recurringExpenses = [] } = useQuery<RecurringExpense[]>({
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

    const refreshBudget = () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.monthlyBudget(yearMonth) });

    const refreshManualAccounts = () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.manualAccounts });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency: 'CZK',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

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

    const updateExpenseAmount = async (expenseId: number, amount: number) => {
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount })
            });
            refreshBudget();
        } catch (err) {
            console.error('Failed to update expense:', err);
        }
    };

    const updateExpensePercentage = async (expenseId: number, my_percentage: number) => {
        try {
            await fetch(`${API_BASE}/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ my_percentage })
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
            const details = data.details || {};
            alert(`Spárováno ${data.matched_count} výdajů:\n\n` +
                `📝 Podle patternu: ${details.by_pattern || 0}\n` +
                `💰 Podle částky: ${details.by_amount || 0}\n` +
                `📂 Podle kategorie: ${details.by_category || 0}`);
            refreshBudget();
        } catch (err) {
            console.error('Failed to match transactions:', err);
        }
    };

    const copyFromPrevious = async () => {
        try {
            const res = await fetch(`${API_BASE}/monthly-budget/${yearMonth}/copy-previous`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(`Zkopírováno ${data.expenses_copied} výdajů z ${data.from}`);
            } else {
                alert(data.detail || 'Chyba při kopírování');
            }
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
            await fetch(`${API_BASE}/manual-accounts/${accountId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newItem.name, amount: parseFloat(newItem.amount), note: newItem.note || null })
            });
            setNewItem({ name: '', amount: '', note: '' });
            setShowAddItem(null);
            refreshManualAccounts();
        } catch (err) {
            console.error('Failed to add item:', err);
        }
    };

    const deleteAccountItem = async (accountId: number, itemId: number) => {
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}/items/${itemId}`, { method: 'DELETE' });
            refreshManualAccounts();
        } catch (err) {
            console.error('Failed to delete item:', err);
        }
    };

    // === Render Functions ===

    // Removed renderMonthTabs() as it is replaced by native selects in the header below.



    const renderIncomeSection = () => (
        <GlassCard style={{ marginBottom: 'var(--spacing-md)' }}>
            <div className="section-header-wrap">
                <h3 style={{ margin: 0, color: 'var(--accent-success)' }}>💰 Příjmy</h3>
                <div className="section-actions">
                    <button className="btn" onClick={syncIncome} style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}>
                        🔄 Načíst z transakcí
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                    { label: 'Výplata', field: 'salary', value: budget?.salary || 0 },
                    { label: 'Další příjem', field: 'other_income', value: budget?.other_income || 0 },
                    { label: 'Stravenky', field: 'meal_vouchers', value: budget?.meal_vouchers || 0 },
                ].map(item => (
                    <div key={item.field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: '8px',
                    marginTop: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 600,
                    color: 'var(--accent-success)'
                }}>
                    <span>Příjmy celkem</span>
                    <span>{formatCurrency(budget?.total_income || 0)}</span>
                </div>
            </div>
        </GlassCard>
    );

    const renderExpensesSection = () => (
        <GlassCard style={{ marginBottom: 'var(--spacing-md)' }}>
            <div className="section-header-wrap">
                <h3 style={{ margin: 0, color: 'var(--accent-error)' }}>📋 Pravidelné výdaje</h3>
                <div className="section-actions">
                    <button className="btn" onClick={copyFromPrevious} style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}>
                        📋 Z minula
                    </button>
                    <button className="btn" onClick={matchTransactions} style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)' }}>
                        🔄 Spárovat
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddExpense(true)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        + Přidat
                    </button>
                </div>
            </div>

            {showAddExpense && (
                <div style={{
                    padding: 'var(--spacing-md)',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    marginBottom: 'var(--spacing-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <input
                        className="input"
                        placeholder="Název výdaje"
                        value={newExpense.name}
                        onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="number"
                            className="input"
                            placeholder="Částka"
                            value={newExpense.amount}
                            onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                            style={{ flex: 1 }}
                        />
                        <input
                            className="input"
                            placeholder="Match pattern (volitelné)"
                            value={newExpense.match_pattern}
                            onChange={(e) => setNewExpense({ ...newExpense, match_pattern: e.target.value })}
                            style={{ flex: 1 }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={newExpense.is_auto_paid}
                            onChange={(e) => setNewExpense({ ...newExpense, is_auto_paid: e.target.checked })}
                        />
                        Automatická platba (zelená)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary" onClick={createRecurringExpense}>Uložit</button>
                        <button className="btn" onClick={() => setShowAddExpense(false)}>Zrušit</button>
                    </div>
                </div>
            )}

            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {budget?.expenses.map(expense => (
                    <div
                        key={expense.id}
                        className="expense-row"
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px',
                            borderRadius: '6px',
                            background: expense.is_auto_paid ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                            marginBottom: '4px'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, width: '100%' }}>
                            <input
                                type="checkbox"
                                checked={expense.is_paid}
                                onChange={() => toggleExpensePaid(expense.id, expense.is_paid)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{
                                textDecoration: expense.is_paid ? 'line-through' : 'none',
                                opacity: expense.is_paid ? 0.6 : 1,
                                flex: 1
                            }}>
                                {expense.name}
                                {expense.matched_transaction_id && <span style={{ marginLeft: '4px', fontSize: '0.7rem' }}>✓</span>}
                            </span>
                        </div>
                        <div className="expense-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {/* Percentage selector */}
                            <CustomSelect
                                value={expense.my_percentage.toString()}
                                onChange={(val) => updateExpensePercentage(expense.id, parseInt(val))}
                                style={{
                                    width: '80px',
                                    fontSize: '0.75rem',
                                }}
                                options={[
                                    { value: '100', label: '100%' },
                                    { value: '50', label: '50%' },
                                    { value: '33', label: '33%' },
                                    { value: '25', label: '25%' },
                                ]}
                            />
                            {/* Amount input */}
                            <input
                                type="number"
                                className="input"
                                value={expense.amount}
                                onChange={(e) => updateExpenseAmount(expense.id, parseFloat(e.target.value) || 0)}
                                style={{ width: '85px', textAlign: 'right', padding: '4px 8px' }}
                                title="Celková platba"
                            />
                            {/* Show my_amount if not 100% */}
                            {expense.my_percentage < 100 && (
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--accent-primary)',
                                    minWidth: '70px',
                                    textAlign: 'right'
                                }} title="Můj podíl">
                                    → {formatCurrency(expense.my_amount)}
                                </span>
                            )}
                            <button
                                onClick={() => deleteMonthlyExpense(expense.id, expense.recurring_expense_id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    opacity: 0.5,
                                    padding: '4px'
                                }}
                                title="Smazat výdaj"
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: '8px',
                marginTop: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 600
            }}>
                <span>Výdaje celkem</span>
                <span style={{ color: 'var(--accent-error)' }}>{formatCurrency(budget?.total_expenses || 0)}</span>
            </div>
        </GlassCard>
    );

    const renderSurplusSection = () => (
        <GlassCard style={{ marginBottom: 'var(--spacing-md)' }}>
            <h3 style={{ margin: '0 0 var(--spacing-md) 0' }}>📊 Přebytek</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Investice tento měsíc</span>
                    <input
                        type="number"
                        className="input"
                        value={budget?.investment_amount || 0}
                        onChange={(e) => updateBudget('investment_amount', parseFloat(e.target.value) || 0)}
                        style={{ width: '120px', textAlign: 'right', padding: '4px 8px' }}
                    />
                </div>
                <div style={{
                    padding: 'var(--spacing-md)',
                    background: (budget?.remaining || 0) >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '8px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Zbylé peníze</div>
                    <div style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: (budget?.remaining || 0) >= 0 ? 'var(--accent-success)' : 'var(--accent-error)'
                    }}>
                        {formatCurrency(budget?.remaining || 0)}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Posláno na spořící účet</span>
                    <input
                        type="number"
                        className="input"
                        value={budget?.surplus_to_savings || 0}
                        onChange={(e) => updateBudget('surplus_to_savings', parseFloat(e.target.value) || 0)}
                        style={{ width: '120px', textAlign: 'right', padding: '4px 8px' }}
                    />
                </div>
            </div>
        </GlassCard>
    );

    const renderManualAccounts = () => (
        <GlassCard>
            <div className="section-header-wrap">
                <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>🏦 Spořící účty</h3>
                <div className="section-actions">
                    <button className="btn btn-primary" onClick={() => setShowAddAccount(true)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        + Přidat účet
                    </button>
                </div>
            </div>

            {showAddAccount && (
                <div style={{
                    padding: 'var(--spacing-md)',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    marginBottom: 'var(--spacing-md)',
                    display: 'flex',
                    gap: '8px'
                }}>
                    <input
                        className="input"
                        placeholder="Název účtu"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                        style={{ flex: 1 }}
                    />
                    <input
                        type="number"
                        className="input"
                        placeholder="Zůstatek"
                        value={newAccount.balance}
                        onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                        style={{ width: '120px' }}
                    />
                    <button className="btn btn-primary" onClick={createManualAccount}>Uložit</button>
                    <button className="btn" onClick={() => setShowAddAccount(false)}>×</button>
                </div>
            )}

            {manualAccounts.map(account => (
                <div key={account.id} style={{
                    padding: 'var(--spacing-md)',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    marginBottom: 'var(--spacing-sm)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600 }}>{account.name}</span>
                        {editingAccountId === account.id ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <input
                                    type="number"
                                    className="input"
                                    value={editAccountBalance}
                                    onChange={(e) => setEditAccountBalance(e.target.value)}
                                    style={{ width: '100px', padding: '4px 8px' }}
                                />
                                <button className="btn btn-primary" onClick={() => updateManualAccountBalance(account.id)} style={{ padding: '4px 8px' }}>✓</button>
                                <button className="btn" onClick={() => setEditingAccountId(null)} style={{ padding: '4px 8px' }}>×</button>
                            </div>
                        ) : (
                            <span
                                onClick={() => { setEditingAccountId(account.id); setEditAccountBalance(String(account.balance)); }}
                                style={{ cursor: 'pointer', color: 'var(--accent-primary)' }}
                            >
                                {formatCurrency(account.balance)} ✏️
                            </span>
                        )}
                    </div>

                    {/* Items */}
                    {Array.isArray(account.items) && account.items.length > 0 && (
                        <div style={{ paddingLeft: '16px', borderLeft: '2px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Položky (není moje):</div>
                            {account.items.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '2px' }}>
                                    <span>{item.name}</span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--accent-warning)' }}>-{formatCurrency(item.amount)}</span>
                                        <button
                                            onClick={() => deleteAccountItem(account.id, item.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', opacity: 0.5 }}
                                        >🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {showAddItem === account.id ? (
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                            <input className="input" placeholder="Název" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} style={{ flex: 1, padding: '4px 8px' }} />
                            <input type="number" className="input" placeholder="Částka" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} style={{ width: '80px', padding: '4px 8px' }} />
                            <button className="btn btn-primary" onClick={() => addAccountItem(account.id)} style={{ padding: '4px 8px' }}>✓</button>
                            <button className="btn" onClick={() => setShowAddItem(null)} style={{ padding: '4px 8px' }}>×</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAddItem(account.id)}
                            style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                            + Přidat položku
                        </button>
                    )}

                    <div style={{
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        paddingTop: '8px',
                        marginTop: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 600,
                        color: 'var(--accent-success)'
                    }}>
                        <span>Reálně moje</span>
                        <span>{formatCurrency(account.available_balance)}</span>
                    </div>
                </div>
            ))}
        </GlassCard>
    );

    const renderAnnualOverview = () => {
        if (!annualData) return <div>Načítám...</div>;

        const maxIncome = Math.max(...annualData.months.map(m => m.income));
        const maxExpenses = Math.max(...annualData.months.map(m => m.expenses));
        const maxValue = Math.max(maxIncome, maxExpenses);

        return (
            <>
                {/* Summary Cards */}
                <div className="dashboard-grid" style={{ gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <GlassCard>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Příjmy celkem</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-success)' }}>{formatCurrency(annualData.totals.income)}</div>
                    </GlassCard>
                    <GlassCard>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Výdaje celkem</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-error)' }}>{formatCurrency(annualData.totals.expenses)}</div>
                    </GlassCard>
                    <GlassCard>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Investice</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{formatCurrency(annualData.totals.investments)}</div>
                    </GlassCard>
                    <GlassCard>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Čistý zisk</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: annualData.totals.net >= 0 ? 'var(--accent-success)' : 'var(--accent-error)' }}>
                            {formatCurrency(annualData.totals.net)}
                        </div>
                    </GlassCard>
                </div>

                {/* Monthly Chart */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ margin: '0 0 var(--spacing-md) 0' }}>📈 Měsíční přehled</h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '200px' }}>
                        {annualData.months.map((month, idx) => (
                            <div key={month.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '180px' }}>
                                    <div
                                        style={{
                                            width: '12px',
                                            height: `${(month.income / maxValue) * 100}%`,
                                            background: 'var(--accent-success)',
                                            borderRadius: '2px 2px 0 0',
                                            minHeight: month.income > 0 ? '4px' : '0'
                                        }}
                                        title={`Příjmy: ${formatCurrency(month.income)}`}
                                    />
                                    <div
                                        style={{
                                            width: '12px',
                                            height: `${(month.expenses / maxValue) * 100}%`,
                                            background: 'var(--accent-error)',
                                            borderRadius: '2px 2px 0 0',
                                            minHeight: month.expenses > 0 ? '4px' : '0'
                                        }}
                                        title={`Výdaje: ${formatCurrency(month.expenses)}`}
                                    />
                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{MONTH_NAMES[idx].substring(0, 3)}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center', marginTop: 'var(--spacing-md)' }}>
                        <span style={{ fontSize: '0.8rem' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--accent-success)', borderRadius: '2px', marginRight: '4px' }} />Příjmy</span>
                        <span style={{ fontSize: '0.8rem' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'var(--accent-error)', borderRadius: '2px', marginRight: '4px' }} />Výdaje</span>
                    </div>
                </GlassCard>

                {/* Expense Breakdown */}
                <GlassCard>
                    <h3 style={{ margin: '0 0 var(--spacing-md) 0' }}>🍕 Výdaje podle kategorií</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(annualData.expense_breakdown)
                            .sort(([, a], [, b]) => b - a)
                            .map(([name, amount]) => {
                                const percentage = (amount / annualData.totals.expenses) * 100;
                                return (
                                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ width: '150px', fontSize: '0.85rem' }}>{name}</span>
                                        <div style={{ flex: 1, height: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${percentage}%`, background: 'var(--accent-primary)', borderRadius: '4px' }} />
                                        </div>
                                        <span style={{ width: '100px', textAlign: 'right', fontSize: '0.85rem' }}>{formatCurrency(amount)}</span>
                                        <span style={{ width: '50px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{percentage.toFixed(0)}%</span>
                                    </div>
                                );
                            })}
                    </div>
                </GlassCard>
            </>
        );
    };

    return (
        <MainLayout>
            <div className="page-container">
                {/* Header Toolbar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: 'var(--spacing-lg)' }}>
                    {/* Title */}
                    <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
                        📅 Rozpočet
                    </h1>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setViewMode(viewMode === 'month' ? 'year' : 'month')}
                            className="btn"
                            style={{
                                background: viewMode === 'year' ? 'var(--accent-warning)' : 'rgba(255,255,255,0.05)',
                                color: viewMode === 'year' ? '#000' : 'var(--text-primary)',
                                padding: '6px 12px',
                                fontSize: '0.85rem',
                                fontWeight: viewMode === 'year' ? 600 : 400
                            }}
                        >
                            {viewMode === 'year' ? 'Zpět na měsíc' : '📊 Roční přehled'}
                        </button>
                        {viewMode === 'month' && (
                            <button
                                className="btn"
                                onClick={deleteBudget}
                                style={{
                                    fontSize: '0.85rem',
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: 'var(--accent-error)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    padding: '6px 12px',
                                }}
                                title="Smazat tento měsíc"
                            >
                                🗑️ Smazat
                            </button>
                        )}
                    </div>

                    {/* Filters Row: Native Selects for Month & Year */}
                    {viewMode === 'month' && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <CustomSelect
                                value={selectedMonth.toString()}
                                onChange={(val) => setSelectedMonth(Number(val))}
                                style={{ width: '150px' }}
                                options={MONTH_NAMES.map((name, idx) => ({
                                    value: (idx + 1).toString(),
                                    label: name
                                }))}
                            />

                            <CustomSelect
                                value={selectedYear.toString()}
                                onChange={(val) => setSelectedYear(Number(val))}
                                style={{ width: '120px' }}
                                options={Array.from({ length: 11 }, (_, i) => selectedYear - 5 + i)
                                    .sort((a, b) => b - a)
                                    .map(y => ({
                                        value: y.toString(),
                                        label: y.toString()
                                    }))}
                            />
                        </div>
                    )}
                </div>

                {/* Content */}
                {viewMode === 'month' ? (
                    <div className="rozpocet-grid">
                        {/* Left Column - Income & Savings */}
                        <div>
                            {renderIncomeSection()}
                            {renderSurplusSection()}
                        </div>

                        {/* Middle Column - Expenses */}
                        <div>
                            {renderExpensesSection()}
                        </div>

                        {/* Right Column - Manual Accounts */}
                        <div>
                            {renderManualAccounts()}
                        </div>
                    </div>
                ) : (
                    renderAnnualOverview()
                )}
            </div>
        </MainLayout>
    );
}
