'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from './shared';

interface Candidate {
    id: string; date: string; description: string; amount: number;
    currency: string; category: string | null; creditor_name: string | null;
}

// Ruční spárování výdaje s platbou. Z vybrané transakce si backend zapamatuje
// vzor, kategorii a splatnost do šablony — příští měsíce se spárují samy.
export default function LinkTransactionModal({ expenseId, expenseName, onLinked, onClose }: {
    expenseId: number;
    expenseName: string;
    onLinked: () => void;
    onClose: () => void;
}) {
    const [candidates, setCandidates] = useState<Candidate[] | null>(null);
    const [learn, setLearn] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiFetch(`/monthly-expenses/${expenseId}/candidate-transactions`)
            .then(r => r.json())
            .then(d => setCandidates(d.transactions ?? []))
            .catch(() => setError('Platby se nepodařilo načíst.'));
    }, [expenseId]);

    const link = async (txId: string) => {
        setSaving(true);
        setError(null);
        try {
            const res = await apiFetch(`/monthly-expenses/${expenseId}/link-transaction`, {
                method: 'POST',
                body: JSON.stringify({ transaction_id: txId, learn }),
            });
            if (!res.ok) throw new Error();
            onLinked();
            onClose();
        } catch {
            setError('Spárování se nepodařilo uložit.');
            setSaving(false);
        }
    };

    return createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 'var(--spacing-lg)', borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ fontWeight: 600 }}>Spárovat s platbou</div>
                    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{expenseName} · nejbližší částkou první</div>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 }}>
                        <input type="checkbox" checked={learn} onChange={e => setLearn(e.target.checked)} />
                        Zapamatovat si platbu pro automatické párování
                    </label>
                    {error && <div style={{ color: 'var(--neg)', fontSize: 12, marginTop: 6 }}>{error}</div>}
                </div>
                <div style={{ overflowY: 'auto', opacity: saving ? 0.6 : 1 }}>
                    {candidates === null ? (
                        <div style={{ padding: 'var(--spacing-lg)', color: 'var(--text-3)' }}>Načítám…</div>
                    ) : candidates.length === 0 ? (
                        <div style={{ padding: 'var(--spacing-lg)', color: 'var(--text-3)' }}>V tomto období není žádná volná odchozí platba.</div>
                    ) : candidates.map(c => (
                        <button key={c.id} disabled={saving} onClick={() => link(c.id)}
                            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12, padding: '10px var(--spacing-lg)', background: 'none', border: 'none', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                            <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.creditor_name || c.description}</span>
                                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{c.date}{c.category ? ` · ${c.category}` : ''}</span>
                            </span>
                            <span className="num" style={{ whiteSpace: 'nowrap' }}>{formatCurrency(Math.abs(c.amount))}</span>
                        </button>
                    ))}
                </div>
                <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={onClose}>Zavřít</button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
