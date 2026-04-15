import {
    Account, Transaction, DashboardData, BalanceHistory, Portfolio,
    NetWorthHistory, SyncStatus, ApiKeysResponse,
    InvestmentPortfolio, Budget, BudgetOverview,
    SavingsGoal, PaginatedResponse
} from './api';

const generateTransactions = (count: number): Transaction[] => {
    return Array.from({ length: count }).map((_, i) => ({
        id: `txn-${i}`,
        date: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
        description: ['Nákup potravin', 'Nájem', 'Výplata', 'Netflix', 'Káva', 'Tankování'][Math.floor(Math.random() * 6)],
        amount: (Math.random() > 0.8 ? 1 : -1) * (Math.floor(Math.random() * 3000) + 100),
        currency: 'CZK',
        category: ['Jídlo', 'Bydlení', 'Příjem', 'Zábava', 'Doprava'][Math.floor(Math.random() * 5)],
        account_id: `acc-${(i % 3) + 1}`,
        account_type: 'bank',
        account_name: 'Běžný účet',
    }));
};

export const MOCK_DASHBOARD: DashboardData = {
    summary: {
        total_balance: 154200.50,
        bank_balance: 45200.50,
        investment_balance: 109000.00,
        currency: 'CZK',
        accounts_count: 3
    },
    monthly: {
        income: 65000,
        expenses: 42000,
        savings: 23000
    },
    categories: {
        'Bydlení': 18000,
        'Jídlo': 9500,
        'Doprava': 4500,
        'Zábava': 3000,
        'Ostatní': 7000
    },
    recent_transactions: generateTransactions(5),
    accounts: [
        { id: 'acc-1', name: 'Běžný účet', type: 'bank', balance: 25000, currency: 'CZK', institution: 'airbank' },
        { id: 'acc-2', name: 'Spořicí účet', type: 'bank', balance: 20200.50, currency: 'CZK', institution: 'csas' },
        { id: 'inv-1', name: 'Akcie a ETF', type: 'investment', balance: 109000, currency: 'CZK', institution: 'trading212' },
    ]
};

export const MOCK_ACCOUNTS: Account[] = MOCK_DASHBOARD.accounts;

export const MOCK_TRANSACTIONS: PaginatedResponse<Transaction> = {
    items: generateTransactions(20),
    total: 20,
    page: 1,
    size: 20,
    pages: 1
};

export const MOCK_BALANCE_HISTORY: BalanceHistory = {
    history: Array.from({ length: 30 }).map((_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        balance: 100000 + Math.floor(Math.random() * 60000)
    }))
};

export const MOCK_NET_WORTH: NetWorthHistory = {
    history: Array.from({ length: 30 }).map((_, i) => {
        const bank = 40000 + Math.floor(Math.random() * 10000);
        const investment = 90000 + (i * 1000) + Math.floor(Math.random() * 5000);
        return {
            date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            bank,
            investment,
            total: bank + investment
        };
    }),
    currency: 'CZK'
};

export const MOCK_BUDGET_OVERVIEW: BudgetOverview = {
    month: '2026-03',
    month_name: 'Březen',
    total_budget: 40000,
    total_spent: 32000,
    total_percentage: 80,
    categories: [
        { category: 'Bydlení', amount: 18000, spent: 18000, percentage: 100 },
        { category: 'Jídlo', amount: 10000, spent: 9500, percentage: 95 },
        { category: 'Doprava', amount: 5000, spent: 4500, percentage: 90 },
    ],
    categories_count: 3
};

export const MOCK_BUDGETS: Budget[] = [
    { id: 1, category: 'Bydlení', amount: 18000, currency: 'CZK', is_active: true, spent: 18000, percentage: 100 },
    { id: 2, category: 'Jídlo', amount: 10000, currency: 'CZK', is_active: true, spent: 9500, percentage: 95 },
    { id: 3, category: 'Doprava', amount: 5000, currency: 'CZK', is_active: true, spent: 4500, percentage: 90 },
];

export const MOCK_GOALS: SavingsGoal[] = [
    { id: 1, name: 'Nové auto', target_amount: 300000, current_amount: 150000, currency: 'CZK', deadline: '2026-12-31', is_completed: false, percentage: 50 },
    { id: 2, name: 'Dovolená', target_amount: 50000, current_amount: 45000, currency: 'CZK', deadline: '2026-06-30', is_completed: false, percentage: 90 },
];

export const MOCK_PORTFOLIO: Portfolio = {
    total_value: 109000,
    total_profit: 15000,
    positions: [
        { ticker: 'AAPL', quantity: 10, average_price: 150, current_price: 180, value: 1800, profit: 300, profit_percent: 20 },
        { ticker: 'VWCE', quantity: 50, average_price: 95, current_price: 110, value: 5500, profit: 750, profit_percent: 15.7 },
    ]
};

export const MOCK_INVESTMENT_PORTFOLIO: InvestmentPortfolio = {
    total_value: 109000,
    currency: 'CZK',
    last_synced: new Date().toISOString(),
    transactions: [
        { id: 'inv-txn-1', date: '2026-03-01', description: 'Nákup VWCE', amount: -5000, currency: 'CZK', category: 'Nákup cenných papírů' },
        { id: 'inv-txn-2', date: '2026-02-15', description: 'Dividenda AAPL', amount: 350, currency: 'CZK', category: 'Dividendy' },
    ]
};

export const MOCK_API_KEYS: ApiKeysResponse = {
    gocardless_secret_id: 'mock-id',
    gocardless_secret_key: 'mock-key',
    trading212_api_key: 'mock-t212-key',
    has_gocardless: true,
    has_trading212: true
};

export const MOCK_SYNC_STATUS: SyncStatus = {
    status: 'completed',
    last_sync: new Date().toISOString(),
    accounts_synced: 3,
    transactions_synced: 156,
    syncs_today: 1,
};
