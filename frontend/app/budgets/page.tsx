'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import {
    Budget, SavingsGoal,
    getBudgets, createBudget, updateBudget, deleteBudget,
    getGoals, createGoal, updateGoal, deleteGoal,
    getDashboard
} from '@/lib/api';

const CATEGORIES = [
    { value: 'Food', label: '🍕 Jídlo', icon: '🍕' },
    { value: 'Transport', label: '🚗 Doprava', icon: '🚗' },
    { value: 'Utilities', label: '💡 Energie & Služby', icon: '💡' },
    { value: 'Entertainment', label: '🎬 Zábava', icon: '🎬' },
    { value: 'Shopping', label: '🛒 Nákupy', icon: '🛒' },
    { value: 'Other', label: '📦 Ostatní', icon: '📦' },
];

function getCategoryIcon(category: string): string {
    return CATEGORIES.find(c => c.value === category)?.icon || '📦';
}

function getProgressColor(percentage: number): string {
    if (percentage >= 100) return 'var(--accent-error)';
    if (percentage >= 80) return 'var(--accent-warning)';
    return 'var(--accent-success)';
}

export default function BudgetsPage() {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Forms
    const [showBudgetForm, setShowBudgetForm] = useState(false);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [newBudget, setNewBudget] = useState({ category: '', amount: '' });
    const [newGoal, setNewGoal] = useState({ name: '', target_amount: '', deadline: '' });
    const [addAmountGoalId, setAddAmountGoalId] = useState<number | null>(null);
    const [addAmount, setAddAmount] = useState('');

    useEffect(() => {
        async function fetchData() {
            try {
                const [budgetsData, goalsData, dashData] = await Promise.all([
                    getBudgets(),
                    getGoals(),
                    getDashboard()
                ]);
                setBudgets(budgetsData);
                setGoals(goalsData);
                setAccounts(dashData.accounts);
            } catch (err) {
                console.error('Failed to load data:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const formatCurrency = (amount: number, currency: string = 'CZK') => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const totalPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Handlers
    const handleCreateBudget = async () => {
        if (!newBudget.category || !newBudget.amount) return;
        try {
            const created = await createBudget({
                category: newBudget.category,
                amount: parseFloat(newBudget.amount)
            });
            setBudgets([...budgets, created]);
            setNewBudget({ category: '', amount: '' });
            setShowBudgetForm(false);
        } catch (err) {
            console.error('Failed to create budget:', err);
        }
    };

    const handleDeleteBudget = async (id: number) => {
        try {
            await deleteBudget(id);
            setBudgets(budgets.filter(b => b.id !== id));
        } catch (err) {
            console.error('Failed to delete budget:', err);
        }
    };

    const handleCreateGoal = async () => {
        if (!newGoal.name || !newGoal.target_amount) return;
        try {
            const created = await createGoal({
                name: newGoal.name,
                target_amount: parseFloat(newGoal.target_amount),
                deadline: newGoal.deadline || undefined
            });
            setGoals([...goals, created]);
            setNewGoal({ name: '', target_amount: '', deadline: '' });
            setShowGoalForm(false);
        } catch (err) {
            console.error('Failed to create goal:', err);
        }
    };

    const handleAddToGoal = async (goalId: number) => {
        if (!addAmount) return;
        try {
            const updated = await updateGoal(goalId, {
                add_amount: parseFloat(addAmount)
            });
            setGoals(goals.map(g => g.id === goalId ? updated : g));
            setAddAmountGoalId(null);
            setAddAmount('');
        } catch (err) {
            console.error('Failed to add to goal:', err);
        }
    };

    const handleDeleteGoal = async (id: number) => {
        try {
            await deleteGoal(id);
            setGoals(goals.filter(g => g.id !== id));
        } catch (err) {
            console.error('Failed to delete goal:', err);
        }
    };

    const now = new Date();
    const monthName = now.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

    return (
        <MainLayout accounts={accounts}>
            <div style={{ padding: 'var(--spacing-lg)' }}>
                {/* Header */}
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
                        📊 Rozpočty - {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                    </h1>
                </div>

                {/* Total Overview */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                        <span className="text-secondary">Celkem utraceno tento měsíc</span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                            {formatCurrency(totalSpent)} / {formatCurrency(totalBudget)}
                        </span>
                    </div>
                    <div style={{
                        height: '12px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${Math.min(totalPercentage, 100)}%`,
                            background: getProgressColor(totalPercentage),
                            borderRadius: '6px',
                            transition: 'width 0.5s ease'
                        }} />
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '4px' }}>
                        <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                            {totalPercentage.toFixed(0)}%
                        </span>
                    </div>
                </GlassCard>

                {/* Budget Categories */}
                <GlassCard style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                        <h3 style={{ margin: 0 }}>💰 Rozpočty podle kategorií</h3>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowBudgetForm(!showBudgetForm)}
                            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                        >
                            + Přidat rozpočet
                        </button>
                    </div>

                    {/* Add Budget Form */}
                    {showBudgetForm && (
                        <div style={{
                            display: 'flex',
                            gap: 'var(--spacing-md)',
                            padding: 'var(--spacing-md)',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            marginBottom: 'var(--spacing-md)'
                        }}>
                            <select
                                className="input"
                                value={newBudget.category}
                                onChange={(e) => setNewBudget({ ...newBudget, category: e.target.value })}
                                style={{ flex: 1 }}
                            >
                                <option value="">Vyberte kategorii...</option>
                                {CATEGORIES.filter(c => !budgets.find(b => b.category === c.value)).map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                className="input"
                                placeholder="Limit (Kč)"
                                value={newBudget.amount}
                                onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
                                style={{ width: '150px' }}
                            />
                            <button className="btn btn-primary" onClick={handleCreateBudget}>
                                Uložit
                            </button>
                            <button className="btn" onClick={() => setShowBudgetForm(false)}>
                                Zrušit
                            </button>
                        </div>
                    )}

                    {/* Budget List */}
                    {budgets.length === 0 ? (
                        <p className="text-secondary">Zatím nemáte žádné rozpočty. Přidejte první!</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {budgets.map(budget => (
                                <div key={budget.id} style={{
                                    padding: 'var(--spacing-md)',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '1rem' }}>
                                            {getCategoryIcon(budget.category)} {budget.category}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                            <span>
                                                {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                                            </span>
                                            <button
                                                onClick={() => handleDeleteBudget(budget.id)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    padding: '4px 8px',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{
                                        height: '8px',
                                        background: 'rgba(255,255,255,0.1)',
                                        borderRadius: '4px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${Math.min(budget.percentage, 100)}%`,
                                            background: getProgressColor(budget.percentage),
                                            borderRadius: '4px',
                                            transition: 'width 0.5s ease'
                                        }} />
                                    </div>
                                    <div style={{ textAlign: 'right', marginTop: '4px' }}>
                                        <span
                                            className="text-secondary"
                                            style={{
                                                fontSize: '0.8rem',
                                                color: getProgressColor(budget.percentage)
                                            }}
                                        >
                                            {budget.percentage.toFixed(0)}%
                                            {budget.percentage >= 100 && ' ⚠️ Překročeno!'}
                                            {budget.percentage >= 80 && budget.percentage < 100 && ' ⚡ Blízko limitu'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </GlassCard>

                {/* Savings Goals */}
                <GlassCard>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                        <h3 style={{ margin: 0 }}>🎯 Spořící cíle</h3>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowGoalForm(!showGoalForm)}
                            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                        >
                            + Přidat cíl
                        </button>
                    </div>

                    {/* Add Goal Form */}
                    {showGoalForm && (
                        <div style={{
                            display: 'flex',
                            gap: 'var(--spacing-md)',
                            padding: 'var(--spacing-md)',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            marginBottom: 'var(--spacing-md)',
                            flexWrap: 'wrap'
                        }}>
                            <input
                                type="text"
                                className="input"
                                placeholder="Název cíle (např. Dovolená)"
                                value={newGoal.name}
                                onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                                style={{ flex: 1, minWidth: '200px' }}
                            />
                            <input
                                type="number"
                                className="input"
                                placeholder="Cílová částka (Kč)"
                                value={newGoal.target_amount}
                                onChange={(e) => setNewGoal({ ...newGoal, target_amount: e.target.value })}
                                style={{ width: '180px' }}
                            />
                            <input
                                type="date"
                                className="input"
                                value={newGoal.deadline}
                                onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                                style={{ width: '160px' }}
                            />
                            <button className="btn btn-primary" onClick={handleCreateGoal}>
                                Uložit
                            </button>
                            <button className="btn" onClick={() => setShowGoalForm(false)}>
                                Zrušit
                            </button>
                        </div>
                    )}

                    {/* Goals List */}
                    {goals.length === 0 ? (
                        <p className="text-secondary">Zatím nemáte žádné spořící cíle. Přidejte první!</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {goals.map(goal => (
                                <div key={goal.id} style={{
                                    padding: 'var(--spacing-md)',
                                    background: goal.is_completed ? 'rgba(0,255,100,0.05)' : 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    border: goal.is_completed ? '1px solid var(--accent-success)' : 'none'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '1rem' }}>
                                            {goal.is_completed ? '✅' : '🎯'} {goal.name}
                                            {goal.deadline && (
                                                <span className="text-secondary" style={{ fontSize: '0.8rem', marginLeft: '8px' }}>
                                                    do {new Date(goal.deadline).toLocaleDateString('cs-CZ')}
                                                </span>
                                            )}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                            <span>
                                                {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                                            </span>
                                            {!goal.is_completed && (
                                                <button
                                                    className="btn"
                                                    onClick={() => setAddAmountGoalId(addAmountGoalId === goal.id ? null : goal.id)}
                                                    style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                                >
                                                    + Přidat
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteGoal(goal.id)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    padding: '4px 8px',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>

                                    {/* Add amount form */}
                                    {addAmountGoalId === goal.id && (
                                        <div style={{
                                            display: 'flex',
                                            gap: 'var(--spacing-sm)',
                                            marginBottom: 'var(--spacing-sm)',
                                            padding: '8px',
                                            background: 'rgba(255,255,255,0.05)',
                                            borderRadius: '6px'
                                        }}>
                                            <input
                                                type="number"
                                                className="input"
                                                placeholder="Částka (Kč)"
                                                value={addAmount}
                                                onChange={(e) => setAddAmount(e.target.value)}
                                                style={{ width: '120px', padding: '6px 10px' }}
                                            />
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => handleAddToGoal(goal.id)}
                                                style={{ padding: '6px 12px' }}
                                            >
                                                Přidat
                                            </button>
                                        </div>
                                    )}

                                    <div style={{
                                        height: '8px',
                                        background: 'rgba(255,255,255,0.1)',
                                        borderRadius: '4px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${Math.min(goal.percentage, 100)}%`,
                                            background: goal.is_completed ? 'var(--accent-success)' : 'var(--accent-primary)',
                                            borderRadius: '4px',
                                            transition: 'width 0.5s ease'
                                        }} />
                                    </div>
                                    <div style={{ textAlign: 'right', marginTop: '4px' }}>
                                        <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                                            {goal.percentage.toFixed(0)}%
                                            {goal.is_completed && ' 🎉 Splněno!'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </GlassCard>
            </div>
        </MainLayout>
    );
}
