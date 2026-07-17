import { apiFetch, fetchApi } from './core';

// ── Push notifications ──────────────────────────────────────────

export async function getVapidPublicKey(): Promise<string> {
    const data = await fetchApi<{ key: string }>('/notifications/vapid-public-key');
    return data.key;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
    const response = await apiFetch('/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
    });
    if (!response.ok) throw new Error('Failed to subscribe to push notifications');
}

export async function unsubscribePush(endpoint: string): Promise<void> {
    const response = await apiFetch('/notifications/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
    });
    if (!response.ok) throw new Error('Failed to unsubscribe from push notifications');
}

export async function sendTestPush(): Promise<{ sent: number }> {
    const response = await apiFetch('/notifications/test', { method: 'POST' });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Failed to send test notification');
    return response.json();
}
