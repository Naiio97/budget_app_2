'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import PeriodNavigator from '@/components/PeriodNavigator';
import CashflowCard from '@/components/CashflowCard';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import { getLineIcon } from '@/lib/line-icons';
import { apiFetch, getCashflowCurrent, Cashflow } from '@/lib/api';

interface MonthlyExpense {
    id: number; name: string; amount: number;
    my_percentage: number; my_amount: number; my_amount_override: number | null;
    is_paid: boolean; is_auto_paid: boolean;
    matched_transaction_id: string | null; recurring_expense_id: number | null;
    is_loan?: boolean; loan_id?: number | null; loan_payment_id?: number | null;
    is_subscription?: boolean; subscription_id?: number | null;
    due_day?: number | null;
}
interface IncomeItem { id: number; name: string; amount: number; order_index: number; is_salary: boolean; }
interface MonthlyBudget {
    id: number; year_month: string;
    income_items: IncomeItem[];
    investment_amount: number; surplus_to_savings: number; is_closed: boolean;
    total_income: number; total_expenses: number; remaining: number;
    expenses: MonthlyExpense[];
}
interface RecurringExpense { id: number; name: string; default_amount: number; is_auto_paid: boolean; match_pattern: string | null; category: string | null; order_index: number; is_active: boolean; due_day: number | null; }
interface Envelope { id: number; name: string; amount: number; is_mine: boolean; note: string | null; }
interface ManualAccount { id: number; name: string; balance: number; currency: string; my_balance: number; envelopes: Envelope[]; }
interface AnnualData {
    year: number;
    months: Array<{ month: number; year_month: string; income: number; expenses: number; investments: number; savings: number; remaining: number; }>;
    totals: { income: number; expenses: number; investments: number; savings: number; net: number; };
    previous_year?: { income: number; expenses: number; investments: number; savings: number; net: number; };
    expense_breakdown: Record<string, number>;
    averages: { income: number; expenses: number; investments: number; };
}

const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
type Tab = 'overview' | 'expenses' | 'accounts';

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

function Ring({ pct, size = 160 }: { pct: number; size?: number }) {
    const r = (size / 2) - 12;
    const circ = 2 * Math.PI * r;
    const color = pct >= 100 ? 'var(--neg)' : pct >= 80 ? 'var(--warn)' : 'var(--pos)';
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="10" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={color} strokeWidth="10"
                strokeDasharray={`${Math.min(pct, 100) / 100 * circ} ${circ}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.2,0.9,0.3,1)' }}
            />
        </svg>
    );
}

export default function RozpocetPage() {
    const queryClient = useQueryClient();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const [showAddExpense, setShowAddExpense] = useState(false);
    const [newExpense, setNewExpense] = useState({ name: '', amount: '', is_auto_paid: false, match_pattern: '', due_day: '' });
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
    const [editingDueDays, setEditingDueDays] = useState<Record<number, string>>({});
    const [expandedExpenseId, setExpandedExpenseId] = useState<number | null>(null);

    const autoSyncedMonths = useRef<Set<string>>(new Set());
    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    useQuery<RecurringExpense[]>({
        queryKey: queryKeys.recurringExpenses,
        queryFn: () => apiFetch(`/recurring-expenses`).then(r => r.json()),
        staleTime: 5 * 60 * 1000,
    });

    const { data: manualAccounts = [] } = useQuery<ManualAccount[]>({
        queryKey: queryKeys.manualAccounts,
        queryFn: () => apiFetch(`/manual-accounts/`).then(r => r.json()),
    });

    const { data: budget } = useQuery<MonthlyBudget>({
        queryKey: queryKeys.monthlyBudget(yearMonth),
        queryFn: () => apiFetch(`/monthly-budget/${yearMonth}`).then(r => r.json()),
        enabled: viewMode === 'month',
    });

    // Cashflow projekce má smysl jen pro aktuální měsíc
    const { data: cashflow } = useQuery<Cashflow>({
        queryKey: queryKeys.cashflow,
        queryFn: getCashflowCurrent,
        enabled: viewMode === 'month'
            && selectedYear === currentYear && selectedMonth === currentMonth,
    });

    const { data: annualData } = useQuery<AnnualData>({
        queryKey: queryKeys.annualOverview(selectedYear),
        queryFn: () => apiFetch(`/annual-overview/${selectedYear}`).then(r => r.json()),
    });

    const { data: prevYearData } = useQuery<AnnualData>({
        queryKey: queryKeys.annualOverview(selectedYear - 1),
        queryFn: () => apiFetch(`/annual-overview/${selectedYear - 1}`).then(r => r.json()),
        enabled: selectedMonth === 1,
    });

    const refreshBudget = useCallback(() => Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.monthlyBudget(yearMonth) }),
        // Zaplacení/úprava položky mění i projekci cashflow
        queryClient.invalidateQueries({ queryKey: queryKeys.cashflow }),
    ]), [queryClient, yearMonth]);
    const refreshManualAccounts = () => queryClient.invalidateQueries({ queryKey: queryKeys.manualAccounts });

    useEffect(() => {
        if (!budget || viewMode !== 'month') return;
        if (autoSyncedMonths.current.has(yearMonth)) return;
        autoSyncedMonths.current.add(yearMonth);
        const run = async () => {
            setIsAutoSyncing(true);
            try {
                const salaryRow = budget.income_items.find(i => i.is_salary);
                if (!salaryRow || salaryRow.amount === 0)
                    await apiFetch(`/monthly-budget/${yearMonth}/sync-income`, { method: 'POST' });
                await apiFetch(`/monthly-budget/${yearMonth}/match-transactions`, { method: 'POST' });
                await refreshBudget();
            } finally { setIsAutoSyncing(false); }
        };
        run();
    }, [budget, yearMonth, viewMode, refreshBudget]);

    // ── helpers ──────────────────────────────────────────────────

    const updateBudget = async (field: string, value: number) => {
        await apiFetch(`/monthly-budget/${yearMonth}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) });
        refreshBudget();
    };
    const commitBudgetField = (field: string, cur: number) => {
        const raw = editingBudgetFields[field];
        setEditingBudgetFields(p => { const n = { ...p }; delete n[field]; return n; });
        if (raw === undefined) return;
        const v = parseFloat(raw) || 0;
        if (v !== cur) updateBudget(field, v);
    };
    const commitIncomeAmount = async (item: IncomeItem) => {
        const raw = editingIncomeAmounts[item.id];
        setEditingIncomeAmounts(p => { const n = { ...p }; delete n[item.id]; return n; });
        if (raw === undefined) return;
        const v = parseFloat(raw) || 0;
        if (v === item.amount) return;
        await apiFetch(`/monthly-income-items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: v }) });
        refreshBudget();
    };
    const commitIncomeName = async (item: IncomeItem) => {
        const raw = editingIncomeNames[item.id];
        setEditingIncomeNames(p => { const n = { ...p }; delete n[item.id]; return n; });
        if (!raw || raw.trim() === item.name) return;
        await apiFetch(`/monthly-income-items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: raw.trim() }) });
        refreshBudget();
    };
    const addIncomeItem = async () => {
        await apiFetch(`/monthly-budget/${yearMonth}/income-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Nový příjem', amount: 0, is_salary: false }) });
        refreshBudget();
    };
    const deleteIncomeItem = async (id: number) => {
        await apiFetch(`/monthly-income-items/${id}`, { method: 'DELETE' });
        refreshBudget();
    };
    const toggleExpensePaid = async (id: number, isPaid: boolean) => {
        await apiFetch(`/monthly-expenses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_paid: !isPaid }) });
        refreshBudget();
    };
    // Loan rows are live-linked: toggling paid routes to the loan payment endpoint,
    // not /monthly-expenses. Also refresh loan queries so the Úvěry page stays in sync.
    const toggleLoanPaid = async (loanId: number, paymentId: number, isPaid: boolean) => {
        await apiFetch(`/loans/${loanId}/payments/${paymentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_paid: !isPaid }) });
        refreshBudget();
        queryClient.invalidateQueries({ queryKey: queryKeys.loans });
        queryClient.invalidateQueries({ queryKey: queryKeys.loansSummary });
        queryClient.invalidateQueries({ queryKey: queryKeys.loanSchedule(loanId) });
    };
    const saveExpenseAmount = async (expense: MonthlyExpense) => {
        const raw = editingAmounts[expense.id];
        if (raw === undefined) return;
        const v = parseFloat(raw) || 0;
        setEditingAmounts(p => { const n = { ...p }; delete n[expense.id]; return n; });
        if (v === expense.amount) return;
        await apiFetch(`/monthly-expenses/${expense.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: v }) });
        refreshBudget();
    };
    const saveExpenseName = async (expense: MonthlyExpense) => {
        const raw = editingExpenseNames[expense.id];
        if (raw === undefined) return;
        const name = raw.trim();
        setEditingExpenseNames(p => { const n = { ...p }; delete n[expense.id]; return n; });
        if (!name || name === expense.name) return;
        await apiFetch(`/monthly-expenses/${expense.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        refreshBudget();
    };
    // Splatnost žije na šabloně pravidelné platby (recurring_expenses.due_day),
    // ne na měsíčním řádku — uloží se tam a promítne do všech měsíců.
    const saveDueDay = async (expense: MonthlyExpense) => {
        const raw = editingDueDays[expense.id];
        setEditingDueDays(p => { const n = { ...p }; delete n[expense.id]; return n; });
        if (raw === undefined || !expense.recurring_expense_id) return;
        const v = raw === '' ? 0 : parseInt(raw, 10); // 0 = smazat splatnost
        if (Number.isNaN(v) || v === (expense.due_day ?? 0)) return;
        await apiFetch(`/recurring-expenses/${expense.recurring_expense_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_day: v }) });
        queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses });
        refreshBudget();
    };
    const saveMyAmount = async (expense: MonthlyExpense) => {
        const raw = editingMyAmounts[expense.id];
        if (raw === undefined) return;
        const v = parseFloat(raw) || 0;
        setEditingMyAmounts(p => { const n = { ...p }; delete n[expense.id]; return n; });
        await apiFetch(`/monthly-expenses/${expense.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ my_amount_override: v }) });
        refreshBudget();
    };
    const saveCustomOverride = async (id: number, v: number) => {
        await apiFetch(`/monthly-expenses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ my_amount_override: v }) });
        refreshBudget();
    };
    const updateExpensePercentage = async (id: number, pct: number) => {
        await apiFetch(`/monthly-expenses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ my_percentage: pct, my_amount_override: -1 }) });
        refreshBudget();
    };
    const createRecurringExpense = async () => {
        if (!newExpense.name || !newExpense.amount) return;
        const dueDay = parseInt(newExpense.due_day, 10);
        await apiFetch(`/recurring-expenses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newExpense.name, default_amount: parseFloat(newExpense.amount), is_auto_paid: newExpense.is_auto_paid, match_pattern: newExpense.match_pattern || null, due_day: Number.isNaN(dueDay) ? null : dueDay }) });
        await apiFetch(`/monthly-budget/${yearMonth}/expenses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newExpense.name, default_amount: parseFloat(newExpense.amount), is_auto_paid: newExpense.is_auto_paid }) });
        setNewExpense({ name: '', amount: '', is_auto_paid: false, match_pattern: '', due_day: '' });
        setShowAddExpense(false);
        queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses });
        refreshBudget();
    };
    const deleteMonthlyExpense = async (id: number) => {
        await apiFetch(`/monthly-expenses/${id}`, { method: 'DELETE' });
        refreshBudget();
    };
    const matchTransactions = async () => {
        const res = await apiFetch(`/monthly-budget/${yearMonth}/match-transactions`, { method: 'POST' });
        const data = await res.json();
        alert(`Spárováno ${data.matched_count} výdajů:\n\n📝 Podle patternu: ${data.details?.by_pattern || 0}\n💰 Podle částky: ${data.details?.by_amount || 0}\n📂 Podle kategorie: ${data.details?.by_category || 0}`);
        refreshBudget();
    };
    const copyFromPrevious = async () => {
        const res = await apiFetch(`/monthly-budget/${yearMonth}/copy-previous`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) alert(`Zkopírováno ${data.expenses_copied} výdajů z ${data.from}`);
        else alert(data.detail || 'Chyba při kopírování');
        refreshBudget();
    };
    const deleteBudgetMonth = async () => {
        if (!confirm(`Smazat rozpočet pro ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}?`)) return;
        await apiFetch(`/monthly-budget/${yearMonth}`, { method: 'DELETE' });
        refreshBudget();
    };
    const syncIncome = async () => {
        const res = await apiFetch(`/monthly-budget/${yearMonth}/sync-income`, { method: 'POST' });
        const data = await res.json();
        alert(`Načteno z transakcí:\nVýplata: ${formatCurrency(data.salary)}`);
        refreshBudget();
    };
    const createManualAccount = async () => {
        if (!newAccount.name) return;
        await apiFetch(`/manual-accounts/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newAccount.name, balance: parseFloat(newAccount.balance) || 0 }) });
        setNewAccount({ name: '', balance: '' }); setShowAddAccount(false); refreshManualAccounts();
    };
    const updateManualAccountBalance = async (id: number) => {
        await apiFetch(`/manual-accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance: parseFloat(editAccountBalance) }) });
        setEditingAccountId(null); refreshManualAccounts();
    };
    const addAccountItem = async (accountId: number) => {
        if (!newItem.name || !newItem.amount) return;
        await apiFetch(`/manual-accounts/${accountId}/envelopes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newItem.name, amount: parseFloat(newItem.amount), is_mine: newItem.is_mine, note: newItem.note || null }) });
        setNewItem({ name: '', amount: '', is_mine: false, note: '' }); setShowAddItem(null); refreshManualAccounts();
    };
    const deleteAccountItem = async (accountId: number, itemId: number) => {
        await apiFetch(`/manual-accounts/${accountId}/envelopes/${itemId}`, { method: 'DELETE' });
        refreshManualAccounts();
    };

    // ── computed ─────────────────────────────────────────────────
    const totalIncome = budget?.total_income || 0;
    const totalExpenses = budget?.total_expenses || 0;
    const remaining = budget?.remaining || 0;
    const investmentAmount = budget?.investment_amount || 0;
    const netSavings = investmentAmount + (budget?.surplus_to_savings || 0);
    const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;
    const isOverBudget = remaining < 0;
    const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const daysRemaining = isCurrentMonth ? Math.max(daysInMonth - now.getDate(), 0) : 0;
    const budgetLimit = totalIncome || Math.max(totalExpenses + remaining, totalExpenses);
    const budgetSpentPct = budgetLimit > 0 ? Math.round((totalExpenses / budgetLimit) * 100) : 0;
    const dailyPace = daysRemaining > 0 ? Math.round(Math.max(remaining, 0) / daysRemaining) : Math.max(remaining, 0);
    const monthSubLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} · ${isCurrentMonth ? `zbývá ${daysRemaining} dní do konce měsíce` : 'historický měsíc'}`;
    // Řazení podle skutečné splatnosti (recurring_expenses.due_day / splátkový
    // kalendář úvěru); bez data až na konec, tam podle výše částky.
    const byDueDay = (a: MonthlyExpense, b: MonthlyExpense) =>
        (a.due_day ?? 99) - (b.due_day ?? 99) || b.my_amount - a.my_amount;
    const upcomingExpenses = [...(budget?.expenses || [])]
        .filter(expense => !expense.is_paid)
        .sort(byDueDay)
        .slice(0, 4);
    const sortedExpenses = [...(budget?.expenses || [])].sort(byDueDay);
    const dueLabel = (expense: MonthlyExpense) =>
        expense.due_day ? `${expense.due_day}. ${selectedMonth}.` : '';

    const prevMonthIncome = selectedMonth === 1
        ? prevYearData?.months?.find(m => m.month === 12)?.income ?? 0
        : annualData?.months?.find(m => m.month === selectedMonth - 1)?.income ?? 0;
    const incomeDelta = totalIncome - prevMonthIncome;

    // ── tabs ─────────────────────────────────────────────────────

    const TABS: { key: Tab; label: string }[] = [
        { key: 'overview', label: 'Přehled' },
        { key: 'expenses', label: 'Pravidelné platby' },
        { key: 'accounts', label: 'Spořící účty' },
    ];

    // ── tab content ──────────────────────────────────────────────

    const renderOverview = () => (<>
        {isCurrentMonth && cashflow && <CashflowCard data={cashflow} />}
        <div className="budget-overview-grid">
            <div className="surface budget-upcoming-card">
                <div className="card-head">
                    <h3>Nadcházející platby</h3>
                    <span className="muted small">{upcomingExpenses.length} · {formatCurrency(upcomingExpenses.reduce((s, e) => s + e.my_amount, 0))}</span>
                </div>
                <div className="card-body budget-payment-list">
                    {upcomingExpenses.length === 0 ? (
                        <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 'var(--spacing-md)' }}>
                            Všechny platby jsou označené jako zaplacené.
                        </div>
                    ) : upcomingExpenses.map(expense => (
                        <div key={expense.id} className="budget-payment-row">
                            <div className="budget-payment-dot" />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div className="budget-payment-name">{expense.name}</div>
                                <div className="budget-payment-meta">
                                    {[
                                        expense.due_day ? `Splatnost ${expense.due_day}. ${selectedMonth}.` : null,
                                        expense.is_auto_paid ? 'automatická platba' : null,
                                    ].filter(Boolean).join(' · ') || 'Čeká na úhradu'}
                                </div>
                            </div>
                            <div className="num budget-payment-amount">{formatCurrency(expense.my_amount)}</div>
                            <button className="btn btn-sm budget-payment-action" onClick={() => toggleExpensePaid(expense.id, expense.is_paid)}>Zaplatit</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="surface budget-plan-card">
                <div className="card-head">
                    <h3>Měsíční plán</h3>
                    <span className="muted small">{formatCurrency(totalIncome)} příjem</span>
                </div>
                <div className="card-body budget-plan-body">
                    {renderIncome()}
                    {renderSurplus()}
                </div>
            </div>
        </div>
    </>);

    const renderExpenses = () => (
        <div className="budget-expenses-split">
            <div className="surface recurring-payments-card">
                <div className="card-head">
                    <h3>Všechny pravidelné platby</h3>
                    <div className="section-actions">
                        <button className="btn btn-sm" onClick={copyFromPrevious}>Z minula</button>
                        <button className="btn btn-sm" onClick={matchTransactions}>Spárovat</button>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddExpense(true)}>+ Přidat</button>
                    </div>
                </div>
                <div className="card-body recurring-payments-body">
                    {showAddExpense && (
                        <div style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <input className="input" placeholder="Název výdaje" value={newExpense.name} onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })} />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input type="number" className="input" placeholder="Částka" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} style={{ flex: 1 }} />
                                <input type="number" min={1} max={31} className="input" placeholder="Den splatnosti" value={newExpense.due_day} onChange={(e) => setNewExpense({ ...newExpense, due_day: e.target.value })} style={{ width: 130 }} />
                                <input className="input" placeholder="Match pattern" value={newExpense.match_pattern} onChange={(e) => setNewExpense({ ...newExpense, match_pattern: e.target.value })} style={{ flex: 1 }} />
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

                    <div className="recurring-payments-list">
                        {sortedExpenses.map(expense => {
                            const isExpanded = expandedExpenseId === expense.id;
                            const isLoan = !!expense.is_loan;
                            const isSubscription = !!expense.is_subscription;
                            const amountLabel = expense.my_amount_override !== null || expense.my_percentage < 100
                                ? formatCurrency(expense.my_amount)
                                : formatCurrency(expense.amount);
                            return (
                                <div key={isLoan ? `loan-${expense.loan_payment_id}` : isSubscription ? `sub-${expense.subscription_id}` : expense.id} className={`bd-card ${isExpanded ? 'expanded' : ''}`}>
                                    <button type="button" className="bd-head" onClick={() => setExpandedExpenseId(isExpanded ? null : expense.id)}>
                                        <span className={`recurring-dot ${expense.is_paid ? 'paid' : ''}`} />
                                        <span className={`recurring-name ${expense.is_paid ? 'paid' : ''}`}>
                                            {expense.name}
                                            {isLoan && <span className="bd-loan-tag">ÚVĚR</span>}
                                            {isSubscription && <span className="bd-loan-tag">PŘEDPLATNÉ</span>}
                                        </span>
                                        <span className="recurring-date">{dueLabel(expense)}</span>
                                        <span className="num recurring-amount">{amountLabel}</span>
                                        <span className={`recurring-status ${expense.is_paid ? 'paid' : 'pending'}`}>
                                            {expense.is_paid ? 'Zaplaceno' : 'Čekající'}
                                        </span>
                                        <span className="recurring-chevron">›</span>
                                    </button>

                                    <div className="bd-expand">
                                        <div className="bd-expand-inner">
                                            <div className="bd-expand-content">
                                                {isSubscription ? (
                                                    <>
                                                        <div className="bd-field">
                                                            <span className="bd-label">Název</span>
                                                            <div className="bd-readonly">{expense.name}</div>
                                                        </div>
                                                        <div className="bd-cols bd-cols-2">
                                                            <div className="bd-field">
                                                                <span className="bd-label">Částka za období</span>
                                                                <div className="bd-readonly num">{formatCurrency(expense.amount)}</div>
                                                            </div>
                                                            <div className="bd-field">
                                                                <span className="bd-label">Moje část</span>
                                                                <div className="bd-readonly bd-readonly-accent num">{formatCurrency(expense.my_amount)}</div>
                                                            </div>
                                                        </div>
                                                        <div className="bd-actions">
                                                            <span className="bd-note"><span className="bd-note-icon">ⓘ</span> {expense.is_paid ? 'Spárováno s platbou — zaplaceno' : 'Označí se samo, jakmile se platba napáruje'} · spravuje se na stránce Předplatné</span>
                                                            <div className="bd-actions-right">
                                                                <Link href="/subscriptions" className="bd-link">Otevřít Předplatné ›</Link>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : isLoan ? (
                                                    <>
                                                        <div className="bd-field">
                                                            <span className="bd-label">Název</span>
                                                            <div className="bd-readonly">{expense.name}</div>
                                                        </div>
                                                        <div className="bd-cols bd-cols-2">
                                                            <div className="bd-field">
                                                                <span className="bd-label">Měsíční splátka</span>
                                                                <div className="bd-readonly bd-readonly-accent num">{formatCurrency(expense.amount)}</div>
                                                            </div>
                                                            <div className="bd-field">
                                                                <span className="bd-label">Spravováno v</span>
                                                                <div className="bd-readonly">Úvěry</div>
                                                            </div>
                                                        </div>
                                                        <div className="bd-actions">
                                                            <span className="bd-note"><span className="bd-note-icon">ⓘ</span> Splátka úvěru — spravuje se na stránce Úvěry</span>
                                                            <div className="bd-actions-right">
                                                                <Link href="/loans" className="bd-link">Otevřít Úvěry ›</Link>
                                                                <button
                                                                    className="btn btn-sm btn-primary"
                                                                    disabled={expense.loan_id == null || expense.loan_payment_id == null}
                                                                    onClick={() => expense.loan_id != null && expense.loan_payment_id != null && toggleLoanPaid(expense.loan_id, expense.loan_payment_id, expense.is_paid)}
                                                                >
                                                                    {expense.is_paid ? 'Označit čekající' : 'Zaplatit'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="bd-field">
                                                            <span className="bd-label">Název</span>
                                                            <input
                                                                value={editingExpenseNames[expense.id] ?? expense.name}
                                                                onChange={(e) => setEditingExpenseNames(p => ({ ...p, [expense.id]: e.target.value }))}
                                                                onBlur={() => saveExpenseName(expense)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                                className="input bd-input"
                                                            />
                                                        </div>
                                                        <div className="bd-cols bd-cols-4">
                                                            <div className="bd-field">
                                                                <span className="bd-label">Podíl</span>
                                                                <CustomSelect
                                                                    compact
                                                                    triggerStyle={{ height: 44, minHeight: 44, borderRadius: 'var(--radius-full)', padding: '0 16px', fontSize: 14 }}
                                                                    value={expense.my_amount_override !== null ? 'custom' : (expense.my_percentage === 100 ? '100' : expense.my_percentage === 50 ? '50' : 'custom')}
                                                                    onChange={(val) => {
                                                                        if (val === '100') updateExpensePercentage(expense.id, 100);
                                                                        else if (val === '50') updateExpensePercentage(expense.id, 50);
                                                                        else {
                                                                            setEditingMyAmounts(p => ({ ...p, [expense.id]: String(Math.round(expense.my_amount)) }));
                                                                            if (expense.my_amount_override === null) saveCustomOverride(expense.id, Math.round(expense.my_amount));
                                                                        }
                                                                    }}
                                                                    options={[{ value: '100', label: '100%' }, { value: '50', label: '50%' }, { value: 'custom', label: 'Vlastní' }]}
                                                                />
                                                            </div>
                                                            <div className="bd-field">
                                                                <span className="bd-label">Částka</span>
                                                                <input type="number" className="input bd-input bd-input-num"
                                                                    value={editingAmounts[expense.id] ?? expense.amount}
                                                                    onChange={(e) => setEditingAmounts(p => ({ ...p, [expense.id]: e.target.value }))}
                                                                    onBlur={() => saveExpenseAmount(expense)}
                                                                />
                                                            </div>
                                                            <div className="bd-field">
                                                                <span className="bd-label">K platbě</span>
                                                                {(expense.my_percentage < 100 || expense.my_amount_override !== null) ? (
                                                                    <input type="number" className="input bd-input bd-input-num bd-input-accent"
                                                                        value={editingMyAmounts[expense.id] ?? Math.round(expense.my_amount)}
                                                                        onChange={(e) => setEditingMyAmounts(p => ({ ...p, [expense.id]: e.target.value }))}
                                                                        onBlur={() => saveMyAmount(expense)}
                                                                    />
                                                                ) : (
                                                                    <div className="bd-readonly bd-readonly-accent num">{formatCurrency(expense.my_amount)}</div>
                                                                )}
                                                            </div>
                                                            <div className="bd-field">
                                                                <span className="bd-label">Splatnost (den)</span>
                                                                {expense.recurring_expense_id ? (
                                                                    <input type="number" min={1} max={31} placeholder="—"
                                                                        className="input bd-input bd-input-num"
                                                                        value={editingDueDays[expense.id] ?? (expense.due_day ?? '')}
                                                                        onChange={(e) => setEditingDueDays(p => ({ ...p, [expense.id]: e.target.value }))}
                                                                        onBlur={() => saveDueDay(expense)}
                                                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                                    />
                                                                ) : (
                                                                    <div className="bd-readonly num">—</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="bd-actions">
                                                            <div className="bd-segment" role="group">
                                                                <button
                                                                    type="button"
                                                                    className={`bd-seg ${expense.is_paid ? 'active paid' : ''}`}
                                                                    onClick={() => { if (!expense.is_paid) toggleExpensePaid(expense.id, expense.is_paid); }}
                                                                >
                                                                    Zaplaceno
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`bd-seg ${!expense.is_paid ? 'active pending' : ''}`}
                                                                    onClick={() => { if (expense.is_paid) toggleExpensePaid(expense.id, expense.is_paid); }}
                                                                >
                                                                    Čekající
                                                                </button>
                                                            </div>
                                                            <button onClick={() => deleteMonthlyExpense(expense.id)} className="bd-delete">
                                                                {getLineIcon('delete', 14)} Smazat
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Expense chart */}
            {(budget?.expenses.length ?? 0) > 0 && (() => {
                const sorted = [...(budget!.expenses)].sort((a, b) => b.my_amount - a.my_amount);
                const maxAmt = sorted[0]?.my_amount || 1;
                return (
                    <div className="surface budget-category-panel">
                        <div className="card-head">
                            <h3>Struktura pravidelných výdajů</h3>
                            <span className="muted small">podíl z měsíce</span>
                        </div>
                        <div className="card-body budget-expense-structure-body">
                            {sorted.map(exp => {
                                const pct = Math.round((exp.my_amount / totalExpenses) * 100);
                                return (
                                    <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: exp.is_paid ? 'var(--pos)' : exp.is_auto_paid ? 'color-mix(in srgb, var(--pos) 40%, transparent)' : 'var(--border-strong)' }} />
                                        <span style={{ fontSize: '0.78rem', width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{exp.name}</span>
                                        <div className="progress" style={{ flex: 1 }}>
                                            <span style={{ width: `${Math.round((exp.my_amount / maxAmt) * 100)}%`, background: exp.is_paid ? 'var(--pos)' : 'var(--accent)' }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', width: 30, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', width: 72, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(exp.my_amount)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}
        </div>
    );

    const renderIncome = () => (
        <section className="budget-plan-section">
            <div className="budget-plan-section-head">
                <h3>{getLineIcon('income', 16)} Příjmy</h3>
                <button className="btn btn-sm" onClick={syncIncome}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{getLineIcon('refresh', 14)} Načíst</span></button>
            </div>
            <div className="plan-rows">
                {(budget?.income_items || []).map(item => (
                    <div key={item.id} className="plan-row">
                        <input className="plan-input" value={editingIncomeNames[item.id] ?? item.name}
                            onChange={(e) => setEditingIncomeNames(p => ({ ...p, [item.id]: e.target.value }))}
                            onBlur={() => commitIncomeName(item)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        />
                        <button onClick={() => deleteIncomeItem(item.id)} className="plan-row-delete" aria-label="Smazat příjem">{getLineIcon('delete', 14)}</button>
                        <input type="number" className="plan-input plan-amount" placeholder="0"
                            value={editingIncomeAmounts[item.id] ?? (item.amount === 0 ? '' : String(item.amount))}
                            onChange={(e) => setEditingIncomeAmounts(p => ({ ...p, [item.id]: e.target.value }))}
                            onBlur={() => commitIncomeAmount(item)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        />
                    </div>
                ))}
                <button className="plan-add-btn" onClick={addIncomeItem}>{getLineIcon('add', 13)} Přidat příjem</button>
            </div>
            <div>
                <div className="plan-total-row">
                    <span>Celkem</span>
                    <span className="plan-total-amount">{formatCurrency(totalIncome)}</span>
                </div>
                {prevMonthIncome > 0 && totalIncome > 0 && (
                    <div className="plan-delta" style={{ color: incomeDelta >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                        {incomeDelta >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(incomeDelta))} oproti minulému měsíci
                    </div>
                )}
            </div>
        </section>
    );

    const renderSurplus = () => (
        <section className="budget-plan-section">
            <div className="budget-plan-section-head"><h3>{getLineIcon('savings', 16)} Přebytek & Spoření</h3></div>
            <div className="plan-rows">
                <div className="plan-row">
                    <span className="plan-label">Investice</span>
                    <span className="plan-row-spacer" />
                    <input type="number" className="plan-input plan-amount" placeholder="0"
                        value={editingBudgetFields['investment_amount'] ?? ((budget?.investment_amount || 0) === 0 ? '' : String(budget?.investment_amount))}
                        onChange={(e) => setEditingBudgetFields(p => ({ ...p, investment_amount: e.target.value }))}
                        onBlur={() => commitBudgetField('investment_amount', budget?.investment_amount || 0)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                </div>
                <div className="plan-row">
                    <span className="plan-label">Spořící účet</span>
                    <span className="plan-row-spacer" />
                    <input type="number" className="plan-input plan-amount" placeholder="0"
                        value={editingBudgetFields['surplus_to_savings'] ?? ((budget?.surplus_to_savings || 0) === 0 ? '' : String(budget?.surplus_to_savings))}
                        onChange={(e) => setEditingBudgetFields(p => ({ ...p, surplus_to_savings: e.target.value }))}
                        onBlur={() => commitBudgetField('surplus_to_savings', budget?.surplus_to_savings || 0)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                </div>
            </div>
            <div className="plan-rows" style={{ gap: 12 }}>
                {totalIncome > 0 && (
                    <div className="budget-savings-rate-card" style={{ padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
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
                {isOverBudget && (
                    <div style={{ color: 'var(--neg)', fontSize: 12 }}>
                        {Icons.status.overBudget} Rozpočet je přečerpaný o {formatCurrency(Math.abs(remaining))}.
                    </div>
                )}
            </div>
        </section>
    );

    const renderAccounts = () => (
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
                                    <button className="btn btn-primary btn-sm" onClick={() => updateManualAccountBalance(account.id)} aria-label="Uložit">{getLineIcon('check', 15)}</button>
                                    <button className="btn btn-sm" onClick={() => setEditingAccountId(null)}>×</button>
                                </div>
                            ) : (
                                <span onClick={() => { setEditingAccountId(account.id); setEditAccountBalance(String(account.balance)); }}
                                    style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCurrency(account.balance)} <span style={{ color: 'var(--text)', display: 'inline-flex' }}>{getLineIcon('edit', 13)}</span>
                                </span>
                            )}
                        </div>
                        {Array.isArray(account.envelopes) && account.envelopes.length > 0 && (
                            <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Obálky</div>
                                {account.envelopes.map(env => (
                                    <div key={env.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 3 }}>
                                        <span style={{ color: 'var(--text-2)' }}>{env.is_mine ? Icons.envelope.mine : Icons.envelope.shared} {env.name}</span>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span style={{ color: env.is_mine ? 'var(--pos)' : 'var(--warn)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                                                {env.is_mine ? '' : '−'}{formatCurrency(env.amount)}
                                            </span>
                                            <button onClick={() => deleteAccountItem(account.id, env.id)} className="btn btn-icon btn-ghost btn-sm" style={{ opacity: 0.55, color: 'var(--text)' }} aria-label="Smazat obálku">{getLineIcon('delete', 14)}</button>
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
                                    <button className="btn btn-primary btn-sm" onClick={() => addAccountItem(account.id)} aria-label="Přidat">{getLineIcon('check', 15)}</button>
                                    <button className="btn btn-sm" onClick={() => setShowAddItem(null)}>×</button>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={newItem.is_mine} onChange={(e) => setNewItem({ ...newItem, is_mine: e.target.checked })} />
                                    Volné (moje peníze)
                                </label>
                            </div>
                        ) : (
                            <button onClick={() => setShowAddItem(account.id)} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>+ Přidat obálku</button>
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

    // ── annual view ───────────────────────────────────────────────
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
            if (!previous || previous === 0) return null;
            const d = ((current - previous) / Math.abs(previous)) * 100;
            if (Math.abs(d) < 0.5) return null;
            const good = invert ? d < 0 : d > 0;
            return <span style={{ fontSize: 11, color: good ? 'var(--pos)' : 'var(--neg)', fontWeight: 600, marginLeft: 6 }}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%</span>;
        };
        let runNet = 0;
        const cumNet = annualData.months.map(m => { runNet += m.income - m.expenses; return runNet; });
        const cumMax = Math.max(...cumNet, 0); const cumMin = Math.min(...cumNet, 0); const cumRange = cumMax - cumMin || 1;
        const mwn = activeMonths.map(m => ({ ...m, net: m.income - m.expenses, sr: m.income > 0 ? (m.investments / m.income) * 100 : 0 }));
        const best = mwn.length ? mwn.reduce((a, b) => a.net > b.net ? a : b) : null;
        const worst = mwn.length ? mwn.reduce((a, b) => a.net < b.net ? a : b) : null;
        const avgSR = annualData.totals.income > 0 ? (annualData.totals.investments / annualData.totals.income) * 100 : 0;
        const sparkW = 280; const sparkH = 44;
        const maxSR = Math.max(...annualData.months.map(m => m.income > 0 ? (m.investments / m.income) * 100 : 0), 10);
        const pts = annualData.months.map((m, i) => ({ x: (i / 11) * sparkW, y: sparkH - ((m.income > 0 ? (m.investments / m.income) * 100 : 0) / maxSR) * sparkH, ok: m.income > 0 }));
        const sparkPath = pts.filter(p => p.ok).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-md)' }}>
                    {[
                        { label: 'Příjmy', value: annualData.totals.income, prev: prev?.income, color: 'var(--pos)', avg: annualData.averages.income },
                        { label: 'Výdaje', value: annualData.totals.expenses, prev: prev?.expenses, color: 'var(--neg)', avg: annualData.averages.expenses, invert: true },
                        { label: 'Investice', value: annualData.totals.investments, prev: prev?.investments, color: 'var(--accent)', avg: annualData.averages.investments },
                        { label: 'Čistý zisk', value: annualData.totals.net, prev: prev?.net, color: annualData.totals.net >= 0 ? 'var(--pos)' : 'var(--neg)' },
                    ].map(it => (
                        <div key={it.label} className="surface kpi">
                            <div className="kpi-label">{it.label}</div>
                            <div className="kpi-value num" style={{ color: it.color, fontSize: 20 }}>{formatCurrency(it.value)}{renderDelta(it.value, it.prev, it.invert)}</div>
                            {it.avg !== undefined && <div className="kpi-sub">⌀ {formatCurrency(it.avg)}/měs</div>}
                        </div>
                    ))}
                </div>
                <div className="surface">
                    <div className="card-head"><h3>{Icons.section.monthlyOverview} Měsíční přehled {selectedYear}</h3></div>
                    <div className="card-body">
                        <div style={{ position: 'relative', height: 180 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 180 }}>
                                {annualData.months.map((m, i) => (
                                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }} onClick={() => { setViewMode('month'); setSelectedMonth(m.month); }}>
                                        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 160 }}>
                                            <div style={{ width: 10, height: maxValue > 0 ? `${(m.income / maxValue) * 100}%` : '0%', background: 'var(--pos)', borderRadius: '2px 2px 0 0', minHeight: m.income > 0 ? 4 : 0, transition: 'height 0.3s' }} />
                                            <div style={{ width: 10, height: maxValue > 0 ? `${(m.expenses / maxValue) * 100}%` : '0%', background: 'var(--neg)', borderRadius: '2px 2px 0 0', minHeight: m.expenses > 0 ? 4 : 0, opacity: m.expenses > m.income ? 1 : 0.7, transition: 'height 0.3s' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>{MONTH_NAMES[i].substring(0, 3)}</span>
                                    </div>
                                ))}
                            </div>
                            {activeMonths.length > 0 && (
                                <svg viewBox="0 0 100 160" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 160, pointerEvents: 'none' }}>
                                    <polyline points={cumNet.map((v, i) => `${(i / 11) * 100},${(160 - ((v - cumMin) / cumRange) * 160).toFixed(2)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeDasharray="4 3" />
                                </svg>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--pos)', borderRadius: 2, marginRight: 4 }} />Příjmy</span>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--neg)', borderRadius: 2, marginRight: 4 }} />Výdaje</span>
                            <span><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--accent)', marginRight: 4, verticalAlign: 'middle' }} />Kum. čistý</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>Klikni na měsíc pro detail</div>
                    </div>
                </div>
                {activeMonths.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-md)' }}>
                        {best && <div className="surface" style={{ padding: 'var(--spacing-md)', background: 'color-mix(in srgb, var(--pos) 6%, var(--surface))' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{Icons.section.bestWorst} Nejlepší měsíc</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--pos)' }}>{MONTH_NAMES[best.month - 1]}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatCurrency(best.net)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>úspor. {best.sr.toFixed(0)}%</div>
                        </div>}
                        {worst && worst.month !== best?.month && <div className="surface" style={{ padding: 'var(--spacing-md)', background: 'color-mix(in srgb, var(--neg) 6%, var(--surface))' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{Icons.section.trend} Nejhorší měsíc</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neg)' }}>{MONTH_NAMES[worst.month - 1]}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatCurrency(worst.net)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>úspor. {worst.sr.toFixed(0)}%</div>
                        </div>}
                        <div className="surface" style={{ padding: 'var(--spacing-md)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Trend úspor. sazby</div>
                            <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" style={{ marginTop: 6 }}>
                                {sparkPath && <path d={sparkPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                                {pts.filter(p => p.ok).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--accent)" />)}
                            </svg>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 2 }}>⌀ {avgSR.toFixed(0)}% za rok</div>
                        </div>
                    </div>
                )}
                <div className="surface">
                    <div className="card-head"><h3>{Icons.section.expensesByItem} Výdaje podle položek</h3></div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(annualData.expense_breakdown).sort(([, a], [, b]) => b - a).slice(0, 15).map(([name, amount]) => {
                            const pct = (amount / annualData.totals.expenses) * 100;
                            return (
                                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 140, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{name}</span>
                                    <div className="progress" style={{ flex: 1 }}><span style={{ width: `${pct}%` }} /></div>
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

    return (
        <MainLayout disableScroll={viewMode === 'month' && activeTab === 'expenses'}>
            <div className={`page-container budget-page ${viewMode === 'month' && activeTab === 'expenses' ? 'budget-page-fit' : ''}`} style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>

                {/* ── Header ── */}
                <div className="page-head">
                    <div>
                        <h1>Rozpočet</h1>
                        <div className="sub">
                            {viewMode === 'year' ? `Roční přehled ${selectedYear}` : (isAutoSyncing ? 'Synchronizuji...' : monthSubLabel)}
                        </div>
                    </div>
                    <div className="rozpocet-controls budget-period-controls">
                        <div className="seg" role="group" aria-label="Režim zobrazení">
                            <button type="button" className={`seg-item ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>Měsíc</button>
                            <button type="button" className={`seg-item ${viewMode === 'year' ? 'active' : ''}`} onClick={() => setViewMode('year')}>Rok</button>
                        </div>
                        <PeriodNavigator
                            year={selectedYear} month={selectedMonth} mode={viewMode}
                            onChange={(y, m) => { setSelectedYear(y); setSelectedMonth(m); }}
                            onPickMonth={(y, m) => { setSelectedYear(y); setSelectedMonth(m); setViewMode('month'); }}
                        />
                        {viewMode === 'month' && (
                            <>
                                <button className="btn btn-sm btn-primary" onClick={matchTransactions}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{getLineIcon('bolt', 14)} Auto-plán</span>
                                </button>
                                <button className="btn btn-sm btn-icon" onClick={deleteBudgetMonth} style={{ color: 'var(--text)' }} aria-label="Smazat měsíc">
                                    {getLineIcon('delete', 16)}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Hero card ── */}
                {viewMode === 'month' && (
                    <div className="surface budget-hero">
                        <div className="budget-hero-metrics">
                            <div className="budget-metric budget-metric-wide">
                                <div className="kpi-label">Utraceno z rozpočtu</div>
                                <div className="kpi-value num">
                                    {formatCurrency(totalExpenses)}
                                    <span style={{ fontSize: 16, color: 'var(--text-3)', fontWeight: 450 }}> / {formatCurrency(budgetLimit)}</span>
                                </div>
                                <div className="progress">
                                    <span style={{
                                        width: `${Math.min(budgetSpentPct, 100)}%`,
                                    background: budgetSpentPct >= 100 ? 'var(--neg)' : 'var(--pos)',
                                    }} />
                                </div>
                            </div>
                            <div className="budget-metric">
                                <div className="kpi-label">Zbývá celkem</div>
                                <div className="kpi-value num" style={{ color: isOverBudget ? 'var(--neg)' : 'var(--text)' }}>{formatCurrency(remaining)}</div>
                            </div>
                            <div className="budget-metric">
                                <div className="kpi-label">Denní tempo</div>
                                <div className="kpi-value num">{formatCurrency(dailyPace)}</div>
                            </div>
                            <div className="budget-metric">
                                <div className="kpi-label">Nevyčerpáno od 1. {selectedMonth}.</div>
                                <div className="kpi-value num">{budgetSpentPct}%</div>
                            </div>
                        </div>
                        <div className="budget-month-ring">
                            <div style={{ position: 'relative' }}>
                                <Ring pct={budgetSpentPct} size={142} />
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <div className="num" style={{ fontSize: 25, fontWeight: 700, lineHeight: 1 }}>{budgetSpentPct}%</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>z měsíce</div>
                                </div>
                            </div>
                            <div className="kpi-sub" style={{ justifyContent: 'center' }}>
                                {formatCurrency(Math.max(remaining, 0))} zbývá
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Tab bar + content ── */}
                {viewMode === 'month' && (
                    <>
                        <div className="seg budget-tabs">
                            {TABS.map(tab => (
                                <div key={tab.key} className={`seg-item ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                                    {tab.label}
                                </div>
                            ))}
                        </div>

                        {activeTab === 'overview'  && renderOverview()}
                        {activeTab === 'expenses'  && renderExpenses()}
                        {activeTab === 'accounts'  && renderAccounts()}
                    </>
                )}

                {viewMode === 'year' && renderAnnualOverview()}

            </div>
        </MainLayout>
    );
}
