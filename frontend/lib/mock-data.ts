import {
    Account, Transaction, DashboardData, BalanceHistory, Portfolio,
    NetWorthHistory, SyncStatus, ApiKeysResponse,
    InvestmentPortfolio, Budget, BudgetOverview,
    SavingsGoal, PaginatedResponse, Contact,
    Pie, InvestmentPortfolioDetail, PortfolioHistory,
    ManualInvestmentAccount,
    Loan, LoanPayment, LoansSummary,
    Subscription, SubscriptionsSummary, DetectedSubscription
} from './api';

const currentYearMonth = () => new Date().toISOString().slice(0, 7);

const TX_TEMPLATES: Array<{ description: string; category: string; sign: 1 | -1; min: number; max: number }> = [
    { description: 'Lidl', category: 'Food', sign: -1, min: 250, max: 1800 },
    { description: 'Albert', category: 'Food', sign: -1, min: 180, max: 1400 },
    { description: 'Kavárna Etage', category: 'Food', sign: -1, min: 80, max: 250 },
    { description: 'Wolt', category: 'Food', sign: -1, min: 180, max: 450 },
    { description: 'Nájem', category: 'Utilities', sign: -1, min: 14000, max: 14000 },
    { description: 'Vodafone CZ', category: 'Utilities', sign: -1, min: 349, max: 649 },
    { description: 'ČEZ', category: 'Utilities', sign: -1, min: 1200, max: 2400 },
    { description: 'Netflix', category: 'Entertainment', sign: -1, min: 269, max: 269 },
    { description: 'Spotify', category: 'Entertainment', sign: -1, min: 169, max: 169 },
    { description: 'Shell', category: 'Transport', sign: -1, min: 1200, max: 2200 },
    { description: 'DPP', category: 'Transport', sign: -1, min: 39, max: 130 },
    { description: 'Alza.cz', category: 'Shopping', sign: -1, min: 350, max: 4500 },
    { description: 'Výplata', category: 'Salary', sign: 1, min: 65000, max: 68000 },
    { description: 'Bokovka — fakturace', category: 'Salary', sign: 1, min: 6000, max: 9000 },
];

// A couple of dimmed family/internal transfers thrown in so the UI shows the
// gray-out treatment in context, instead of every row looking the same.
const SPECIAL_TX: Array<{ description: string; category: string; amount: number; transaction_type: 'family_transfer' | 'internal_transfer' }> = [
    { description: 'Převod Sandri', category: 'Family Transfer', amount: -3500, transaction_type: 'family_transfer' },
    { description: 'Spořicí účet (interní)', category: 'Internal Transfer', amount: -5000, transaction_type: 'internal_transfer' },
];

const generateTransactions = (count: number): Transaction[] => {
    const result: Transaction[] = [];
    for (let i = 0; i < count; i++) {
        const isSpecial = i % 9 === 4 || i % 9 === 7; // ~2 of every 9 are transfers
        if (isSpecial) {
            const tpl = SPECIAL_TX[i % SPECIAL_TX.length];
            result.push({
                id: `txn-${i}`,
                date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                description: tpl.description,
                amount: tpl.amount,
                currency: 'CZK',
                category: tpl.category,
                account_id: `acc-${(i % 3) + 1}`,
                account_type: 'bank',
                account_name: 'Běžný účet',
                transaction_type: tpl.transaction_type,
                is_excluded: true,
            });
            continue;
        }
        const tpl = TX_TEMPLATES[i % TX_TEMPLATES.length];
        const range = tpl.max - tpl.min;
        const amount = tpl.sign * (tpl.min + (range > 0 ? Math.floor(((i * 37) % 100) / 100 * range) : 0));
        result.push({
            id: `txn-${i}`,
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: tpl.description,
            amount,
            currency: 'CZK',
            category: tpl.category,
            account_id: `acc-${(i % 3) + 1}`,
            account_type: 'bank',
            account_name: 'Běžný účet',
            transaction_type: 'normal',
            is_excluded: false,
        });
    }
    return result;
};

function buildMockTransactionDetail(id: string) {
    // Try to find the tx in our generated list so the modal matches what the
    // user clicked. Falls back to a generic record if id is unknown.
    const tx = MOCK_TRANSACTIONS.items.find(t => t.id === id) ?? MOCK_TRANSACTIONS.items[0];
    return {
        id: tx.id,
        date: tx.date,
        value_date: tx.date,
        booking_date_time: `${tx.date}T10:23:00`,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        category: tx.category ?? null,
        account_id: tx.account_id,
        account_name: tx.account_name ?? null,
        account_type: tx.account_type,
        transaction_type: tx.transaction_type ?? 'normal',
        is_excluded: tx.is_excluded ?? false,
        creditor_name: tx.amount < 0 ? tx.description : null,
        debtor_name: tx.amount > 0 ? tx.description : null,
        creditor_iban: tx.amount < 0 ? 'CZ6520100000002049290001' : null,
        debtor_iban: tx.amount > 0 ? 'CZ1234567890123456789012' : null,
        counterparty_name_source: 'bank' as const,
        remittance_info: `Demo poznámka pro ${tx.description}`,
        end_to_end_id: `END-${tx.id}`,
        bank_tx_code: 'PMNT-RCDT-ESCT',
        additional_info: null,
        balance_after: 25000,
        balance_after_currency: 'CZK',
        fx_rate: null,
        fx_source_currency: null,
        fx_target_currency: null,
    };
}

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
    month: currentYearMonth(),
    month_name: 'Aktuální měsíc',
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

export const MOCK_LOANS: Loan[] = [
    {
        id: 1, name: 'Hypotéka', principal: 2500000, interest_rate: 5.9, term_months: 360,
        monthly_payment: 14834, start_date: '2024-01-15', currency: 'CZK',
        match_pattern: null, note: 'Byt', is_active: true,
        paid_count: 29, paid_principal: 121430, remaining_balance: 2378570,
        total_interest: 2840240, next_due_date: '2026-07-15', end_date: '2053-12-15',
        progress_percentage: 8.1,
        current_payment_id: null, current_due_date: null, current_paid: false,
    },
    {
        id: 2, name: 'Auto', principal: 450000, interest_rate: 7.5, term_months: 60,
        monthly_payment: 9016, start_date: '2025-03-10', currency: 'CZK',
        match_pattern: null, note: null, is_active: true,
        paid_count: 15, paid_principal: 102340, remaining_balance: 347660,
        total_interest: 90960, next_due_date: '2026-07-10', end_date: '2030-02-10',
        progress_percentage: 25,
        current_payment_id: null, current_due_date: null, current_paid: false,
    },
];

export const MOCK_LOANS_SUMMARY: LoansSummary = {
    active_loans: 2,
    total_monthly_payment: 23850,
    total_remaining_balance: 2726230,
    total_principal: 2950000,
    currency: 'CZK',
};

export const MOCK_LOAN_SCHEDULE: LoanPayment[] = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const interest = Math.round(2378570 * (5.9 / 100 / 12));
    const principalPart = 14834 - interest;
    const month = ((n - 1) % 12) + 1;
    const year = 2026 + Math.floor((n - 1) / 12);
    return {
        id: n,
        installment_number: n,
        due_date: `${year}-${String(month).padStart(2, '0')}-15`,
        amount: 14834,
        principal_part: principalPart,
        interest_part: interest,
        remaining_balance: 2378570 - principalPart * n,
        is_paid: n <= 2,
        matched_transaction_id: null,
    };
});

const daysFromNow = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

export const MOCK_SUBSCRIPTIONS: Subscription[] = [
    {
        id: 1, name: 'Vodafone', merchant_pattern: 'vodafone', amount: 649, currency: 'CZK',
        period: 'monthly', category: 'Utilities', first_seen_date: daysFromNow(-400), note: null, is_active: true,
        my_percentage: 100, my_amount_override: null, my_amount: 649,
        monthly_equivalent: 649, yearly_cost: 7788, my_monthly_equivalent: 649, my_yearly_cost: 7788,
        last_charged_date: daysFromNow(-26), last_amount: 649, charges_count: 13,
        next_due_date: daysFromNow(4), renewing_soon: true, is_stale: false,
        price_change_from: null, price_change_to: null,
    },
    {
        id: 2, name: 'Netflix', merchant_pattern: 'netflix', amount: 319, currency: 'CZK',
        period: 'monthly', category: 'Entertainment', first_seen_date: daysFromNow(-700), note: null, is_active: true,
        my_percentage: 100, my_amount_override: null, my_amount: 319,
        monthly_equivalent: 319, yearly_cost: 3828, my_monthly_equivalent: 319, my_yearly_cost: 3828,
        last_charged_date: daysFromNow(-12), last_amount: 319, charges_count: 23,
        next_due_date: daysFromNow(18), renewing_soon: false, is_stale: false,
        price_change_from: 269, price_change_to: 319,
    },
    {
        id: 3, name: 'Spotify', merchant_pattern: 'spotify', amount: 169, currency: 'CZK',
        period: 'monthly', category: 'Entertainment', first_seen_date: daysFromNow(-900), note: 'Family plán — sdíleno napůl', is_active: true,
        my_percentage: 50, my_amount_override: null, my_amount: 84.5,
        monthly_equivalent: 169, yearly_cost: 2028, my_monthly_equivalent: 84.5, my_yearly_cost: 1014,
        last_charged_date: daysFromNow(-8), last_amount: 169, charges_count: 29,
        next_due_date: daysFromNow(22), renewing_soon: false, is_stale: false,
        price_change_from: null, price_change_to: null,
    },
    {
        id: 4, name: 'iCloud+', merchant_pattern: 'apple.com/bill', amount: 990, currency: 'CZK',
        period: 'yearly', category: 'Utilities', first_seen_date: daysFromNow(-500), note: null, is_active: true,
        my_percentage: 100, my_amount_override: null, my_amount: 990,
        monthly_equivalent: 82.5, yearly_cost: 990, my_monthly_equivalent: 82.5, my_yearly_cost: 990,
        last_charged_date: daysFromNow(-140), last_amount: 990, charges_count: 2,
        next_due_date: daysFromNow(225), renewing_soon: false, is_stale: false,
        price_change_from: null, price_change_to: null,
    },
    {
        id: 5, name: 'HBO Max', merchant_pattern: 'hbo', amount: 199, currency: 'CZK',
        period: 'monthly', category: 'Entertainment', first_seen_date: daysFromNow(-600), note: null, is_active: true,
        my_percentage: 100, my_amount_override: null, my_amount: 199,
        monthly_equivalent: 199, yearly_cost: 2388, my_monthly_equivalent: 199, my_yearly_cost: 2388,
        last_charged_date: daysFromNow(-95), last_amount: 199, charges_count: 16,
        next_due_date: daysFromNow(-65), renewing_soon: false, is_stale: true,
        price_change_from: null, price_change_to: null,
    },
];

export const MOCK_SUBSCRIPTIONS_SUMMARY: SubscriptionsSummary = {
    active_count: 5,
    monthly_total: 1418.5,
    yearly_total: 17022,
    my_monthly_total: 1334,
    my_yearly_total: 16008,
    currency: 'CZK',
};

export const MOCK_SUBSCRIPTIONS_DETECT: DetectedSubscription[] = [
    {
        name: 'Audioteka', merchant_pattern: 'audioteka', amount: 349, currency: 'CZK',
        period: 'monthly', category: 'Entertainment', occurrences: 6, avg_interval_days: 30,
        first_seen_date: daysFromNow(-180), last_charged_date: daysFromNow(-14),
        next_due_estimate: daysFromNow(16),
    },
    {
        name: 'Allianz pojišťovna', merchant_pattern: 'allianz', amount: 2450, currency: 'CZK',
        period: 'quarterly', category: 'Utilities', occurrences: 4, avg_interval_days: 91,
        first_seen_date: daysFromNow(-370), last_charged_date: daysFromNow(-40),
        next_due_estimate: daysFromNow(51),
    },
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

// === Demo fixtures added for full page coverage ===

export const MOCK_CATEGORIES = [
    { id: 1, name: 'Food', icon: '🍔', color: '#ef4444', order_index: 0, is_income: false, is_active: true },
    { id: 2, name: 'Transport', icon: '🚗', color: '#f97316', order_index: 1, is_income: false, is_active: true },
    { id: 3, name: 'Utilities', icon: '💡', color: '#eab308', order_index: 2, is_income: false, is_active: true },
    { id: 4, name: 'Entertainment', icon: '🎬', color: '#22c55e', order_index: 3, is_income: false, is_active: true },
    { id: 5, name: 'Shopping', icon: '🛒', color: '#14b8a6', order_index: 4, is_income: false, is_active: true },
    { id: 6, name: 'Investment', icon: '📈', color: '#3b82f6', order_index: 5, is_income: false, is_active: true },
    { id: 7, name: 'Dividend', icon: '💵', color: '#8b5cf6', order_index: 6, is_income: true, is_active: true },
    { id: 8, name: 'Salary', icon: '💰', color: '#10b981', order_index: 7, is_income: true, is_active: true },
    { id: 9, name: 'Internal Transfer', icon: '🔄', color: '#6b7280', order_index: 8, is_income: false, is_active: true },
    { id: 10, name: 'Other', icon: '📦', color: '#6b7280', order_index: 9, is_income: false, is_active: true },
];

export const MOCK_MONTHLY_BUDGET = {
    id: 1,
    year_month: currentYearMonth(),
    income_items: [
        { id: 1, name: 'Výplata', amount: 65000, order_index: 0, is_salary: true },
        { id: 2, name: 'Bokovka', amount: 8000, order_index: 1, is_salary: false },
    ],
    investment_amount: 10000,
    surplus_to_savings: 5000,
    is_closed: false,
    total_income: 73000,
    total_expenses: 42000,
    remaining: 21000,
    expenses: [
        { id: 1, name: 'Nájem + Služby', amount: 18000, my_percentage: 50, my_amount: 9000, my_amount_override: null, is_paid: true, is_auto_paid: true, matched_transaction_id: 'txn-1', recurring_expense_id: 1 },
        { id: 2, name: 'Internet', amount: 599, my_percentage: 100, my_amount: 599, my_amount_override: null, is_paid: true, is_auto_paid: true, matched_transaction_id: 'txn-2', recurring_expense_id: 2 },
        { id: 3, name: 'Netflix', amount: 349, my_percentage: 100, my_amount: 349, my_amount_override: null, is_paid: false, is_auto_paid: false, matched_transaction_id: null, recurring_expense_id: 3 },
        { id: 4, name: 'Telefon', amount: 649, my_percentage: 100, my_amount: 349, my_amount_override: 349, is_paid: false, is_auto_paid: false, matched_transaction_id: null, recurring_expense_id: 4 },
        { id: 5, name: 'Peníze na život', amount: 10000, my_percentage: 100, my_amount: 10000, my_amount_override: null, is_paid: false, is_auto_paid: false, matched_transaction_id: null, recurring_expense_id: null },
        { id: 6, name: 'Palivo', amount: 1500, my_percentage: 100, my_amount: 1500, my_amount_override: null, is_paid: false, is_auto_paid: false, matched_transaction_id: null, recurring_expense_id: null },
    ],
};

export const MOCK_RECURRING_EXPENSES = [
    { id: 1, name: 'Nájem + Služby', default_amount: 18000, my_percentage: 50, is_auto_paid: true, match_pattern: 'nájem', category: 'Bydlení', order_index: 0, is_active: true },
    { id: 2, name: 'Internet', default_amount: 599, my_percentage: 100, is_auto_paid: true, match_pattern: 'internet', category: 'Utilities', order_index: 1, is_active: true },
    { id: 3, name: 'Netflix', default_amount: 349, my_percentage: 100, is_auto_paid: false, match_pattern: 'netflix', category: 'Entertainment', order_index: 2, is_active: true },
    { id: 4, name: 'Telefon', default_amount: 649, my_percentage: 100, is_auto_paid: false, match_pattern: 'o2', category: 'Utilities', order_index: 3, is_active: true },
];

const buildMonthsForYear = (year: number) => {
    const months = [];
    for (let m = 1; m <= 12; m++) {
        const income = m <= 5 ? 73000 + Math.floor(Math.random() * 5000) : 0;
        const expenses = m <= 5 ? 42000 + Math.floor(Math.random() * 6000) : 0;
        const investments = m <= 5 ? 10000 : 0;
        const savings = m <= 5 ? 5000 : 0;
        months.push({
            month: m,
            year_month: `${year}-${String(m).padStart(2, '0')}`,
            income, expenses, investments, savings,
            remaining: income - expenses - investments,
        });
    }
    return months;
};

export const MOCK_ANNUAL_OVERVIEW = (year: number) => {
    const months = buildMonthsForYear(year);
    const totals = months.reduce((acc, m) => ({
        income: acc.income + m.income,
        expenses: acc.expenses + m.expenses,
        investments: acc.investments + m.investments,
        savings: acc.savings + m.savings,
        net: 0,
    }), { income: 0, expenses: 0, investments: 0, savings: 0, net: 0 });
    totals.net = totals.income - totals.expenses;
    return {
        year,
        months,
        totals,
        previous_year: { income: 740000, expenses: 480000, investments: 100000, savings: 60000, net: 260000 },
        expense_breakdown: { 'Nájem + Služby': 90000, Internet: 2995, Netflix: 1745, Telefon: 3245, 'Peníze na život': 50000, Palivo: 7500 },
        averages: { income: totals.income / 12, expenses: totals.expenses / 12, investments: totals.investments / 12 },
    };
};

export const MOCK_MANUAL_ACCOUNTS = [
    {
        id: 1,
        name: 'Spořicí účet',
        account_number: '2049290001/6000',
        balance: 85000,
        currency: 'CZK',
        is_visible: true,
        my_balance: 85000,
        envelopes: [
            { id: 1, name: 'Rezerva', amount: 30000, is_mine: true, note: '3 měsíční rezerva' },
            { id: 2, name: 'Dovolená', amount: 15000, is_mine: true, note: null },
        ],
    },
    {
        id: 2,
        name: 'Hotovost',
        account_number: null,
        balance: 2500,
        currency: 'CZK',
        is_visible: true,
        my_balance: 2500,
        envelopes: [],
    },
];

export const MOCK_CONTACTS: Contact[] = [
    { iban: 'CZ6520100000002049290001', name: 'Spořicí účet', source: 'manual', note: null },
    { iban: 'CZ1234567890123456789012', name: 'Maminka', source: 'manual', note: 'Měsíční převod' },
];

export const MOCK_MONTHLY_REPORT = {
    monthly_totals: Array.from({ length: 6 }).map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        return {
            month: d.toISOString().slice(0, 7),
            income: 65000 + Math.floor(Math.random() * 8000),
            expenses: 40000 + Math.floor(Math.random() * 8000),
            balance: 20000,
        };
    }),
    category_breakdown: [
        { month: currentYearMonth(), category: 'Bydlení', amount: 18000 },
        { month: currentYearMonth(), category: 'Jídlo', amount: 9500 },
        { month: currentYearMonth(), category: 'Doprava', amount: 4500 },
    ],
    categories: ['Bydlení', 'Jídlo', 'Doprava'],
    currency: 'CZK',
};

export const MOCK_CATEGORY_RULES = {
    rules: [
        { id: 1, pattern: 'lidl', category: 'Food', is_user_defined: true, match_count: 23 },
        { id: 2, pattern: 'shell', category: 'Transport', is_user_defined: true, match_count: 8 },
        { id: 3, pattern: 'netflix', category: 'Entertainment', is_user_defined: false, match_count: 5 },
    ],
};

export const MOCK_FAMILY_ACCOUNTS = {
    accounts: [{ pattern: 'sandri', name: 'Partner' }],
};

export const MOCK_MY_ACCOUNT_PATTERNS = {
    patterns: ['spořící', 'savings'],
};

export const MOCK_POSITIONS = {
    positions: [
        { ticker: 'VWCE', quantity: 50, average_price_eur: 95, current_price_eur: 110, value_czk: 137500, invested_czk: 118750, ppl_czk: 18750, ppl_pct: 15.8 },
        { ticker: 'AAPL', quantity: 10, average_price_eur: 150, current_price_eur: 180, value_czk: 45000, invested_czk: 37500, ppl_czk: 7500, ppl_pct: 20 },
    ],
    currency: 'CZK',
};

export const MOCK_PIES: { pies: Pie[]; currency: string } = {
    pies: [
        {
            id: 1, name: 'Růst', icon: '📈', goal: 500000,
            invested_czk: 200000, value_czk: 240000, result_czk: 40000, result_pct: 20,
            instruments: [
                { ticker: 'VWCE', current_share: 70, value_czk: 168000, result_czk: 25000 },
                { ticker: 'AAPL', current_share: 30, value_czk: 72000, result_czk: 15000 },
            ],
        },
    ],
    currency: 'CZK',
};

export const MOCK_PORTFOLIO_DETAIL: InvestmentPortfolioDetail = {
    total_value: 109000,
    invested: 93000,
    result: 16000,
    cash_free: 5000,
    currency: 'CZK',
    last_synced: new Date().toISOString(),
};

export const MOCK_PORTFOLIO_HISTORY: PortfolioHistory = {
    history: Array.from({ length: 30 }).map((_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        value: 95000 + (i * 500) + Math.floor(Math.random() * 4000),
    })),
    currency: 'CZK',
};

export const MOCK_MANUAL_INVESTMENTS: ManualInvestmentAccount[] = [
    {
        id: 1, name: 'Krypto', currency: 'CZK', note: null, is_visible: true,
        total_value: 28000, invested: 20000, pnl: 8000, pnl_pct: 40,
        positions: [
            { id: 1, name: 'Bitcoin', quantity: 0.01, avg_buy_price: 1500000, current_value: 18000, currency: 'CZK', note: null, invested: 15000, pnl: 3000, pnl_pct: 20 },
            { id: 2, name: 'Ethereum', quantity: 0.2, avg_buy_price: 25000, current_value: 10000, currency: 'CZK', note: null, invested: 5000, pnl: 5000, pnl_pct: 100 },
        ],
    },
];

// === Demo dispatcher: maps GET path → mock body ===
//
// Returns undefined for unknown paths; caller responds with {} so the page
// doesn't crash on JSON.parse.
export function dispatchDemoGet(path: string): unknown | undefined {
    if (path.startsWith('/dashboard/balance-history')) return MOCK_BALANCE_HISTORY;
    if (path.startsWith('/dashboard/net-worth-history')) return MOCK_NET_WORTH;
    if (path.startsWith('/dashboard/portfolio')) return MOCK_PORTFOLIO;
    if (path.startsWith('/dashboard/monthly-report')) return MOCK_MONTHLY_REPORT;
    if (path.startsWith('/dashboard/')) return MOCK_DASHBOARD;
    if (path.startsWith('/accounts/institutions')) return { institutions: [] };
    if (path.startsWith('/accounts/') && path.includes('/detail')) {
        return { account: MOCK_ACCOUNTS[0], transactions: MOCK_TRANSACTIONS.items, total: 20, pages: 1, current_page: 1 };
    }
    if (path.startsWith('/accounts/')) return MOCK_ACCOUNTS;
    if (path.startsWith('/transactions/')) {
        // Detail endpoint hits /transactions/{id}; the list is /transactions/
        // or /transactions/?... — anything after the trailing slash is the id.
        const pathOnly = path.split('?')[0];
        const rest = pathOnly.slice('/transactions/'.length);
        if (!rest) return MOCK_TRANSACTIONS;
        return buildMockTransactionDetail(rest.split('/')[0]);
    }
    if (path.startsWith('/investments/portfolio-detail')) return MOCK_PORTFOLIO_DETAIL;
    if (path.startsWith('/investments/portfolio')) return MOCK_INVESTMENT_PORTFOLIO;
    if (path.startsWith('/investments/positions')) return MOCK_POSITIONS;
    if (path.startsWith('/investments/pies')) return MOCK_PIES;
    if (path.startsWith('/investments/history')) return MOCK_PORTFOLIO_HISTORY;
    if (path.startsWith('/investments/dividends')) return { dividends: [] };
    if (path.startsWith('/budgets/overview')) return MOCK_BUDGET_OVERVIEW;
    if (path.startsWith('/budgets/goals')) return MOCK_GOALS;
    if (path.startsWith('/budgets/')) return MOCK_BUDGETS;
    if (path.startsWith('/sync/status')) return MOCK_SYNC_STATUS;
    if (path.startsWith('/sync/')) return { status: 'completed', accounts_synced: 1, transactions_synced: 5 };
    if (path.startsWith('/settings/api-keys')) return MOCK_API_KEYS;
    if (path.startsWith('/settings/category-rules')) return MOCK_CATEGORY_RULES;
    if (path.startsWith('/settings/family-accounts')) return MOCK_FAMILY_ACCOUNTS;
    if (path.startsWith('/settings/my-account-patterns')) return MOCK_MY_ACCOUNT_PATTERNS;
    if (path.startsWith('/categories/')) return MOCK_CATEGORIES;
    if (path.startsWith('/recurring-expenses')) return MOCK_RECURRING_EXPENSES;
    if (path.startsWith('/monthly-budget/')) return MOCK_MONTHLY_BUDGET;
    if (path.startsWith('/annual-overview/')) {
        const yearMatch = path.match(/\/annual-overview\/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
        return MOCK_ANNUAL_OVERVIEW(year);
    }
    if (path.startsWith('/manual-investments/') && path.includes('/history')) return [];
    if (path.startsWith('/manual-investments/')) return MOCK_MANUAL_INVESTMENTS;
    if (path.startsWith('/manual-accounts/')) return MOCK_MANUAL_ACCOUNTS;
    if (path.startsWith('/contacts/')) return MOCK_CONTACTS;
    if (path.startsWith('/loans/summary')) return MOCK_LOANS_SUMMARY;
    if (path.match(/^\/loans\/\d+\/schedule/)) return MOCK_LOAN_SCHEDULE;
    if (path.startsWith('/loans')) return MOCK_LOANS;
    if (path.startsWith('/subscriptions/summary')) return MOCK_SUBSCRIPTIONS_SUMMARY;
    if (path.startsWith('/subscriptions/detect')) return MOCK_SUBSCRIPTIONS_DETECT;
    if (path.startsWith('/subscriptions')) return MOCK_SUBSCRIPTIONS;
    return undefined;
}
