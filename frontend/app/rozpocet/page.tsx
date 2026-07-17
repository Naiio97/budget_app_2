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
import {
    apiFetch, getCashflowCurrent, Cashflow,
    getSalaryConfig, saveSalaryConfig, getSalaryEstimate,
    uploadSalaryTimesheet, uploadSalaryPayslip, acceptSalaryEstimate,
    SalaryConfig, SalaryEstimate,
} from '@/lib/api';
import AnnualOverview from './AnnualOverview';
import { MONTH_NAMES, formatCurrency, Ring, type Tab, type MonthlyExpense, type IncomeItem, type MonthlyBudget, type RecurringExpense, type ManualAccount, type AnnualData } from './shared';

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

    // Odhad výplaty
    const [salaryCfgEdit, setSalaryCfgEdit] = useState<Record<string, string>>({});
    const [salaryBonus, setSalaryBonus] = useState('');
    const [salaryFile, setSalaryFile] = useState<File | null>(null);
    const [salaryUploading, setSalaryUploading] = useState(false);
    const [salaryError, setSalaryError] = useState<string | null>(null);
    const [salaryReceiptOpen, setSalaryReceiptOpen] = useState(false);
    const [salaryInfo, setSalaryInfo] = useState<string | null>(null);
    const [salaryPayslipUploading, setSalaryPayslipUploading] = useState(false);
    const salaryFileRef = useRef<HTMLInputElement>(null);
    const salaryPayslipRef = useRef<HTMLInputElement>(null);

    const autoSyncedMonths = useRef<Set<string>>(new Set());
    const yearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    // Výplata za měsíc M chodí na účet v M+1 — karta odhadu na stránce měsíce M
    // proto pracuje s timesheetem za M-1 (stejně jako synced příjem „Výplata")
    const salaryWorkDate = new Date(selectedYear, selectedMonth - 2, 1);
    const salaryWorkMonth = `${salaryWorkDate.getFullYear()}-${String(salaryWorkDate.getMonth() + 1).padStart(2, '0')}`;
    const salaryWorkMonthName = MONTH_NAMES[salaryWorkDate.getMonth()];

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

    const { data: salaryConfig } = useQuery<SalaryConfig>({
        queryKey: queryKeys.salaryConfig,
        queryFn: getSalaryConfig,
        enabled: viewMode === 'month',
        staleTime: 5 * 60 * 1000,
    });

    const { data: salaryEstimate } = useQuery<SalaryEstimate | null>({
        queryKey: queryKeys.salaryEstimate(salaryWorkMonth),
        queryFn: () => getSalaryEstimate(salaryWorkMonth),
        enabled: viewMode === 'month',
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
    // Limit na útratu = příjmy minus to, co jde stranou na investice/spoření —
    // odvozeno z `remaining` (ten už obojí odečítá), aby zůstal jeden zdroj pravdy.
    const budgetLimit = Math.max(totalExpenses + remaining, totalExpenses);
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
                    {renderSalaryEstimate()}
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
                                        <span className={`recurring-date${dueLabel(expense) ? '' : ' recurring-date--empty'}`}>{dueLabel(expense)}</span>
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

    // ── odhad výplaty ────────────────────────────────────────────

    // Uloží konfiguraci, pokud jsou vyplněná povinná pole (kvartál je volitelný).
    // Vrací false, když mzda/průměr chybí — volající zobrazí hlášku.
    const commitSalaryConfig = async (): Promise<boolean> => {
        const base = parseFloat(salaryCfgEdit['base_monthly'] ?? String(salaryConfig?.base_monthly ?? ''));
        const prumer = parseFloat(salaryCfgEdit['prumer'] ?? String(salaryConfig?.prumer ?? ''));
        const quarter = (salaryCfgEdit['prumer_quarter'] ?? salaryConfig?.prumer_quarter ?? '').trim();
        if (!Number.isFinite(base) || !Number.isFinite(prumer)) return false;
        await saveSalaryConfig({ base_monthly: base, prumer, prumer_quarter: quarter || null });
        queryClient.invalidateQueries({ queryKey: queryKeys.salaryConfig });
        return true;
    };

    const computeSalaryEstimate = async () => {
        if (!salaryFile) return;
        setSalaryUploading(true);
        setSalaryError(null);
        try {
            // Timesheet od zaměstnavatele má v názvu RRRRMM — pro rozpočet
            // měsíce M patří timesheet za M-1 (výplata chodí měsíc pozadu)
            const m = salaryFile.name.match(/(20\d{2})(0[1-9]|1[0-2])/);
            if (m) {
                const fileYm = `${m[1]}-${m[2]}`;
                if (fileYm !== salaryWorkMonth) {
                    setSalaryError(`Soubor je timesheet za ${fileYm} — ta výplata patří do rozpočtu následujícího měsíce. Přepni měsíc v navigaci nahoře.`);
                    return;
                }
            }
            // Konfigurace se uloží vždy před výpočtem — blur eventy nejsou spolehlivé
            const configOk = await commitSalaryConfig();
            if (!configOk) {
                setSalaryError('Vyplň nejdřív měsíční mzdu a průměr náhrady.');
                return;
            }
            const est = await uploadSalaryTimesheet(salaryWorkMonth, salaryFile, parseFloat(salaryBonus) || 0);
            queryClient.setQueryData(queryKeys.salaryEstimate(salaryWorkMonth), est);
            setSalaryReceiptOpen(true);
        } catch (e) {
            setSalaryError(e instanceof Error ? e.message : 'Nahrání timesheetu selhalo');
        } finally {
            setSalaryUploading(false);
        }
    };

    const uploadPayslip = async (file: File) => {
        setSalaryPayslipUploading(true);
        setSalaryError(null);
        setSalaryInfo(null);
        try {
            const result = await uploadSalaryPayslip(salaryWorkMonth, file);
            queryClient.setQueryData(queryKeys.salaryEstimate(salaryWorkMonth), result);
            if (result.config_updated.prumer || result.config_updated.base) {
                queryClient.invalidateQueries({ queryKey: queryKeys.salaryConfig });
                const parts = [];
                if (result.config_updated.prumer) parts.push(`průměr náhrady → ${result.actual?.prumer}`);
                if (result.config_updated.base) parts.push(`základní mzda → ${result.actual?.base_monthly}`);
                setSalaryInfo(`Konfigurace zkalibrována z výplatnice: ${parts.join(', ')}.`);
            }
        } catch (e) {
            setSalaryError(e instanceof Error ? e.message : 'Nahrání výplatnice selhalo');
        } finally {
            setSalaryPayslipUploading(false);
        }
    };

    const acceptEstimateAsIncome = async () => {
        // Odhad za M-1 se zapíše jako příjem do zobrazeného měsíce M (backend
        // cílí payout_month = work month + 1) — refreshBudget() invaliduje
        // právě zobrazený rozpočet
        await acceptSalaryEstimate(salaryWorkMonth);
        await refreshBudget();
        queryClient.invalidateQueries({ queryKey: queryKeys.salaryEstimate(salaryWorkMonth) });
    };

    const salaryCfgField = (field: 'base_monthly' | 'prumer' | 'prumer_quarter', label: string, numeric: boolean) => (
        <div className="plan-row" key={field}>
            <span className="plan-label">{label}</span>
            <span className="plan-row-spacer" />
            <input type={numeric ? 'number' : 'text'} className="plan-input plan-amount" placeholder={numeric ? '0' : 'RRRR-Q1'}
                value={salaryCfgEdit[field] ?? (salaryConfig?.[field] == null ? '' : String(salaryConfig[field]))}
                onChange={(e) => setSalaryCfgEdit(p => ({ ...p, [field]: e.target.value }))}
                onBlur={commitSalaryConfig}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
        </div>
    );

    const renderSalaryEstimate = () => {
        const b = salaryEstimate?.breakdown;
        const receiptLines: Array<[string, string, number]> = b ? [
            ['Základní mzda', `${Math.round(b.zakladni_hodiny)} h × ${b.hodinova_sazba.toFixed(2)}`, b.zakladni_mzda],
            ['Přesčas všední', '25 %', b.priplatek_prescas_vsedni],
            ['Přesčas SO/NE', '50 %', b.priplatek_prescas_vikend],
            ['Příplatek SO/NE', '50 %', b.priplatek_so_ne],
            ['Práce ve svátek', '100 %', b.priplatek_svatek],
            ['Noční', '10 %', b.priplatek_noc],
            ['Pohotovost', `${Math.round(b.pohotovost_placena_h)} h · 10 %`, b.priplatek_pohotovost],
            ['Dovolená', 'průměr', b.nahrada_dovolena],
            ['Překážky', 'průměr', b.nahrada_prekazky],
            ['Pracovní volno', 'základ', b.nahrada_prac_volno],
            ['Roční bonus', '', b.bonus],
        ].filter((l): l is [string, string, number] => Math.abs(l[2] as number) > 0.5) : [];

        return (
            <section className="budget-plan-section">
                <div className="budget-plan-section-head">
                    <h3>{getLineIcon('income', 16)} Odhad výplaty <span className="muted small" style={{ fontWeight: 400 }}>za {salaryWorkMonthName.toLowerCase()}</span></h3>
                    {salaryEstimate?.is_accepted && <span className="muted small">Přijato ✓</span>}
                </div>
                <div className="plan-rows">
                    {salaryCfgField('base_monthly', 'Měsíční mzda', true)}
                    {salaryCfgField('prumer', 'Průměr náhrady (Kč/h)', true)}
                    {salaryCfgField('prumer_quarter', 'Kvartál průměru', false)}
                </div>
                <div className="plan-rows">
                    <div className="plan-row">
                        <span className="plan-label">Roční bonus (Kč)</span>
                        <span className="plan-row-spacer" />
                        <input type="number" className="plan-input plan-amount" placeholder="0"
                            value={salaryBonus} onChange={(e) => setSalaryBonus(e.target.value)} />
                    </div>
                    <input ref={salaryFileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                        onChange={(e) => { setSalaryFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" onClick={() => salaryFileRef.current?.click()}
                            style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {salaryFile ? salaryFile.name : 'Nahrát timesheet (.xlsx)'}
                        </button>
                        <button className="btn btn-primary btn-sm" disabled={!salaryFile || salaryUploading} onClick={computeSalaryEstimate}>
                            {salaryUploading ? 'Počítám…' : 'Spočítat'}
                        </button>
                        {salaryEstimate && (
                            <>
                                <input ref={salaryPayslipRef} type="file" accept=".pdf" style={{ display: 'none' }}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPayslip(f); e.target.value = ''; }} />
                                <button className="btn btn-sm" disabled={salaryPayslipUploading} onClick={() => salaryPayslipRef.current?.click()}>
                                    {salaryPayslipUploading ? 'Čtu…' : 'Výplatnice (PDF)'}
                                </button>
                            </>
                        )}
                    </div>
                    {salaryError && <div style={{ color: 'var(--neg)', fontSize: 12 }}>{salaryError}</div>}
                    {salaryInfo && <div style={{ color: 'var(--pos)', fontSize: 12 }}>{salaryInfo}</div>}
                </div>
                {salaryEstimate && b && (
                    <div className="plan-rows" style={{ gap: 12 }}>
                        {salaryEstimate.prumer_stale && (
                            <div style={{ color: 'var(--warn)', fontSize: 12 }}>
                                Průměr náhrady je z jiného kvartálu ({salaryConfig?.prumer_quarter}) — po první pásce kvartálu ho aktualizuj.
                            </div>
                        )}
                        <div style={{ padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
                            <button type="button" onClick={() => setSalaryReceiptOpen(o => !o)}
                                style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 13 }}>
                                <span style={{ color: 'var(--text-2)' }}>Na účet ({salaryEstimate.fond_days} prac. dní)</span>
                                <span style={{ fontWeight: 600 }}>{formatCurrency(salaryEstimate.net_to_account)} {salaryReceiptOpen ? '▾' : '▸'}</span>
                            </button>
                            {salaryEstimate.actual_net_to_account !== null && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: '0.5px solid var(--border)' }}>
                                    <span style={{ color: 'var(--text-2)' }}>Realita (výplatnice)</span>
                                    <span>
                                        <span className="num" style={{ fontWeight: 600 }}>{formatCurrency(salaryEstimate.actual_net_to_account)}</span>
                                        <span className="num" style={{ marginLeft: 8, color: Math.abs(salaryEstimate.actual?.delta ?? 0) < 100 ? 'var(--pos)' : 'var(--warn)' }}>
                                            Δ {(salaryEstimate.actual?.delta ?? 0) >= 0 ? '+' : ''}{formatCurrency(salaryEstimate.actual?.delta ?? 0)}
                                        </span>
                                    </span>
                                </div>
                            )}
                            {salaryReceiptOpen && (
                                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                                    {receiptLines.map(([name, meta, val]) => (
                                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-2)' }}>{name}{meta ? <span style={{ color: 'var(--text-3)', marginLeft: 6, fontSize: 11 }}>{meta}</span> : null}</span>
                                            <span className="num">{formatCurrency(val)}</span>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid var(--border)', paddingTop: 6, marginTop: 4, fontWeight: 600 }}>
                                        <span>Hrubá mzda</span><span className="num">{formatCurrency(b.hruba_mzda)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                        <span>Sociální 7,1 %</span><span className="num">−{formatCurrency(b.socialni)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                        <span>Zdravotní 4,5 %</span><span className="num">−{formatCurrency(b.zdravotni)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                        <span>Záloha daně 15 % − sleva</span><span className="num">−{formatCurrency(b.dan)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '0.5px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                                        <span>Čistá mzda</span><span className="num">{formatCurrency(b.cista_mzda)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                        <span>Stravenky {b.hours?.worked_days ?? ''} × 105,75</span><span className="num">−{formatCurrency(b.stravenky)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--pos)', borderTop: '0.5px solid var(--border-strong)', paddingTop: 6, marginTop: 4 }}>
                                        <span>Na účet</span><span className="num">{formatCurrency(salaryEstimate.net_to_account)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {!salaryEstimate.is_accepted && (
                            <button className="btn btn-primary btn-sm" onClick={acceptEstimateAsIncome}>
                                Přijmout jako příjem
                            </button>
                        )}
                    </div>
                )}
            </section>
        );
    };

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

                {viewMode === 'year' && <AnnualOverview data={annualData} year={selectedYear} onOpenMonth={(m) => { setViewMode('month'); setSelectedMonth(m); }} />}

            </div>
        </MainLayout>
    );
}
