'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Icons } from '@/lib/icons';

// ── Transfer-excluded accounts (credit card etc.) ─────────────
export default function TransferExcludedAccounts() {
    const [accounts, setAccounts] = useState<string[]>([]);
    const [newAccount, setNewAccount] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch(`/settings/transfer-excluded-accounts`);
                if (res.ok) {
                    const data = await res.json();
                    setAccounts(data.accounts || []);
                }
            } catch (err) { console.error(err); }
        })();
    }, []);

    const addAccount = () => {
        const t = newAccount.trim();
        if (!t || accounts.includes(t)) return;
        setAccounts([...accounts, t]);
        setNewAccount('');
    };

    const removeAccount = (a: string) => setAccounts(accounts.filter(x => x !== a));

    const save = async () => {
        setSaving(true);
        try {
            const res = await apiFetch(`/settings/transfer-excluded-accounts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accounts }),
            });
            if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
        } finally { setSaving(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Vlastní účty, na které se platba počítá jako <b>běžný výdaj</b>, ne interní převod
                (typicky kreditka — splátka je reálný výdaj). Zadej číslo účtu nebo IBAN.
            </div>
            {accounts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {accounts.map(a => (
                        <span key={a} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {a}
                            <button onClick={() => removeAccount(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>✕</button>
                        </span>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="Např. 1028717374/0800 nebo IBAN..." value={newAccount} onChange={e => setNewAccount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAccount()} style={{ flex: 1 }} />
                <button className="btn" onClick={addAccount} disabled={!newAccount.trim()}>{Icons.action.add}</button>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Ukládám...' : saved ? '✓ Uloženo' : 'Uložit vyloučené účty'}
            </button>
        </div>
    );
}
