'use client';

import { useState, useEffect } from 'react';
import { ShareRule, getShareRules, createShareRule, deleteShareRule } from '@/lib/api';
import { Icons } from '@/lib/icons';

// ── Share rules (auto-split of shared expenses) ───────────────
export default function ShareRulesSettings() {
    const [rules, setRules] = useState<ShareRule[]>([]);
    const [pattern, setPattern] = useState('');
    const [percentage, setPercentage] = useState('50');
    const [counterparty, setCounterparty] = useState('');
    const [saving, setSaving] = useState(false);
    const [lastResult, setLastResult] = useState<string | null>(null);

    const load = async () => {
        try { setRules(await getShareRules()); } catch (err) { console.error(err); }
    };
    useEffect(() => { load(); }, []);

    const add = async () => {
        const p = pattern.toLowerCase().trim();
        const pct = parseFloat(percentage.replace(',', '.'));
        if (p.length < 3 || !(pct >= 0 && pct <= 100)) return;
        setSaving(true);
        try {
            const result = await createShareRule({
                pattern: p,
                my_percentage: pct,
                counterparty: counterparty.trim() || null,
                apply_retroactively: true,
            });
            setLastResult(`Pravidlo uloženo, zpětně rozděleno ${result.applied_to} transakcí.`);
            setPattern('');
            setCounterparty('');
            await load();
        } catch (err) {
            setLastResult(err instanceof Error ? err.message : 'Uložení selhalo');
        } finally { setSaving(false); }
    };

    const remove = async (id: number) => {
        try { await deleteShareRule(id); await load(); } catch (err) { console.error(err); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Výdaje odpovídající vzoru se automaticky rozdělí — do rozpočtu jde jen tvoje
                procento, zbytek je pohledávka (viz stránka Vypořádání). Např. „nájem&ldquo; → 50 %.
            </div>
            {rules.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rules.map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span className="chip" style={{ flexShrink: 0 }}>{r.pattern}</span>
                            <span style={{ color: 'var(--text-2)' }}>
                                moje {r.my_amount_override != null ? `${r.my_amount_override} Kč` : `${r.my_percentage} %`}
                                {r.counterparty ? ` · dluží ${r.counterparty}` : ''}
                                {` · ${r.match_count}×`}
                            </span>
                            <button onClick={() => remove(r.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" placeholder="Vzor (protistrana, popis, IBAN…)" value={pattern}
                    onChange={e => setPattern(e.target.value)} style={{ flex: '2 1 160px' }} />
                <input className="input" type="number" min={0} max={100} placeholder="Moje %" value={percentage}
                    onChange={e => setPercentage(e.target.value)} style={{ flex: '0 1 90px' }} />
                <input className="input" placeholder="Kdo dluží (Žena…)" value={counterparty}
                    onChange={e => setCounterparty(e.target.value)} style={{ flex: '1 1 120px' }} />
                <button className="btn btn-primary" onClick={add} disabled={saving || pattern.trim().length < 3}>
                    {saving ? 'Ukládám...' : Icons.action.add}
                </button>
            </div>
            {lastResult && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{lastResult}</div>}
        </div>
    );
}
