'use client';

import { Icons } from '@/lib/icons';
import { MONTH_NAMES, formatCurrency, type AnnualData } from './shared';

// Roční přehled rozpočtu — čistě prezentační komponenta nad daty
// z GET /annual-overview/{year}.
export default function AnnualOverview({ data, year, onOpenMonth }: {
    data: AnnualData | undefined;
    year: number;
    onOpenMonth: (month: number) => void;
}) {
        if (!data) return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl)' }}>
                <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
        );
        const maxValue = Math.max(...data.months.map(m => Math.max(m.income, m.expenses)));
        const activeMonths = data.months.filter(m => m.income > 0);
        const prev = data.previous_year;
        const renderDelta = (current: number, previous: number | undefined, invert = false) => {
            if (!previous || previous === 0) return null;
            const d = ((current - previous) / Math.abs(previous)) * 100;
            if (Math.abs(d) < 0.5) return null;
            const good = invert ? d < 0 : d > 0;
            return <span style={{ fontSize: 11, color: good ? 'var(--pos)' : 'var(--neg)', fontWeight: 600, marginLeft: 6 }}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%</span>;
        };
        const cumNet: number[] = [];
        let runNet = 0;
        for (const m of data.months) { runNet += m.income - m.expenses; cumNet.push(runNet); }
        const cumMax = Math.max(...cumNet, 0); const cumMin = Math.min(...cumNet, 0); const cumRange = cumMax - cumMin || 1;
        // Spořicí sazba = investice + spořicí účet (stejně jako v měsíčním pohledu) —
        // dřív počítalo jen investice, takže spoření se do trendu vůbec nepropsalo.
        const mwn = activeMonths.map(m => ({ ...m, net: m.income - m.expenses, sr: m.income > 0 ? ((m.investments + m.savings) / m.income) * 100 : 0 }));
        const best = mwn.length ? mwn.reduce((a, b) => a.net > b.net ? a : b) : null;
        const worst = mwn.length ? mwn.reduce((a, b) => a.net < b.net ? a : b) : null;
        const avgSR = data.totals.income > 0 ? ((data.totals.investments + data.totals.savings) / data.totals.income) * 100 : 0;
        const sparkW = 280; const sparkH = 44;
        const maxSR = Math.max(...data.months.map(m => m.income > 0 ? ((m.investments + m.savings) / m.income) * 100 : 0), 10);
        const pts = data.months.map((m, i) => ({ x: (i / 11) * sparkW, y: sparkH - ((m.income > 0 ? ((m.investments + m.savings) / m.income) * 100 : 0) / maxSR) * sparkH, ok: m.income > 0 }));
        const sparkPath = pts.filter(p => p.ok).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-md)' }}>
                    {[
                        { label: 'Příjmy', value: data.totals.income, prev: prev?.income, color: 'var(--pos)', avg: data.averages.income },
                        { label: 'Výdaje', value: data.totals.expenses, prev: prev?.expenses, color: 'var(--neg)', avg: data.averages.expenses, invert: true },
                        { label: 'Investice', value: data.totals.investments, prev: prev?.investments, color: 'var(--accent)', avg: data.averages.investments },
                        { label: 'Čistý zisk', value: data.totals.net, prev: prev?.net, color: data.totals.net >= 0 ? 'var(--pos)' : 'var(--neg)' },
                    ].map(it => (
                        <div key={it.label} className="surface kpi">
                            <div className="kpi-label">{it.label}</div>
                            <div className="kpi-value num" style={{ color: it.color, fontSize: 20 }}>{formatCurrency(it.value)}{renderDelta(it.value, it.prev, it.invert)}</div>
                            {it.avg !== undefined && <div className="kpi-sub">⌀ {formatCurrency(it.avg)}/měs</div>}
                        </div>
                    ))}
                </div>
                <div className="surface">
                    <div className="card-head"><h3>{Icons.section.monthlyOverview} Měsíční přehled {year}</h3></div>
                    <div className="card-body">
                        <div style={{ position: 'relative', height: 180 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 180 }}>
                                {data.months.map((m, i) => (
                                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }} onClick={() => onOpenMonth(m.month)}>
                                        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 160 }}>
                                            <div style={{ width: 10, height: maxValue > 0 ? `${(m.income / maxValue) * 100}%` : '0%', background: 'var(--pos)', borderRadius: '2px 2px 0 0', minHeight: m.income > 0 ? 4 : 0, transition: 'height 0.3s' }} />
                                            <div style={{ width: 10, height: maxValue > 0 ? `${(m.expenses / maxValue) * 100}%` : '0%', background: 'var(--neg)', borderRadius: '2px 2px 0 0', minHeight: m.expenses > 0 ? 4 : 0, opacity: m.expenses > m.income ? 1 : 0.7, transition: 'height 0.3s' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>{MONTH_NAMES[i].substring(0, 3)}</span>
                                    </div>
                                ))}
                            </div>
                            {activeMonths.length > 0 && (
                                <svg viewBox="0 0 100 160" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 160, pointerEvents: 'none' }}>
                                    <polyline points={cumNet.map((v, i) => `${(i / 11) * 100},${(160 - ((v - cumMin) / cumRange) * 160).toFixed(2)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeDasharray="4 3" />
                                </svg>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--pos)', borderRadius: 2, marginRight: 4 }} />Příjmy</span>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--neg)', borderRadius: 2, marginRight: 4 }} />Výdaje</span>
                            <span><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--accent)', marginRight: 4, verticalAlign: 'middle' }} />Kum. čistý</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>Klikni na měsíc pro detail</div>
                    </div>
                </div>
                {activeMonths.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-md)' }}>
                        {best && <div className="surface" style={{ padding: 'var(--spacing-md)', background: 'color-mix(in srgb, var(--pos) 6%, var(--surface))' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{Icons.section.bestWorst} Nejlepší měsíc</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--pos)' }}>{MONTH_NAMES[best.month - 1]}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatCurrency(best.net)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>úspor. {best.sr.toFixed(0)}%</div>
                        </div>}
                        {worst && worst.month !== best?.month && <div className="surface" style={{ padding: 'var(--spacing-md)', background: 'color-mix(in srgb, var(--neg) 6%, var(--surface))' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{Icons.section.trend} Nejhorší měsíc</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--neg)' }}>{MONTH_NAMES[worst.month - 1]}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatCurrency(worst.net)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>úspor. {worst.sr.toFixed(0)}%</div>
                        </div>}
                        <div className="surface" style={{ padding: 'var(--spacing-md)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Trend úspor. sazby</div>
                            <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" style={{ marginTop: 6 }}>
                                {sparkPath && <path d={sparkPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                                {pts.filter(p => p.ok).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--accent)" />)}
                            </svg>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 2 }}>⌀ {avgSR.toFixed(0)}% za rok</div>
                        </div>
                    </div>
                )}
                <div className="surface">
                    <div className="card-head"><h3>{Icons.section.expensesByItem} Výdaje podle položek</h3></div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(data.expense_breakdown).sort(([, a], [, b]) => b - a).slice(0, 15).map(([name, amount]) => {
                            const pct = (amount / data.totals.expenses) * 100;
                            return (
                                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 140, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{name}</span>
                                    <div className="progress" style={{ flex: 1 }}><span style={{ width: `${pct}%` }} /></div>
                                    <span style={{ width: 90, textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatCurrency(amount)}</span>
                                    <span style={{ width: 36, textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>{pct.toFixed(0)}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
}
