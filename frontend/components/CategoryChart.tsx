'use client';

import { useEffect, useState } from 'react';

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

// Fallback colors
const FALLBACK_COLORS: Record<string, string> = {
    'Food': '#ef4444',
    'Transport': '#f97316',
    'Utilities': '#eab308',
    'Entertainment': '#22c55e',
    'Shopping': '#14b8a6',
    'Investment': '#3b82f6',
    'Dividend': '#8b5cf6',
    'Salary': '#10b981',
    'Internal Transfer': '#6b7280',
    'Family Transfer': '#6b7280',
    'Other': '#6b7280',
};

export default function CategoryChart({ categories, currency = 'CZK' }: CategoryChartProps) {
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>(FALLBACK_COLORS);

    useEffect(() => {
        fetch('http://localhost:8000/api/categories')
            .then(res => res.json())
            .then((data: Category[]) => {
                const colors = data.reduce((acc, cat) => {
                    acc[cat.name] = cat.color;
                    return acc;
                }, { ...FALLBACK_COLORS } as Record<string, string>);
                setCategoryColors(colors);
            })
            .catch(err => console.error('Failed to load categories:', err));
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);

    if (sortedCategories.length === 0) {
        return (
            <div className="chart-container">
                <p>Žádná data k zobrazení</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            {/* Simple bar chart */}
            <div style={{ display: 'flex', height: '12px', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                {sortedCategories.map(([category, amount]) => (
                    <div
                        key={category}
                        style={{
                            width: `${(amount / total) * 100}%`,
                            backgroundColor: categoryColors[category] || categoryColors['Other'] || '#6b7280',
                            transition: 'width var(--transition-normal)',
                        }}
                        title={`${category}: ${formatCurrency(amount)}`}
                    />
                ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                {sortedCategories.map(([category, amount]) => (
                    <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                        <div
                            style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '4px',
                                backgroundColor: categoryColors[category] || categoryColors['Other'] || '#6b7280',
                            }}
                        />
                        <span style={{ fontSize: '0.875rem' }}>
                            {category}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            {formatCurrency(amount)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

