// GoCardless bank consents (EUA) expire after ~90 days; the backend stores the
// expiry on each bank account so the UI can warn before syncs start failing.

export interface ConsentStatus {
    daysLeft: number;
    expired: boolean;
    expiringSoon: boolean;
    /** Full sentence for settings, e.g. "Souhlas vyprší za 5 dní" */
    label: string;
    /** Compact variant for account rows, e.g. "vyprší za 5 dní" */
    shortLabel: string;
    /** CSS color for the label */
    color: string;
}

const EXPIRING_SOON_DAYS = 14;

function czDays(n: number): string {
    if (n === 1) return 'den';
    if (n >= 2 && n <= 4) return 'dny';
    return 'dní';
}

export function getConsentStatus(expiresAt?: string | null): ConsentStatus | null {
    if (!expiresAt) return null;
    const expires = new Date(expiresAt);
    if (isNaN(expires.getTime())) return null;

    const now = new Date();
    const expired = expires.getTime() <= now.getTime();
    const daysLeft = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 86_400_000));
    const expiringSoon = !expired && daysLeft <= EXPIRING_SOON_DAYS;

    if (expired) {
        return {
            daysLeft: 0, expired, expiringSoon: false,
            label: 'Souhlas vypršel — nutné obnovit',
            shortLabel: 'připojení vypršelo',
            color: 'var(--neg)',
        };
    }
    if (daysLeft === 0) {
        return {
            daysLeft, expired, expiringSoon,
            label: 'Souhlas vyprší dnes',
            shortLabel: 'vyprší dnes',
            color: 'var(--neg)',
        };
    }
    return {
        daysLeft, expired, expiringSoon,
        label: expiringSoon
            ? `Souhlas vyprší za ${daysLeft} ${czDays(daysLeft)}`
            : `Souhlas platí ještě ${daysLeft} ${czDays(daysLeft)}`,
        shortLabel: expiringSoon ? `vyprší za ${daysLeft} ${czDays(daysLeft)}` : '',
        color: expiringSoon ? 'var(--warn)' : 'var(--text-3)',
    };
}
