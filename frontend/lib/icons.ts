/**
 * Centralizovaná mapa ikon pro celou aplikaci.
 * Každá ikona má právě jeden význam — při úpravách měň zde, ne v JSX.
 */

export const Icons = {
    // Hlavní navigace
    nav: {
        dashboard: '🏠',
        transactions: '💳',
        monthlyBudget: '📅',
        budgets: '🎯',
        reports: '📊',
        investments: '📈',
        settings: '⚙️',
        more: '☰',
    },

    // Nadpisy sekcí (unikátní významy)
    section: {
        income: '💵',              // Příjmy
        recurringExpenses: '🧾',   // Pravidelné výdaje
        expensesByItem: '🥧',      // Koláčový graf výdajů
        savingsAccounts: '🏦',     // Spořící účty
        myAccounts: '💼',          // Moje účty (manual)
        envelopes: '📨',           // Obálky
        surplus: '💹',             // Přebytek & spoření
        bestWorst: '🏆',           // Nej/nejhorší měsíc
        trend: '📉',               // Trend / vývoj
        monthlyOverview: '📈',     // Měsíční graf (chart)
        assetGrowth: '💰',         // Vývoj majetku
        lastTransactions: '🕒',    // Poslední transakce
        dividends: '💎',           // Dividendy
        valueGrowth: '📊',         // Vývoj hodnoty investic
        incomeVsExpenses: '⚖️',    // Příjmy vs výdaje
        categories: '🏷️',          // Kategorie
        categoryRules: '📏',       // Pravidla kategorií
        familyAccount: '👨‍👩‍👧',       // Rodinný účet
        apiKeys: '🔗',             // API klíče
        preferences: '⚙️',         // Preference
        sync: '🔄',                // Synchronizace
        connectBank: '➕',         // Připojit banku
        savingsGoals: '🏁',        // Spořící cíle
        goalCompleted: '✅',       // Cíl splněn
    },

    // Typy účtů
    accountType: {
        bank: '🏦',
        manual: '💼',
        investment: '📈',
    },

    // Akce (tlačítka)
    action: {
        add: '➕',
        edit: '✏️',
        delete: '🗑️',
        confirm: '✓',
        cancel: '✕',
        sync: '🔄',
        save: '💾',
        search: '🔍',
        visible: '👁️',
        hidden: '🙈',
        match: '🔄',               // Spárovat
        loadFromHistory: '📋',     // Z minula
    },

    // Stavy
    status: {
        warning: '⚠️',
        success: '✅',
        error: '❌',
        loading: '⏳',
        done: '🎉',
        ok: '✓',
        overBudget: '⚠️',
        nearLimit: '⚡',
    },

    // Obálky / flagy
    envelope: {
        mine: '👤',                // Moje obálka (dříve 💚)
        shared: '🤝',              // Sdílená obálka (dříve 📌)
    },

    // Kategorie výdajů (defaulty)
    category: {
        food: '🍕',
        transport: '🚗',
        utilities: '💡',
        entertainment: '🎬',
        shopping: '🛒',
        other: '📦',
        internalTransfer: '🔄',
        familyTransfer: '👨‍👩‍👧',
        fallback: '📋',
    },

    // Savings rate indicators
    savingsRate: {
        good: '✓',
        neutral: '~',
        bad: '↓',
    },

    // Pravidla kategorií
    rule: {
        userDefined: '👤',         // Vlastní pravidlo
        learned: '🤖',             // Naučené pravidlo
    },
} as const;
