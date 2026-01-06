interface CategoryChartProps {
    categories: Record<string, number>;
    currency?: string;
}

const categoryColors: Record<string, string> = {
    'Food': '#FF6B6B',
    'Transport': '#4ECDC4',
    'Utilities': '#FFE66D',
    'Entertainment': '#95E1D3',
    'Shopping': '#F38181',
    'Investment': '#AA96DA',
    'Dividend': '#A8D8EA',
    'Other': '#9B9B9B',
};

export default function CategoryChart({ categories, currency = 'CZK' }: CategoryChartProps) {
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
                            backgroundColor: categoryColors[category] || categoryColors['Other'],
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
                                backgroundColor: categoryColors[category] || categoryColors['Other'],
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
