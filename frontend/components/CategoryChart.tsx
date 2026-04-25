'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

interface CategoryChartProps {
    categories: Record<string, number>;
    currency?: string;
}

interface Category {
    id: number;
    name: string;
    icon: string;
    color: string;
}

const FALLBACK_COLORS: Record<string, string> = {
    'Food': '#ef4444', 'Transport': '#f97316', 'Utilities': '#eab308',
    'Entertainment': '#22c55e', 'Shopping': '#14b8a6', 'Investment': '#3b82f6',
    'Dividend': '#8b5cf6', 'Salary': '#10b981',
    'Internal Transfer': '#6b7280', 'Family Transfer': '#6b7280', 'Other': '#6b7280',
};

const FALLBACK_ICONS: Record<string, string> = {
    'Food': '🛒', 'Transport': '🚗', 'Utilities': '🏠',
    'Entertainment': '🎬', 'Shopping': '🛍️', 'Investment': '📈',
    'Salary': '💰', 'Other': '•',
};

export default function CategoryChart({ categories, currency = 'CZK' }: CategoryChartProps) {
    const [categoryMeta, setCategoryMeta] = useState<Record<string, { color: string; icon: string }>>({});

    useEffect(() => {
        fetch(`${API_BASE}/categories/`)
            .then(res => res.json())
            .then((data: Category[]) => {
                const safeData = Array.isArray(data) ? data : [];
                const meta = safeData.reduce((acc, cat) => {
                    acc[cat.name] = { color: cat.color, icon: cat.icon };
                    return acc;
                }, {} as Record<string, { color: string; icon: string }>);
                setCategoryMeta(meta);
            })
            .catch(() => {});
    }, []);

    const getColor = (name: string) => categoryMeta[name]?.color || FALLBACK_COLORS[name] || '#6b7280';
    const getIcon = (name: string) => categoryMeta[name]?.icon || FALLBACK_ICONS[name] || '•';

    const fmt = (amount: number) =>
        new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    // Only expense categories (negative → stored as positive in categories)
    const sorted = Object.entries(categories)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-3)', fontSize: 13 }}>
                Žádné výdaje k zobrazení
            </div>
        );
    }

    const max = sorted[0][1];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Stacked bar at top */}
            <div style={{ display: 'flex', height: 8, borderRadius: 'var(--radius-full)', overflow: 'hidden', gap: 1 }}>
                {sorted.slice(0, 8).map(([name, amount]) => {
                    const total = sorted.reduce((s, [, v]) => s + v, 0);
                    return (
                        <div key={name}
                            style={{ width: `${(amount / total) * 100}%`, background: getColor(name), transition: 'width 0.5s' }}
                            title={`${name}: ${fmt(amount)}`}
                        />
                    );
                })}
            </div>

            {/* Category rows */}
            {sorted.slice(0, 7).map(([name, amount]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: getColor(name) + '22',
                        display: 'grid', placeItems: 'center', fontSize: 14,
                    }}>
                        {getIcon(name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 510, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            <span className="num" style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0, marginLeft: 8 }}>{fmt(amount)}</span>
                        </div>
                        <div className="progress">
                            <span style={{ width: `${(amount / max) * 100}%`, background: getColor(name) }} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
