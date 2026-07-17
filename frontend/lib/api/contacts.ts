import { apiFetch } from './core';

// === Contacts (IBAN address book) ===

export interface Contact {
    iban: string;
    name: string;
    source: 'auto' | 'manual';
    note?: string | null;
}

export async function saveContact(iban: string, name: string, note?: string): Promise<Contact> {
    const response = await apiFetch(`/contacts/${encodeURIComponent(iban)}`, {
        method: 'PUT',
        body: JSON.stringify({ name, note: note ?? null }),
    });
    if (!response.ok) throw new Error('Failed to save contact');
    return response.json();
}
