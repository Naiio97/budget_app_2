'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import BudgetBurndown, { BudgetPaceLabel } from '@/components/BudgetBurndown';
import {
    Budget, SavingsGoal, BudgetCategoryOption,
    getBudgets, createBudget, deleteBudget, getBudgetCategoryOptions,
    getGoals, createGoal, updateGoal, deleteGoal
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
    const totalProjectedPct = totalBudget > 0 ? (totalProjected / totalBudget) * 100 : 0;

    const now = new Date();
    const monthName = now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

    return (
        <MainLayout>
            <div className="page-container" style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>

                <div className="page-head">
                    <div>
                        <h1>Rozpočty</h1>
                        <div className="sub">{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</div>
                    </div>
                </div>

                {/* Tabs — rozpočty podle kategorií vs. spořící cíle na samostatných záložkách */}
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                    {([['budgets', 'Rozpočty'], ['goals', 'Spořící cíle']] as [Tab, string][]).map(([val, label]) => (
                        <div key={val} className={`seg-item ${tab === val ? 'active' : ''}`} onClick={() => setTab(val)}>
                            {label}
                        </div>
                    ))}
                </div>

                {tab === 'budgets' && (<>
                {/* Total overview KPI */}
                <div className="surface kpi">
                    <div className="kpi-label">Celkem utraceno tento měsíc</div>
                    <div className="kpi-value num">
                        <span style={{ color: progressColor(totalPct) }}>{formatCurrency(totalSpent)}</span>
                        <span style={{ fontSize: 16, color: 'var(--text-3)', fontWeight: 400 }}> / {formatCurrency(totalBudget)}</span>
                    </div>
                    <div className="kpi-sub" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                        <div className="progress">
                            <span style={{ width: `${Math.min(totalPct, 100)}%`, background: progressColor(totalPct) }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <span>{totalPct.toFixed(0)}% vyčerpáno</span>
                            {totalProjected > 0 && (
                                <span style={{ color: progressColor(totalProjectedPct) }}>
                                    Tímhle tempem: ~{formatCurrency(totalProjected)}
                                    {totalProjected > totalBudget && ` (překročení o ${formatCurrency(totalProjected - totalBudget)})`}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Budget categories */}
                <div className="surface">
                    <div className="card-head">
                        <h3>{Icons.nav.budgets} Rozpočty</h3>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowBudgetForm(!showBudgetForm)}>
                            + Přidat
                        </button>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {showBudgetForm && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 'var(--spacing-md)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
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
                        )}

                        {budgets.length === 0 ? (
                            <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Zatím žádné rozpočty. Přidejte první!</p>
                        ) : (
                            budgets.map(budget => (
                                <div key={budget.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 'var(--spacing-md)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{iconFor(budget.categories[0] ?? budget.category)} {budget.name}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>
                                                {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                                            </span>
                                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => deleteBudgetMutation.mutate(budget.id)}>{Icons.action.delete}</button>
                                        </div>
                                    </div>
                                    {budget.categories.length > 1 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {budget.categories.map(cat => (
                                                <span key={cat} className="chip" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    {iconFor(cat, 11)} {cat}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="progress">
                                        <span style={{ width: `${Math.min(budget.percentage, 100)}%`, background: progressColor(budget.percentage) }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                        <BudgetPaceLabel budget={budget} />
                                        <div style={{ fontSize: 12, color: progressColor(budget.percentage), textAlign: 'right', marginLeft: 'auto' }}>
                                            {budget.percentage.toFixed(0)}%
                                            {budget.percentage >= 100 && ` ${Icons.status.overBudget} Překročeno`}
                                            {budget.percentage >= 80 && budget.percentage < 100 && ` ${Icons.status.nearLimit} Blízko limitu`}
                                        </div>
                                    </div>
                                    <BudgetBurndown budget={budget} />
                                </div>
                            ))
                        )}
                    </div>
                </div>
                </>)}

                {/* Savings goals */}
                {tab === 'goals' && (
                <div className="surface">
                    <div className="card-head">
                        <h3>{Icons.section.savingsGoals} Spořící cíle</h3>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowGoalForm(!showGoalForm)}>+ Přidat</button>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
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
                                    background: goal.is_completed ? 'color-mix(in srgb, var(--pos) 6%, var(--surface-sunken))' : 'var(--surface-sunken)',
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
                                        {goal.is_completed && ` ${Icons.status.done} Splněno!`}
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
