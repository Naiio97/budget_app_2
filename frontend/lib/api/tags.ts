import { apiFetch, fetchApi } from './core';

export interface Tag {
    id: number;
    name: string;
    color?: string | null;
    usage_count?: number;
}

export interface TagSummary {
    tag: Tag;
    transaction_count: number;
    total_expenses: number;
    total_income: number;
    net: number;
    by_category: { category: string; amount: number }[];
    date_from: string | null;
    date_to: string | null;
    currency: string;
}

// ── Tags ────────────────────────────────────────────────────────

export async function getTags(): Promise<{ tags: Tag[] }> {
    return fetchApi<{ tags: Tag[] }>('/tags/');
}

export async function createTag(name: string, color?: string): Promise<Tag> {
    const response = await apiFetch('/tags/', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Failed to create tag');
    return response.json();
}

export async function deleteTag(id: number): Promise<void> {
    const response = await apiFetch(`/tags/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete tag');
}

export async function getTagSummary(id: number): Promise<TagSummary> {
    return fetchApi<TagSummary>(`/tags/${id}/summary`);
}

export async function setTransactionTags(transactionId: string, tagIds: number[]): Promise<{ id: string; tags: Tag[] }> {
    const response = await apiFetch(`/transactions/${transactionId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tag_ids: tagIds }),
    });
    if (!response.ok) throw new Error('Failed to set transaction tags');
    return response.json();
}
