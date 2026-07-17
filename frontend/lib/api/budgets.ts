import { apiFetch, fetchApi } from './core';

export interface DailySpendingPoint {
    day: number;
    spent: number;
}

export interface Budget {
    id: number;
    category: string;          // primární kategorie (zpětná kompatibilita)
    name: string;              // zobrazovaný název (např. "Běžný život")
    categories: string[];      // všechny pokryté kategorie
    amount: number;
    currency: string;
    is_active: boolean;
    spent: number;
    percentage: number;
    // Tempo utrácení — jen v GET /budgets/ (create/update vrací defaulty)
    projected: number;
    days_elapsed: number;
    days_in_month: number;
    daily_cumulative: DailySpendingPoint[];
}

export interface SavingsGoal {
    id: number;
    name: string;
    target_amount: number;
    current_amount: number;
    currency: string;
    deadline: string | null;
    is_completed: boolean;
    percentage: number;
}

export async function getBudgets(): Promise<Budget[]> {
    return fetchApi<Budget[]>('/budgets/');
}

export async function createBudget(data: { name?: string; categories: string[]; amount: number }): Promise<Budget> {
    const response = await apiFetch(`/budgets/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || 'Failed to create budget');
    }
    return response.json();
}

export interface BudgetCategoryOption {
    name: string;
    icon: string;
    color?: string;
    is_income?: boolean;
}

export async function getBudgetCategoryOptions(): Promise<BudgetCategoryOption[]> {
    const raw = await fetchApi<BudgetCategoryOption[]>('/categories/');
    return (Array.isArray(raw) ? raw : []).filter(c => !c.is_income);
}

export async function updateBudget(id: number, data: { category?: string; amount?: number; is_active?: boolean }): Promise<Budget> {
    const response = await apiFetch(`/budgets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update budget');
    return response.json();
}

export async function deleteBudget(id: number): Promise<{ status: string; id: number }> {
    const response = await apiFetch(`/budgets/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete budget');
    return response.json();
}

export async function getGoals(): Promise<SavingsGoal[]> {
    return fetchApi<SavingsGoal[]>('/budgets/goals');
}

export async function createGoal(data: { name: string; target_amount: number; deadline?: string }): Promise<SavingsGoal> {
    const response = await apiFetch(`/budgets/goals`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create goal');
    return response.json();
}

export async function updateGoal(id: number, data: { name?: string; target_amount?: number; current_amount?: number; add_amount?: number; deadline?: string; is_completed?: boolean }): Promise<SavingsGoal> {
    const response = await apiFetch(`/budgets/goals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update goal');
    return response.json();
}

export async function deleteGoal(id: number): Promise<{ status: string; id: number }> {
    const response = await apiFetch(`/budgets/goals/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete goal');
    return response.json();
}
