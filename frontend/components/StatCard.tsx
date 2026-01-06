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
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(value);
        }
        return value;
    };

    return (
        <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                {icon && <span style={{ fontSize: '1.25rem' }}>{icon}</span>}
                <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0 }}>{label}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{formatValue()}</div>
                {change && (
                    <div className={`stat-change ${change.value >= 0 ? 'positive' : 'negative'}`}>
                        {change.value >= 0 ? '↑' : '↓'} {Math.abs(change.value).toFixed(1)}%
                    </div>
                )}
            </div>
        </div>
    );
}
