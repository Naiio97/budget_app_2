'use client';

import { Icons } from '@/lib/icons';
import { MONTH_NAMES, formatCurrency, type AnnualData } from './shared';

// Roční přehled rozpočtu — čistě prezentační komponenta nad daty
// z GET /annual-overview/{year}.
const SHORT_MONTHS = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

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

    const maxValue = Math.max(...data.months.map(m => Math.max(m.income, m.expenses)), 1);
    const activeMonths = data.months.filter(m => m.income > 0);
    const prev = data.previous_year;
    const renderDelta = (current: number, previous: number | undefined, invert = false) => {
        if (!previous || previous === 0) return null;
        const d = ((current - previous) / Math.abs(previous)) * 100;
        if (Math.abs(d) < 0.5) return null;
        const good = invert ? d < 0 : d > 0;
        return <span className={`ann-delta ${good ? 'pos' : 'neg'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} %</span>;
    };

    // kumulativní čistý výsledek (linka přes sloupce)
    const cumNet: number[] = [];
    let runNet = 0;
    for (const m of data.months) { runNet += m.income - m.expenses; cumNet.push(runNet); }
    const cumMax = Math.max(...cumNet, 0);
    const cumMin = Math.min(...cumNet, 0);
    const cumRange = cumMax - cumMin || 1;

    // Spořicí sazba = investice + spořicí účet (stejně jako v měsíčním pohledu)
    const mwn = activeMonths.map(m => ({ ...m, net: m.income - m.expenses, sr: m.income > 0 ? ((m.investments + m.savings) / m.income) * 100 : 0 }));
    const best = mwn.length ? mwn.reduce((a, b) => a.net > b.net ? a : b) : null;
    const worst = mwn.length ? mwn.reduce((a, b) => a.net < b.net ? a : b) : null;
    const avgSR = data.totals.income > 0 ? ((data.totals.investments + data.totals.savings) / data.totals.income) * 100 : 0;
    const sparkW = 280; const sparkH = 44;
    const maxSR = Math.max(...data.months.map(m => m.income > 0 ? ((m.investments + m.savings) / m.income) * 100 : 0), 10);
    const pts = data.months.map((m, i) => ({ x: (i / 11) * sparkW, y: sparkH - ((m.income > 0 ? ((m.investments + m.savings) / m.income) * 100 : 0) / maxSR) * sparkH, ok: m.income > 0 }));
    const sparkPath = pts.filter(p => p.ok).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Výdaje podle položek ve dvou sloupcích
    const items = Object.entries(data.expense_breakdown).sort(([, a], [, b]) => b - a).slice(0, 16);
    const maxItem = items[0]?.[1] ?? 1;
    const half = Math.ceil(items.length / 2);
    const renderItem = ([name, amount]: [string, number]) => {
        const pct = data.totals.expenses > 0 ? (amount / data.totals.expenses) * 100 : 0;
        return (
            <div key={name} className="ann-item">
                <span className="ann-item-name">{name}</span>
                <span className="ann-item-bar"><span style={{ width: `${(amount / maxItem) * 100}%` }} /></span>
                <span className="ann-item-amount num">{formatCurrency(amount)}</span>
                <span className="ann-item-pct">{pct.toFixed(0)} %</span>
            </div>
        );
    };

    const kpis = [
        { label: 'Příjmy', value: data.totals.income, prev: prev?.income, avg: data.averages.income },
        { label: 'Výdaje', value: data.totals.expenses, prev: prev?.expenses, avg: data.averages.expenses, invert: true },
        { label: 'Investice', value: data.totals.investments, prev: prev?.investments, avg: data.averages.investments },
        { label: 'Čistý zisk', value: data.totals.net, prev: prev?.net, tone: data.totals.net >= 0 ? 'pos' : 'neg' },
    ];

    return (
        <div className="ann">
            <div className="ann-kpis">
                {kpis.map(it => (
                    <div key={it.label} className="surface ann-kpi">
                        <div className="ann-kpi-label">{it.label}</div>
                        <div className={`ann-kpi-value num ${it.tone ?? ''}`}>{formatCurrency(it.value)}{renderDelta(it.value, it.prev, it.invert)}</div>
                        {it.avg !== undefined && <div className="ann-kpi-sub">průměr {formatCurrency(it.avg)}/měsíc</div>}
                    </div>
                ))}
            </div>

            <div className="ann-row">
                <div className="surface ann-chart">
                    <div className="card-head">
                        <h3>Měsíční přehled {year}</h3>
                        <div className="ann-legend">
                            <span><i className="income" />Příjmy</span>
                            <span><i className="expense" />Výdaje</span>
                            <span><i className="line" />Kum. čistý</span>
                        </div>
                    </div>
                    <div className="ann-plot">
                        <div className="ann-bars">
                            {data.months.map((m, i) => (
                                <button key={m.month} type="button" className="ann-month" onClick={() => onOpenMonth(m.month)}
                                    title={`${MONTH_NAMES[i]}: příjmy ${formatCurrency(m.income)}, výdaje ${formatCurrency(m.expenses)}`}>
                                    <span className="ann-pair">
                                        <span className="bar income" style={{ height: `${(m.income / maxValue) * 100}%` }} />
                                        <span className="bar expense" style={{ height: `${(m.expenses / maxValue) * 100}%` }} />
                                    </span>
                                    <span className="ann-month-label">{SHORT_MONTHS[i]}</span>
                                </button>
                            ))}
                        </div>
                        {activeMonths.length > 0 && (
                            <svg className="ann-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                                <polyline
                                    points={cumNet.map((v, i) => `${((i + 0.5) / 12) * 100},${(100 - ((v - cumMin) / cumRange) * 100).toFixed(2)}`).join(' ')}
                                    fill="none" stroke="var(--pos)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                            </svg>
                        )}
                    </div>
                    <div className="ann-hint">Klikni na měsíc pro detail</div>
                </div>

                <div className="ann-side">
                    {best && (
                        <div className="surface ann-stat good">
                            <span className="ann-stat-icon">{Icons.section.bestWorst}</span>
                            <div>
                                <div className="ann-stat-label">Nejlepší měsíc</div>
                                <div className="ann-stat-title">{MONTH_NAMES[best.month - 1]}</div>
                                <div className="ann-stat-value num">{formatCurrency(best.net)}</div>
                            </div>
                        </div>
                    )}
                    {worst && worst.month !== best?.month && (
                        <div className="surface ann-stat bad">
                            <span className="ann-stat-icon">{Icons.section.trend}</span>
                            <div>
                                <div className="ann-stat-label">Nejhorší měsíc</div>
                                <div className="ann-stat-title">{MONTH_NAMES[worst.month - 1]}</div>
                                <div className="ann-stat-value num">{formatCurrency(worst.net)}</div>
                            </div>
                        </div>
                    )}
                    <div className="surface ann-stat saving">
                        <div className="ann-stat-label">Úspora celkem</div>
                        <div className="ann-stat-big num">{avgSR.toFixed(0)} %</div>
                        <div className="ann-stat-sub">příjmu ušetřeno za rok</div>
                        <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" aria-hidden>
                            {sparkPath && <path d={sparkPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                            {pts.filter(p => p.ok).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--accent)" />)}
                        </svg>
                    </div>
                </div>
            </div>

            <div className="surface ann-items">
                <div className="card-head">
                    <h3>Výdaje podle položek</h3>
                    <span className="muted small">top {items.length} za rok {year}</span>
                </div>
                <div className="ann-items-grid">
                    <div>{items.slice(0, half).map(renderItem)}</div>
                    <div>{items.slice(half).map(renderItem)}</div>
                </div>
            </div>
        </div>
    );
}
