/**
 * Centralizovaná mapa ikon pro celou aplikaci.
 * Každá ikona má právě jeden význam — při úpravách měň zde, ne v JSX.
 *
 * UI chrome (nav, sekce, akce, stavy, typy účtů, obálky) používá jednotné
 * čárové ikony (`getLineIcon`) v barvě textu (`currentColor`). Velikost '1.05em'
 * = ikona se škáluje podle okolního fontu, takže sedí inline v každé velikosti.
 *
 * Barevné emoji kategorií (`category`) a drobné textové indikátory (`savingsRate`)
 * zůstávají — jsou to samostatné, záměrně odlišné systémy.
 */
import { getLineIcon, LineIconName } from './line-icons';

const I = (name: LineIconName) => getLineIcon(name, '1.05em');

export const Icons = {
    // Hlavní navigace
    nav: {
        dashboard: I('home'),
        transactions: I('card'),
        monthlyBudget: I('calendar'),
        budgets: I('target'),
        reports: I('chart'),
        investments: I('trendUp'),
        loans: I('coins'),
        subscriptions: I('repeat'),
        settlement: I('handshake'),
        settings: I('gear'),
        more: I('menu'),
    },

    // Nadpisy sekcí (unikátní významy)
    section: {
        income: I('income'),               // Příjmy
        recurringExpenses: I('receipt'),   // Pravidelné výdaje
        expensesByItem: I('pie'),          // Koláčový graf výdajů
        savingsAccounts: I('bank'),        // Spořící účty
        myAccounts: I('briefcase'),        // Moje účty (manual)
        envelopes: I('mail'),              // Obálky
        surplus: I('savings'),             // Přebytek & spoření
        bestWorst: I('trophy'),            // Nej/nejhorší měsíc
        trend: I('trendDown'),             // Trend / vývoj
        monthlyOverview: I('chart'),       // Měsíční graf
        assetGrowth: I('coins'),           // Vývoj majetku
        lastTransactions: I('clock'),      // Poslední transakce
        dividends: I('gem'),               // Dividendy
        valueGrowth: I('chart'),           // Vývoj hodnoty investic
        incomeVsExpenses: I('scale'),      // Příjmy vs výdaje
        categories: I('tag'),              // Kategorie
        categoryRules: I('ruler'),         // Pravidla kategorií
        familyAccount: I('users'),         // Rodinný účet
        apiKeys: I('link'),                // API klíče
        preferences: I('gear'),            // Preference
        sync: I('refresh'),                // Synchronizace
        connectBank: I('add'),             // Připojit banku
        savingsGoals: I('target'),         // Spořící cíle
        goalCompleted: I('checkCircle'),   // Cíl splněn
    },

    // Typy účtů
    accountType: {
        bank: I('bank'),
        manual: I('briefcase'),
        investment: I('trendUp'),
    },

    // Akce (tlačítka)
    action: {
        add: I('add'),
        edit: I('edit'),
        delete: I('delete'),
        confirm: I('check'),
        cancel: I('close'),
        sync: I('refresh'),
        save: I('save'),
        search: I('search'),
        visible: I('eye'),
        hidden: I('eyeOff'),
        match: I('refresh'),               // Spárovat
        loadFromHistory: I('clipboard'),   // Z minula
    },

    // Stavy
    status: {
        warning: I('warning'),
        success: I('checkCircle'),
        error: I('xCircle'),
        loading: I('refresh'),
        done: I('checkCircle'),
        ok: I('check'),
        overBudget: I('warning'),
        nearLimit: I('bolt'),
    },

    // Obálky / flagy
    envelope: {
        mine: I('user'),                   // Moje obálka
        shared: I('users'),                // Sdílená obálka
    },

    // Kategorie výdajů (defaulty) — barevné emoji, samostatný systém
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

    // Savings rate indicators — drobné textové značky
    savingsRate: {
        good: '✓',
        neutral: '~',
        bad: '↓',
    },

    // Pravidla kategorií
    rule: {
        userDefined: I('user'),            // Vlastní pravidlo
        learned: I('robot'),               // Naučené pravidlo
    },
} as const;
