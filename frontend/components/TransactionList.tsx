import { Transaction } from '@/lib/api';

interface TransactionListProps {
    transactions: Transaction[];
    showAccount?: boolean;
}

const categoryIcons: Record<string, string> = {
    'Food': '🍔',
    'Transport': '🚗',
    'Utilities': '💡',
    'Entertainment': '🎬',
    'Shopping': '🛒',
    'Salary': '💰',
    'Investment': '📈',
    'Dividend': '💵',
    'Other': '📋',
};

export default function TransactionList({ transactions, showAccount = false }: TransactionListProps) {
    const formatCurrency = (amount: number, currency: string = 'CZK') => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('cs-CZ', {
            day: 'numeric',
            month: 'short',
        }).format(date);
    };

    if (transactions.length === 0) {
        return (
            <div className="glass glass-card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                <p className="text-secondary">Žádné transakce k zobrazení</p>
            </div>
        );
    }

    return (
        <div className="transaction-list">
            {transactions.map((tx) => (
                <div key={tx.id} className="transaction-item animate-fade-in">
                    <div className="transaction-icon">
                        {categoryIcons[tx.category || 'Other'] || '📋'}
                    </div>
                    <div className="transaction-details">
                        <div className="transaction-name">{tx.description}</div>
                        <div className="transaction-date">
                            {formatDate(tx.date)}
                            {showAccount && tx.account_type && (
                                <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                                    • {tx.account_type === 'bank' ? '🏦' : '📈'}
                                </span>
                            )}
                            {tx.category && (
                                <span style={{ marginLeft: '8px' }}>{tx.category}</span>
                            )}
                        </div>
                    </div>
                    <div className={`transaction-amount ${tx.amount >= 0 ? 'income' : 'expense'}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                    </div>
                </div>
            ))}
        </div>
    );
}
