'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import BudgetBurndown, { BudgetPaceLabel } from '@/components/BudgetBurndown';
import BudgetTransactions from '@/components/BudgetTransactions';
import AccountsCard from '@/components/AccountsCard';
import {
    Budget, SavingsGoal, BudgetCategoryOption,
    getBudgets, createBudget, deleteBudget, getBudgetCategoryOptions,
    getGoals, createGoal, updateGoal, deleteGoal, getDashboard
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import { getCategoryIcon as rawCategoryIcon } from '@/lib/category-icons';

function progressColor(pct: number): string {
    if (pct >= 100) return 'var(--neg)';
    if (pct >= 80) return 'var(--warn)';
    return 'var(--pos)';
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

type Tab = 'budgets' | 'goals';

export default function BudgetsPage() {
    const queryClient = useQueryClient();

    const [tab, setTab] = useState<Tab>('budgets');
    const [showBudgetForm, setShowBudgetForm] = useState(false);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [newBudget, setNewBudget] = useState<{ name: string; categories: string[]; amount: string }>({ name: '', categories: [], amount: '' });
    const [newGoal, setNewGoal] = useState({ name: '', target_amount: '', deadline: '' });
    const [addAmountGoalId, setAddAmountGoalId] = useState<number | null>(null);
    const [addAmount, setAddAmount] = useState('');

    const { data: budgets = [] } = useQuery<Budget[]>({ queryKey: queryKeys.budgets, queryFn: getBudgets });
    const { data: goals = [] } = useQuery<SavingsGoal[]>({ queryKey: queryKeys.goals, queryFn: getGoals });
    const { data: categoryOptions = [] } = useQuery<BudgetCategoryOption[]>({
        queryKey: ['budget-category-options'],
        queryFn: getBudgetCategoryOptions,
        staleTime: 5 * 60_000,
    });

    // Ikona kategorie podle reálného záznamu z DB (fallback box)
    const iconFor = (categoryName: string, size = 15) =>
        rawCategoryIcon(categoryOptions.find(c => c.name === categoryName)?.icon, size);

    const toggleNewCategory = (name: string) => setNewBudget(prev => ({
        ...prev,
        categories: prev.categories.includes(name)
            ? prev.categories.filter(c => c !== name)
            : [...prev.categories, name],
    }));

    const invalidateBudgets = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets });
        queryClient.invalidateQueries({ queryKey: queryKeys.budgetOverview });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    };

    const createBudgetMutation = useMutation({
        mutationFn: (data: { name?: string; categories: string[]; amount: number }) => createBudget(data),
        onSuccess: () => { invalidateBudgets(); setNewBudget({ name: '', categories: [], amount: '' }); setShowBudgetForm(false); },
    });
    const deleteBudgetMutation = useMutation({ mutationFn: (id: number) => deleteBudget(id), onSuccess: invalidateBudgets });
    const createGoalMutation = useMutation({
        mutationFn: (data: { name: string; target_amount: number; deadline?: string }) => createGoal(data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.goals }); setNewGoal({ name: '', target_amount: '', deadline: '' }); setShowGoalForm(false); },
    });
    const addToGoalMutation = useMutation({
        mutationFn: ({ goalId, amount }: { goalId: number; amount: number }) => updateGoal(goalId, { add_amount: amount }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.goals }); setAddAmountGoalId(null); setAddAmount(''); },
    });
    const deleteGoalMutation = useMutation({
        mutationFn: (id: number) => deleteGoal(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
    });

    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const totalProjected = budgets.reduce((sum, b) => sum + b.projected, 0);

    const now = new Date();
    const monthLabel = (() => {
        const m = now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
        return m.charAt(0).toUpperCase() + m.slice(1);
    })();

    const { data: dashData } = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => getDashboard() });
    const accounts = dashData?.accounts ?? [];

    const remainingTotal = Math.max(totalBudget - totalSpent, 0);
    const daysInMonth = budgets[0]?.days_in_month ?? 0;
    const daysElapsed = budgets[0]?.days_elapsed ?? 0;
    const daysLeft = Math.max(daysInMonth - daysElapsed, 0);
    const dailyAllowance = daysLeft > 0 ? Math.round(remainingTotal / daysLeft) : remainingTotal;
    const overPace = totalProjected > totalBudget && totalBudget > 0;

    return (
        <MainLayout>
            <div className="page-container dash">

                <div className="page-head">
                    <div>
                        <h1>Rozpočty</h1>
                        <div className="sub">Nastavte si limity a sledujte, jak se jim držíte.</div>
                    </div>
                    <div className="tx-head-actions">
                        <span className="bud-month">{monthLabel}</span>
                        {tab === 'budgets' && (
                            <button className="btn btn-primary" onClick={() => setShowBudgetForm(!showBudgetForm)}>
                                + Nový rozpočet
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs — rozpočty podle kategorií vs. spořící cíle na samostatných záložkách */}
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                    {([['budgets', 'Rozpočty'], ['goals', 'Spořicí cíle']] as [Tab, string][]).map(([val, label]) => (
                        <div key={val} className={`seg-item ${tab === val ? 'active' : ''}`} onClick={() => setTab(val)}>
                            {label}
                        </div>
                    ))}
                </div>

                {tab === 'budgets' && (<>
                {/* Souhrn */}
                <div className="bud-kpis">
                    <div className="dash-card dash-kpi">
                        <div className="dash-kpi-top"><span>Utraceno v rozpočtech</span></div>
                        <div className="dash-kpi-value num">{formatCurrency(totalSpent)}</div>
                        <div className="dash-kpi-sub">{monthLabel}</div>
                    </div>
                    <div className="dash-card dash-kpi">
                        <div className="dash-kpi-top"><span>Celkový rozpočtový limit</span></div>
                        <div className="dash-kpi-value num">{formatCurrency(totalBudget)}</div>
                        <div className="dash-kpi-sub">{budgets.length} {budgets.length === 1 ? 'rozpočet' : budgets.length >= 2 && budgets.length <= 4 ? 'rozpočty' : 'rozpočtů'}</div>
                    </div>
                    <div className="dash-card dash-kpi">
                        <div className="dash-kpi-top"><span>{totalSpent > totalBudget ? 'Překročeno o' : 'Zbývá k útratě'}</span></div>
                        <div className={`dash-kpi-value num ${totalSpent > totalBudget ? 'neg' : ''}`}>
                            {formatCurrency(totalSpent > totalBudget ? totalSpent - totalBudget : remainingTotal)}
                        </div>
                        <div className="dash-kpi-sub">{totalPct.toFixed(0)} % limitů vyčerpáno</div>
                    </div>
                </div>

                {showBudgetForm && (
                    <div className="dash-card">
                        <div className="dash-card-head"><h3>Nový rozpočet</h3></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input
                                type="text"
                                className="input"
                                placeholder="Název (nepovinné, např. Běžný život)"
                                value={newBudget.name}
                                onChange={(e) => setNewBudget({ ...newBudget, name: e.target.value })}
                            />
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
                                    Kategorie {newBudget.categories.length > 1 && `(${newBudget.categories.length} — sloučí se do jednoho limitu)`}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {categoryOptions.map(cat => {
                                        const active = newBudget.categories.includes(cat.name);
                                        return (
                                            <button key={cat.name} type="button"
                                                onClick={() => toggleNewCategory(cat.name)}
                                                className={`chip ${active ? 'chip-accent' : ''}`}
                                                style={{ cursor: 'pointer', border: active ? 'none' : '0.5px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                {iconFor(cat.name, 13)} {cat.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="Limit (Kč)"
                                    value={newBudget.amount}
                                    onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
                                    style={{ width: 150 }}
                                />
                                <button className="btn btn-primary"
                                    onClick={() => createBudgetMutation.mutate({ name: newBudget.name.trim() || undefined, categories: newBudget.categories, amount: parseFloat(newBudget.amount) })}
                                    disabled={createBudgetMutation.isPending || newBudget.categories.length === 0 || !newBudget.amount}>
                                    Uložit
                                </button>
                                <button className="btn" onClick={() => setShowBudgetForm(false)}>Zrušit</button>
                            </div>
                            {createBudgetMutation.isError && (
                                <span style={{ fontSize: 12, color: 'var(--neg)' }}>{(createBudgetMutation.error as Error).message}</span>
                            )}
                        </div>
                    </div>
                )}

                <div className="bud-layout">
                    <div className="bud-list">
                        {budgets.length === 0 ? (
                            <div className="dash-card"><div className="dash-empty">Zatím žádné rozpočty. Přidejte první!</div></div>
                        ) : budgets.map(budget => {
                            const left = budget.amount - budget.spent;
                            const status = budget.percentage >= 100 ? 'neg' : budget.percentage >= 80 ? 'warn' : 'pos';
                            return (
                                <div key={budget.id} className="dash-card bud-card">
                                    <div className="bud-card-head">
                                        <span className="bud-icon">{iconFor(budget.categories[0] ?? budget.category, 22)}</span>
                                        <div className="bud-title">
                                            <h3>{budget.name || budget.category}</h3>
                                            <span>Měsíční rozpočet · {monthLabel}</span>
                                        </div>
                                        <button className="btn btn-icon btn-ghost btn-sm" aria-label="Smazat rozpočet"
                                            onClick={() => deleteBudgetMutation.mutate(budget.id)}>{Icons.action.delete}</button>
                                    </div>

                                    <div className="bud-chips">
                                        {budget.categories.map(cat => (
                                            <span key={cat} className="chip">{iconFor(cat, 12)} {cat}</span>
                                        ))}
                                    </div>

                                    <div className="bud-amount-row">
                                        <div className="bud-amount num">
                                            {formatCurrency(budget.spent)}
                                            <span> / {formatCurrency(budget.amount)}</span>
                                        </div>
                                        <span className={`dash-badge ${status}`}>
                                            {status === 'pos' ? '✓ V limitu' : status === 'warn' ? 'Blízko limitu' : 'Překročeno'}
                                        </span>
                                    </div>

                                    <div className="bud-bar"><span style={{ width: `${Math.min(budget.percentage, 100)}%`, background: progressColor(budget.percentage) }} /></div>
                                    <div className="bud-bar-meta">
                                        <span>{budget.percentage.toFixed(0)} % vyčerpáno</span>
                                        <span style={{ color: left < 0 ? 'var(--neg)' : 'var(--pos)' }}>
                                            {left < 0 ? `Překročeno o ${formatCurrency(-left)}` : `Zbývá ${formatCurrency(left)}`}
                                        </span>
                                    </div>

                                    <div className="bud-tip"><BudgetPaceLabel budget={budget} /></div>

                                    <BudgetBurndown budget={budget} />

                                    <BudgetTransactions budget={budget} />
                                </div>
                            );
                        })}
                    </div>

                    <aside className="bud-aside">
                        {budgets.length > 0 && (
                            <div className="dash-card bud-pace">
                                <div className="dash-card-head"><h3>{overPace ? 'Pozor na tempo' : 'Váš plán drží tempo'}</h3></div>
                                <p>
                                    {overPace
                                        ? <>Tímto tempem skončíte měsíc na ~{formatCurrency(totalProjected)} a limity překročíte o {formatCurrency(totalProjected - totalBudget)}.</>
                                        : <>Tímto tempem skončíte měsíc na ~{formatCurrency(totalProjected)} z celkového limitu {formatCurrency(totalBudget)}.</>}
                                </p>
                                <div className="bud-pace-row">
                                    <span>Můžete utratit denně</span>
                                    <strong className="num">{formatCurrency(dailyAllowance)}</strong>
                                </div>
                                <div className="bud-pace-note">zbývá {daysLeft} {daysLeft === 1 ? 'den' : daysLeft >= 2 && daysLeft <= 4 ? 'dny' : 'dní'} do konce měsíce</div>
                            </div>
                        )}
                        <AccountsCard accounts={accounts} />
                    </aside>
                </div>
                </>)}

                {/* Savings goals */}
                {tab === 'goals' && (
                <div className="dash-card">
                    <div className="dash-card-head">
                        <h3>{Icons.section.savingsGoals} Spořicí cíle</h3>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowGoalForm(!showGoalForm)}>+ Přidat</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {showGoalForm && (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: 'var(--spacing-md)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
                                <input type="text" className="input" placeholder="Název cíle (např. Dovolená)" value={newGoal.name} onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })} style={{ flex: '1 1 200px' }} />
                                <input type="number" className="input" placeholder="Cílová částka" value={newGoal.target_amount} onChange={(e) => setNewGoal({ ...newGoal, target_amount: e.target.value })} style={{ width: 160 }} />
                                <input type="date" className="input" value={newGoal.deadline} onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })} style={{ width: 160 }} />
                                <button className="btn btn-primary" onClick={() => createGoalMutation.mutate({ name: newGoal.name, target_amount: parseFloat(newGoal.target_amount), deadline: newGoal.deadline || undefined })} disabled={createGoalMutation.isPending}>
                                    Uložit
                                </button>
                                <button className="btn" onClick={() => setShowGoalForm(false)}>Zrušit</button>
                            </div>
                        )}

                        {goals.length === 0 ? (
                            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Zatím žádné spořící cíle.</p>
                        ) : (
                            goals.map(goal => (
                                <div key={goal.id} style={{
                                    display: 'flex', flexDirection: 'column', gap: 8,
                                    padding: 'var(--spacing-md)',
                                    background: goal.is_completed ? 'color-mix(in srgb, var(--pos) 6%, transparent)' : 'transparent',
                                    borderRadius: 'var(--radius-md)',
                                    border: goal.is_completed ? '0.5px solid color-mix(in srgb, var(--pos) 30%, transparent)' : '0.5px solid var(--border)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ fontWeight: 600, fontSize: 14 }}>
                                                {goal.is_completed ? Icons.section.goalCompleted : Icons.section.savingsGoals} {goal.name}
                                            </span>
                                            {goal.deadline && (
                                                <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>
                                                    do {new Date(goal.deadline).toLocaleDateString('cs-CZ')}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>
                                                {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                                            </span>
                                            {!goal.is_completed && (
                                                <button className="btn btn-sm" onClick={() => setAddAmountGoalId(addAmountGoalId === goal.id ? null : goal.id)}>
                                                    + Přidat
                                                </button>
                                            )}
                                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteGoalMutation.mutate(goal.id)}>{Icons.action.delete}</button>
                                        </div>
                                    </div>

                                    {addAmountGoalId === goal.id && (
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input type="number" className="input" placeholder="Částka (Kč)" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} style={{ width: 140 }} />
                                            <button className="btn btn-primary btn-sm" onClick={() => addToGoalMutation.mutate({ goalId: goal.id, amount: parseFloat(addAmount) })} disabled={addToGoalMutation.isPending}>
                                                Přidat
                                            </button>
                                        </div>
                                    )}

                                    <div className="progress">
                                        <span style={{ width: `${Math.min(goal.percentage, 100)}%`, background: goal.is_completed ? 'var(--pos)' : 'var(--accent)' }} />
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right' }}>
                                        {goal.percentage.toFixed(0)}%
                                        {goal.is_completed && <> {Icons.status.done} Splněno!</>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                )}

            </div>
        </MainLayout>
    );
}
