'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Icons } from '@/lib/icons';

// ── My account patterns (internal transfers) ──────────────────
export default function MyAccountPatterns() {
    const [patterns, setPatterns] = useState<string[]>([]);
    const [newPattern, setNewPattern] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch(`/settings/my-account-patterns`);
                if (res.ok) {
                    const data = await res.json();
                    setPatterns(data.patterns || []);
                }
            } catch (err) { console.error(err); }
        })();
    }, []);

    const addPattern = () => {
        const t = newPattern.toLowerCase().trim();
        if (!t || patterns.includes(t)) return;
        setPatterns([...patterns, t]);
        setNewPattern('');
    };

    const removePattern = (p: string) => setPatterns(patterns.filter(x => x !== p));

    const save = async () => {
        setSaving(true);
        try {
            const res = await apiFetch(`/settings/my-account-patterns`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patterns }),
            });
            if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
        } finally { setSaving(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Texty v popisu transakcí, které označí transakci jako interní převod (mezi tvými účty).
            </div>
            {patterns.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {patterns.map(p => (
                        <span key={p} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {p}
                            <button onClick={() => removePattern(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>✕</button>
                        </span>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="Např. spořící, savings, IBAN..." value={newPattern} onChange={e => setNewPattern(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPattern()} style={{ flex: 1 }} />
                <button className="btn" onClick={addPattern} disabled={!newPattern.trim()}>{Icons.action.add}</button>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Ukládám...' : saved ? '✓ Uloženo' : 'Uložit vzory'}
            </button>
        </div>
    );
}
