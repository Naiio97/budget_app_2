'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import { getDashboard } from '@/lib/api';

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
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Current view
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

    // Data
    const [budget, setBudget] = useState<MonthlyBudget | null>(null);
    const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
    const [manualAccounts, setManualAccounts] = useState<ManualAccount[]>([]);
    const [annualData, setAnnualData] = useState<AnnualData | null>(null);

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

    // Fetch data
    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const [dashData, recurringRes, accountsRes] = await Promise.all([
                    getDashboard(),
                    fetch('http://localhost:8000/api/recurring-expenses').then(r => r.json()),
                    fetch('http://localhost:8000/api/manual-accounts').then(r => r.json())
                ]);
                setAccounts(dashData.accounts);
                setRecurringExpenses(recurringRes);
                setManualAccounts(accountsRes);
            } catch (err) {
                console.error('Failed to load data:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Fetch monthly budget
    useEffect(() => {
        if (viewMode === 'month') {
            fetchMonthlyBudget();
        } else {
            fetchAnnualData();
        }
    }, [yearMonth, viewMode, selectedYear]);

    const fetchMonthlyBudget = async () => {
        try {
            const res = await fetch(`http://localhost:8000/api/monthly-budget/${yearMonth}`);
            const data = await res.json();
            setBudget(data);
        } catch (err) {
            console.error('Failed to load budget:', err);
        }
    };

    const fetchAnnualData = async () => {
        try {
            const res = await fetch(`http://localhost:8000/api/annual-overview/${selectedYear}`);
            const data = await res.json();
            setAnnualData(data);
        } catch (err) {
            console.error('Failed to load annual data:', err);
        }
    };

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
            await fetch(`http://localhost:8000/api/monthly-budget/${yearMonth}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to update budget:', err);
        }
    };

    const toggleExpensePaid = async (expenseId: number, isPaid: boolean) => {
        try {
            await fetch(`http://localhost:8000/api/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_paid: !isPaid })
            });
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to update expense:', err);
        }
    };

    const updateExpenseAmount = async (expenseId: number, amount: number) => {
        try {
            await fetch(`http://localhost:8000/api/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount })
            });
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to update expense:', err);
        }
    };

    const updateExpensePercentage = async (expenseId: number, my_percentage: number) => {
        try {
            await fetch(`http://localhost:8000/api/monthly-expenses/${expenseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ my_percentage })
            });
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to update expense percentage:', err);
        }
    };

    const createRecurringExpense = async () => {
        if (!newExpense.name || !newExpense.amount) return;
        try {
            // Create recurring expense template
            await fetch('http://localhost:8000/api/recurring-expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newExpense.name,
                    default_amount: parseFloat(newExpense.amount),
                    is_auto_paid: newExpense.is_auto_paid,
                    match_pattern: newExpense.match_pattern || null
                })
            });

            // Also add to current month
            await fetch(`http://localhost:8000/api/monthly-budget/${yearMonth}/expenses`, {
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

            // Reload both recurring expenses and current month budget
            const res = await fetch('http://localhost:8000/api/recurring-expenses');
            setRecurringExpenses(await res.json());
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to create expense:', err);
        }
    };

    const deleteRecurringExpense = async (id: number) => {
        try {
            await fetch(`http://localhost:8000/api/recurring-expenses/${id}`, { method: 'DELETE' });
            setRecurringExpenses(recurringExpenses.filter(e => e.id !== id));
        } catch (err) {
            console.error('Failed to delete expense:', err);
        }
    };

    const deleteMonthlyExpense = async (expenseId: number, recurringExpenseId: number | null) => {
        const deleteRecurring = recurringExpenseId && confirm('Smazat také šablonu pravidelného výdaje?\n\nANO = smazat ze všech budoucích měsíců\nNE = smazat jen z tohoto měsíce');

        try {
            // Delete from current month
            await fetch(`http://localhost:8000/api/monthly-expenses/${expenseId}`, { method: 'DELETE' });

            // Optionally delete recurring template
            if (deleteRecurring && recurringExpenseId) {
                await fetch(`http://localhost:8000/api/recurring-expenses/${recurringExpenseId}`, { method: 'DELETE' });
                setRecurringExpenses(recurringExpenses.filter(e => e.id !== recurringExpenseId));
            }

            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to delete expense:', err);
        }
    };

    const matchTransactions = async () => {
        try {
            const res = await fetch(`http://localhost:8000/api/monthly-budget/${yearMonth}/match-transactions`, { method: 'POST' });
            const data = await res.json();
            const details = data.details || {};
            alert(`Spárováno ${data.matched_count} výdajů:\n\n` +
                `📝 Podle patternu: ${details.by_pattern || 0}\n` +
                `💰 Podle částky: ${details.by_amount || 0}\n` +
                `📂 Podle kategorie: ${details.by_category || 0}`);
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to match transactions:', err);
        }
    };

    const copyFromPrevious = async () => {
        try {
            const res = await fetch(`http://localhost:8000/api/monthly-budget/${yearMonth}/copy-previous`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(`Zkopírováno ${data.expenses_copied} výdajů z ${data.from}`);
            } else {
                alert(data.detail || 'Chyba při kopírování');
            }
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to copy from previous:', err);
        }
    };

    const deleteBudget = async () => {
        if (!confirm(`Opravdu chcete smazat rozpočet pro ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}?`)) {
            return;
        }
        try {
            await fetch(`http://localhost:8000/api/monthly-budget/${yearMonth}`, { method: 'DELETE' });
            setBudget(null);
            // Fetch will create a new empty one if navigated to again
        } catch (err) {
            console.error('Failed to delete budget:', err);
        }
    };

    const syncIncome = async () => {
        try {
            const res = await fetch(`http://localhost:8000/api/monthly-budget/${yearMonth}/sync-income`, { method: 'POST' });
            const data = await res.json();
            alert(`Načteno z transakcí:\nVýplata: ${formatCurrency(data.salary)}`);
            fetchMonthlyBudget();
        } catch (err) {
            console.error('Failed to sync income:', err);
        }
    };

    const createManualAccount = async () => {
        if (!newAccount.name) return;
        try {
            await fetch('http://localhost:8000/api/manual-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newAccount.name,
                    balance: parseFloat(newAccount.balance) || 0
                })
            });
            setNewAccount({ name: '', balance: '' });
            setShowAddAccount(false);
            const res = await fetch('http://localhost:8000/api/manual-accounts');
            setManualAccounts(await res.json());
        } catch (err) {
            console.error('Failed to create account:', err);
        }
    };

    const updateManualAccountBalance = async (accountId: number) => {
        try {
            await fetch(`http://localhost:8000/api/manual-accounts/${accountId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ balance: parseFloat(editAccountBalance) })
            });
            setEditingAccountId(null);
            const res = await fetch('http://localhost:8000/api/manual-accounts');
            setManualAccounts(await res.json());
        } catch (err) {
            console.error('Failed to update account:', err);
        }
    };

    const addAccountItem = async (accountId: number) => {
        if (!newItem.name || !newItem.amount) return;
        try {
            await fetch(`http://localhost:8000/api/manual-accounts/${accountId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newItem.name,
                    amount: parseFloat(newItem.amount),
                    note: newItem.note || null
                })
            });
            setNewItem({ name: '', amount: '', note: '' });
            setShowAddItem(null);
            const res = await fetch('http://localhost:8000/api/manual-accounts');
            setManualAccounts(await res.json());
        } catch (err) {
            console.error('Failed to add item:', err);
        }
    };

    const deleteAccountItem = async (accountId: number, itemId: number) => {
        try {
            await fetch(`http://localhost:8000/api/manual-accounts/${accountId}/items/${itemId}`, { method: 'DELETE' });
            const res = await fetch('http://localhost:8000/api/manual-accounts');
            setManualAccounts(await res.json());
        } catch (err) {
            console.error('Failed to delete item:', err);
        }
    };

    // === Render Functions ===

    const renderMonthTabs = () => (
        <div style={{
            display: 'flex',
            gap: '4px',
            overflowX: 'auto',
            padding: '4px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '12px',
            marginBottom: 'var(--spacing-lg)'
        }}>
            {MONTH_NAMES.map((name, idx) => {
                const month = idx + 1;
                const isSelected = viewMode === 'month' && selectedMonth === month;
                return (
                    <button
                        key={month}
                        onClick={() => { setSelectedMonth(month); setViewMode('month'); }}
                        style={{
                            padding: '8px 12px',
                            border: 'none',
                            borderRadius: '8px',
                            background: isSelected ? 'var(--accent-primary)' : 'transparent',
                            color: isSelected ? '#000' : 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s'
                        }}
                    >
                        {name}
                    </button>
                );
            })}
            <button
                onClick={() => setViewMode('year')}
                style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    background: viewMode === 'year' ? 'var(--accent-warning)' : 'transparent',
                    color: viewMode === 'year' ? '#000' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap',
                    fontWeight: 600
                }}
            >
                📊 Roční přehled
            </button>
        </div>
    );

    const renderIncomeSection = () => (
        <GlassCard style={{ marginBottom: 'var(--spacing-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-success)' }}>💰 Příjmy</h3>
                <button className="btn" onClick={syncIncome} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                    🔄 Načíst z transakcí
                </button>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-error)' }}>📋 Pravidelné výdaje</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn" onClick={copyFromPrevious} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                        📋 Z minulého měsíce
                    </button>
                    <button className="btn" onClick={matchTransactions} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                        🔄 Spárovat
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddExpense(true)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {/* Percentage selector */}
                            <select
                                className="input"
                                value={expense.my_percentage}
                                onChange={(e) => updateExpensePercentage(expense.id, parseInt(e.target.value))}
                                style={{
                                    width: '60px',
                                    padding: '4px',
                                    fontSize: '0.75rem',
                                    background: expense.my_percentage < 100 ? 'rgba(168, 85, 247, 0.2)' : undefined
                                }}
                                title="Můj podíl v %"
                            >
                                <option value={100}>100%</option>
                                <option value={50}>50%</option>
                                <option value={33}>33%</option>
                                <option value={25}>25%</option>
                            </select>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>🏦 Spořící účty</h3>
                <button className="btn btn-primary" onClick={() => setShowAddAccount(true)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                    + Přidat účet
                </button>
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
                    {account.items.length > 0 && (
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
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
            <div style={{ padding: 'var(--spacing-lg)' }}>
                {/* Header with Year Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                    <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
                        📅 Měsíční rozpočet
                    </h1>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            className="btn"
                            onClick={() => {
                                if (selectedMonth === 1) {
                                    // From January, go to December of previous year
                                    setSelectedMonth(12);
                                }
                                setSelectedYear(selectedYear - 1);
                            }}
                            style={{ padding: '4px 12px' }}
                        >
                            ←
                        </button>
                        <span style={{ fontWeight: 600, minWidth: '60px', textAlign: 'center' }}>{selectedYear}</span>
                        <button
                            className="btn"
                            onClick={() => {
                                if (selectedMonth === 12) {
                                    // From December, go to January of next year
                                    setSelectedMonth(1);
                                }
                                setSelectedYear(selectedYear + 1);
                            }}
                            style={{ padding: '4px 12px' }}
                        >
                            →
                        </button>
                        {viewMode === 'month' && (
                            <button
                                className="btn"
                                onClick={deleteBudget}
                                style={{ marginLeft: '16px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-error)' }}
                                title="Smazat tento měsíc"
                            >
                                🗑️ Smazat měsíc
                            </button>
                        )}
                    </div>
                </div>

                {/* Month Tabs */}
                {renderMonthTabs()}

                {/* Content */}
                {viewMode === 'month' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: 'var(--spacing-md)' }}>
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
