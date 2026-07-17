'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Icons } from '@/lib/icons';

// ── Family account ────────────────────────────────────────────
export default function FamilyAccountSettings() {
    const [familyPattern, setFamilyPattern] = useState('');
    const [familyName, setFamilyName] = useState('Partner');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasExisting, setHasExisting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch(`/settings/family-accounts`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.accounts?.length > 0) {
                        setHasExisting(true);
                        setFamilyPattern(data.accounts[0].pattern);
                        setFamilyName(data.accounts[0].name);
                    }
                }
            } catch (err) { console.error(err); }
        })();
    }, []);

    const save = async () => {
        if (!familyPattern.trim()) return;
        setSaving(true);
        try {
            const res = await apiFetch(`/settings/family-accounts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: familyPattern, name: familyName }),
            });
            if (res.ok) { setSaved(true); setHasExisting(true); setTimeout(() => setSaved(false), 2000); }
        } finally { setSaving(false); }
    };

    const remove = async () => {
        await apiFetch(`/settings/family-accounts`, { method: 'DELETE' });
        setHasExisting(false); setFamilyPattern(''); setFamilyName('Partner');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Transakce obsahující tento text budou automaticky vyloučeny z příjmů a výdajů jako rodinný převod.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="input" placeholder="Jméno (Partner, ...)" value={familyName} onChange={e => setFamilyName(e.target.value)} />
                <input className="input" placeholder="Text (Sandri, IBAN, ...)" value={familyPattern} onChange={e => setFamilyPattern(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={saving || !familyPattern.trim()} onClick={save} style={{ flex: 1 }}>
                    {saving ? 'Ukládám...' : saved ? '✓ Uloženo' : 'Uložit rodinný účet'}
                </button>
                {hasExisting && <button className="btn" onClick={remove} style={{ color: 'var(--neg)' }}>{Icons.action.delete}</button>}
            </div>
        </div>
    );
}
