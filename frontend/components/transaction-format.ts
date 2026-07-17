// Čisté formátovací helpery sdílené seznamem transakcí a detail modalem.
import { Transaction } from '@/lib/api';

export interface Category {
    id: number;
    name: string;
    icon: string;
    color: string;
    is_income: boolean;
    is_active: boolean;
}

export const formatCurrency = (amount: number, currency: string = 'CZK') =>
    new Intl.NumberFormat('cs-CZ', {
        style: 'currency', currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);

export const formatDateFull = (dateStr: string) =>
    new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateStr));

// Convert Czech IBAN to human-readable account number
export const ibanToCzAccount = (iban: string): string | null => {
    if (!iban || !iban.startsWith('CZ') || iban.length !== 24) return null;
    const bankCode = iban.slice(4, 8);
    const prefix = parseInt(iban.slice(8, 14), 10);
    const account = iban.slice(14).replace(/^0+/, '') || '0';
    return prefix > 0 ? `${prefix}-${account}/${bankCode}` : `${account}/${bankCode}`;
};

export const formatAccount = (iban: string | null | undefined): { display: string } | null => {
    if (!iban) return null;
    const czAccount = ibanToCzAccount(iban);
    if (czAccount) return { display: czAccount };
    if (iban.includes('/')) return { display: iban };
    return { display: iban.replace(/(.{4})/g, '$1 ').trim() };
};

export const getDisplayName = (tx: Transaction): string => {
    if (tx.amount < 0) {
        return tx.creditor_name
            || formatAccount(tx.creditor_iban)?.display
            || tx.description;
    }
    return tx.debtor_name
        || formatAccount(tx.debtor_iban)?.display
        || tx.creditor_name
        || tx.description;
};
