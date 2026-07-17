import { apiFetch, fetchApi } from './core';

// === Subscriptions ===

export interface Subscription {
    id: number;
    name: string;
    merchant_pattern: string;
    amount: number;
    currency: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    category: string | null;
    first_seen_date: string | null;
    note: string | null;
    is_active: boolean;
    my_percentage: number;
    my_amount_override: number | null;
    my_amount: number;
    monthly_equivalent: number;
    yearly_cost: number;
    my_monthly_equivalent: number;
    my_yearly_cost: number;
    last_charged_date: string | null;
    last_amount: number | null;
    charges_count: number;
    next_due_date: string | null;
    renewing_soon: boolean;
    is_stale: boolean;
    price_change_from: number | null;
    price_change_to: number | null;
    contribution_pattern: string | null;
    last_contribution_date: string | null;
    last_contribution_amount: number | null;
    contribution_received_this_period: boolean | null;
}

export interface DetectedSubscription {
    name: string;
    merchant_pattern: string;
    amount: number;
    currency: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    category: string | null;
    occurrences: number;
    avg_interval_days: number;
    first_seen_date: string;
    last_charged_date: string;
    next_due_estimate: string;
}

export interface SubscriptionsSummary {
    active_count: number;
    monthly_total: number;
    yearly_total: number;
    my_monthly_total: number;
    my_yearly_total: number;
    currency: string;
}

export interface SubscriptionCreateInput {
    name: string;
    merchant_pattern: string;
    amount: number;
    currency?: string;
    period: 'monthly' | 'quarterly' | 'yearly';
    category?: string | null;
    first_seen_date?: string | null;
    note?: string | null;
    my_percentage?: number | null;
    my_amount_override?: number | null;
    contribution_pattern?: string | null;
}

export async function getSubscriptions(): Promise<Subscription[]> {
    return fetchApi<Subscription[]>('/subscriptions/');
}

export async function getSubscriptionsSummary(): Promise<SubscriptionsSummary> {
    return fetchApi<SubscriptionsSummary>('/subscriptions/summary');
}

export async function detectSubscriptions(): Promise<DetectedSubscription[]> {
    return fetchApi<DetectedSubscription[]>('/subscriptions/detect');
}

export async function createSubscription(data: SubscriptionCreateInput): Promise<Subscription> {
    const r = await apiFetch('/subscriptions/', { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to create subscription');
    return r.json();
}

export async function updateSubscription(id: number, data: Partial<SubscriptionCreateInput> & { is_active?: boolean }): Promise<Subscription> {
    const r = await apiFetch(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to update subscription');
    return r.json();
}

export async function deleteSubscription(id: number): Promise<{ status: string; id: number }> {
    const r = await apiFetch(`/subscriptions/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete subscription');
    return r.json();
}
