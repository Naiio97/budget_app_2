'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ArrowIcon from './ArrowIcon';

interface CategoryChartProps {
    categories: Record<string, number>;
    currency?: string;
}

// Tlumená paleta — kategorie se rozlišují pořadím, ne křiklavými barvami z databáze.
const PALETTE = [
    '#6a9fd0', '#b8a56a', '#9d92c9', '#7fbf9e', '#d09a8a', '#7fb8c4',
    '#c58fb0', '#a3acba', '#8fb36a', '#d4b36a', '#6f86c9', '#b98a6a',
];

const colorFor = (index: number) =>
    index < PALETTE.length ? PALETTE[index] : `hsl(${(index * 47) % 360} 28% 62%)`;

// Geometrie donutu (viewBox 0 0 220 220)
const SIZE = 220;
const RADIUS = 82;
const STROKE = 26;
const STROKE_ACTIVE = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2.5; // mezera mezi výsečemi (v délce oblouku)

const percentText = (share: number) =>
    `${(share * 100).toFixed(share >= 0.1 ? 0 : 1).replace('.', ',')} %`;

export default function CategoryChart({ categories, currency = 'CZK' }: CategoryChartProps) {
    const [hovered, setHovered] = useState<string | null>(null);
    const [pinned, setPinned] = useState<string | null>(null);

    const fmt = (amount: number) =>
        new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    const { items, total } = useMemo(() => {
        const sorted = Object.entries(categories)
            .map(([name, amount]) => ({ name: name.trim(), amount }))
            .filter(c => c.amount > 0)
            .sort((a, b) => b.amount - a.amount);
        const sum = sorted.reduce((s, c) => s + c.amount, 0);
        const withGeometry = sorted.reduce<Array<{
            name: string; amount: number; share: number; color: string; length: number; offset: number;
        }>>((list, c, i) => {
            const share = sum > 0 ? c.amount / sum : 0;
            const prev = list[i - 1];
            list.push({
                ...c, share, color: colorFor(i), length: share * CIRCUMFERENCE,
                offset: prev ? prev.offset + prev.length : 0,
            });
            return list;
        }, []);
        return { items: withGeometry, total: sum };
    }, [categories]);

    const focusName = hovered ?? pinned;
    const focus = items.find(c => c.name === focusName) ?? null;

    const togglePinned = (name: string) => setPinned(p => (p === name ? null : name));

    return (
        <div className="dash-card dash-cats">
            <div className="dash-card-head">
                <h3>Kam míří peníze</h3>
                <Link href="/reports" className="dash-arrow-link" aria-label="Přehledy výdajů">
                    <ArrowIcon />
                </Link>
            </div>

            {items.length === 0 ? (
                <div className="dash-empty">Žádné výdaje k zobrazení</div>
            ) : (
                <>
                    <div className="dash-donut">
                        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Rozložení výdajů podle kategorií">
                            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--d-track)" strokeWidth={STROKE} />
                            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                                {items.map(c => {
                                    const isActive = focus?.name === c.name;
                                    const dimmed = focus != null && !isActive;
                                    return (
                                        <circle
                                            key={c.name}
                                            className={`dash-donut-seg${isActive ? ' active' : ''}${dimmed ? ' dimmed' : ''}`}
                                            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                                            fill="none"
                                            stroke={c.color}
                                            strokeWidth={isActive ? STROKE_ACTIVE : STROKE}
                                            strokeDasharray={`${Math.max(c.length - (items.length > 1 ? GAP : 0), 0.5)} ${CIRCUMFERENCE}`}
                                            strokeDashoffset={-c.offset}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`${c.name}: ${fmt(c.amount)}, ${percentText(c.share)}`}
                                            onMouseEnter={() => setHovered(c.name)}
                                            onMouseLeave={() => setHovered(null)}
                                            onFocus={() => setHovered(c.name)}
                                            onBlur={() => setHovered(null)}
                                            onClick={() => togglePinned(c.name)}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePinned(c.name); } }}
                                        />
                                    );
                                })}
                            </g>
                        </svg>
                        <div className="dash-donut-center" aria-live="polite">
                            {focus ? (
                                <>
                                    <span className="dash-donut-label">
                                        <i style={{ background: focus.color }} />{focus.name}
                                    </span>
                                    <strong className="num">{fmt(focus.amount)}</strong>
                                    <span className="dash-donut-share">{percentText(focus.share)} výdajů</span>
                                </>
                            ) : (
                                <>
                                    <span className="dash-donut-label">Výdaje celkem</span>
                                    <strong className="num">{fmt(total)}</strong>
                                    <span className="dash-donut-share">{items.length} {items.length === 1 ? 'kategorie' : items.length < 5 ? 'kategorie' : 'kategorií'}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <ul className="dash-legend">
                        {items.map(c => (
                            <li
                                key={c.name}
                                className={`dash-legend-row${focus?.name === c.name ? ' active' : ''}`}
                                onMouseEnter={() => setHovered(c.name)}
                                onMouseLeave={() => setHovered(null)}
                                onClick={() => togglePinned(c.name)}
                            >
                                <span className="dash-legend-dot" style={{ background: c.color }} />
                                <span className="dash-legend-name">{c.name}</span>
                                <span className="dash-legend-share">{percentText(c.share)}</span>
                                <span className="dash-legend-amount num">{fmt(c.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <Link href="/reports" className="dash-link">
                Všechny kategorie <ArrowIcon size={12} />
            </Link>
        </div>
    );
}
