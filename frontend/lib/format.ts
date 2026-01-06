/**
 * Shared utility functions for formatting
 */

/**
 * Format a number as currency with 2 decimal places
 */
export const formatCurrency = (amount: number, currency: string = 'CZK'): string => {
    return new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

/**
 * Format a date string to Czech locale
 */
export const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};
