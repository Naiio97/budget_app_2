interface StatCardProps {
    label: string;
    value: string | number;
    change?: {
        value: number;
        label?: string;
    };
    icon?: string;
    currency?: string;
}

export default function StatCard({ label, value, change, icon, currency = 'CZK' }: StatCardProps) {
    const formatValue = () => {
        if (typeof value === 'number') {
            return new Intl.NumberFormat('cs-CZ', {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(value);
        }
        return value;
    };

    return (
        <div className="glass glass-card stat-card animate-fade-in">
            {icon && (
                <span style={{ fontSize: '1.5rem', marginBottom: 'var(--spacing-xs)' }}>
                    {icon}
                </span>
            )}
            <div className="stat-label">{label}</div>
            <div className="stat-value">{formatValue()}</div>
            {change && (
                <div className={`stat-change ${change.value >= 0 ? 'positive' : 'negative'}`}>
                    {change.value >= 0 ? '↑' : '↓'} {Math.abs(change.value).toFixed(1)}%
                    {change.label && <span style={{ marginLeft: '4px' }}>{change.label}</span>}
                </div>
            )}
        </div>
    );
}
