'use client';

import Link from 'next/link';
import ArrowIcon from './ArrowIcon';

interface CategoryChartProps {
    categories: Record<string, number>;
    currency?: string;
}

// Tlumená paleta — kategorie se rozlišují pořadím, ne křiklavými barvami z databáze.
const BAR_COLORS = ['#6a9fd0', '#b8a56a', '#9d92c9', '#a3acba', '#7fbf9e', '#d09a8a', '#7fb8c4'];

const TOP = 5;

export default function CategoryChart({ categories, currency = 'CZK' }: CategoryChartProps) {
    const fmt = (amount: number) =>
        new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    const sorted = Object.entries(categories)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);

    const top = sorted.slice(0, TOP);
    const max = top[0]?.[1] ?? 1;

    return (
        <div className="dash-card dash-cats">
            <div className="dash-card-head">
                <h3>Kam míří peníze</h3>
                <Link href="/reports" className="dash-arrow-link" aria-label="Přehledy výdajů">
                    <ArrowIcon />
                </Link>
            </div>

            {top.length === 0 ? (
                <div className="dash-empty">Žádné výdaje k zobrazení</div>
            ) : (
                <div className="dash-cat-list">
                    {top.map(([name, amount], i) => (
                        <div key={name} className="dash-cat">
                            <div className="dash-cat-row">
                                <span className="dash-cat-name">{name.trim()}</span>
                                <span className="dash-cat-amount num">{fmt(amount)}</span>
                            </div>
                            <div className="dash-cat-track">
                                <span style={{ width: `${(amount / max) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Link href="/reports" className="dash-link">
                Všechny kategorie <ArrowIcon size={12} />
            </Link>
        </div>
    );
}
