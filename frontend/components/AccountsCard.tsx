'use client';

import Link from 'next/link';
import type { Account } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { getConsentStatus } from '@/lib/consent';
import SyncButton from './SyncButton';

// Tlumené barvy avatarů — přiřazují se podle názvu, aby byl účet pokaždé stejný.
const AVATAR_COLORS = ['#3b7dd8', '#6b7586', '#24303f', '#2f9c78', '#7a67c4', '#c0794d', '#4a9db0'];

function hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
}

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

// Rozpoznání podle částí kódu banky (GoCardless: „CESKA_SPORITELNA_GIBACZPX", „AIRBANK_AIRACZPP")
const BANK_NAMES: Array<[string, string]> = [
    ['airbank', 'Air Bank'],
    ['sporitelna', 'Česká spořitelna'],
    ['csas', 'Česká spořitelna'],
    ['trading212', 'Trading 212'],
    ['komercni', 'Komerční banka'],
    ['csob', 'ČSOB'],
    ['moneta', 'Moneta'],
    ['fio', 'Fio banka'],
    ['raiffeisen', 'Raiffeisenbank'],
    ['ppf', 'PPF banka'],
    ['revolut', 'Revolut'],
];

function prettyInstitution(code?: string): string | null {
    if (!code) return null;
    const key = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const known = BANK_NAMES.find(([part]) => key.includes(part));
    if (known) return known[1];
    // Už čitelný název („Manuální investice") nech být, kód („SOME_BANK_XXXXCZPP") zkrať na první slovo
    if (/[a-zá-ž]/.test(code) || /\s/.test(code)) return code;
    const first = code.split('_')[0].toLowerCase();
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : null;
}

function subtitle(account: Account): string {
    const institution = prettyInstitution(account.institution);
    if (institution) return institution;
    return account.type === 'investment' ? 'Investice' : 'Bankovní účet';
}

// Stejné cílové stránky jako dřív v pravém panelu
function accountHref(account: { id: string; type: string }): string {
    if (account.type === 'investment') return '/investments/trading212';
    if (account.type === 'manual_investment' || account.id.startsWith('manual-inv-'))
        return `/investments/manual/${account.id.replace('manual-inv-', '')}`;
    if (account.type === 'manual' || account.id.startsWith('manual-'))
        return `/manual-account/${account.id.replace('manual-', '')}`;
    return `/accounts/${account.id}`;
}

const MAX_SHOWN = 6;

export default function AccountsCard({ accounts }: { accounts: Account[] }) {
    const shown = accounts.slice(0, MAX_SHOWN);

    return (
        <div className="dash-card dash-accounts">
            <div className="dash-card-head">
                <h3>Vaše účty</h3>
                <div className="dash-head-tools">
                    <SyncButton />
                    <span className="dash-count">{accounts.length}</span>
                </div>
            </div>

            <div className="dash-acc-list">
                {shown.map(acc => {
                    const consent = getConsentStatus(acc.consent_expires_at);
                    const consentWarning = consent && (consent.expired || consent.expiringSoon);
                    const syncBroken = !consentWarning && !!acc.last_sync_error;
                    return (
                        <Link key={acc.id} href={accountHref(acc)} className="dash-acc">
                            <span className="dash-avatar" style={{ background: AVATAR_COLORS[hash(acc.name) % AVATAR_COLORS.length] }}>
                                {initials(acc.name)}
                            </span>
                            <span className="dash-acc-text">
                                <span className="dash-acc-name">{acc.name}</span>
                                {consentWarning ? (
                                    <span className="dash-acc-sub warn" style={{ color: consent.color }} title={consent.label}>{consent.shortLabel}</span>
                                ) : syncBroken ? (
                                    <span className="dash-acc-sub warn" title={acc.last_sync_error ?? undefined}>sync selhává</span>
                                ) : (
                                    <span className="dash-acc-sub">{subtitle(acc)}</span>
                                )}
                            </span>
                            <span className="dash-acc-balance num" style={acc.balance < 0 ? { color: 'var(--d-neg)' } : undefined}>
                                {formatCurrency(acc.balance, acc.currency)}
                            </span>
                        </Link>
                    );
                })}
                {accounts.length === 0 && <div className="dash-empty">Zatím žádné účty</div>}
            </div>

            <Link href="/settings" className="dash-add">+ Propojit účet</Link>
        </div>
    );
}
