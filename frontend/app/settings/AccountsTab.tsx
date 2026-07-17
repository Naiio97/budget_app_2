'use client';

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import Image from 'next/image';
import CustomSelect from '@/components/CustomSelect';
import { apiFetch, getDashboard, getInstitutions, connectBank, updateAccount, deleteAccount, updateManualInvestment, deleteManualInvestment, Account, ApiKeysResponse } from '@/lib/api';
import { getConsentStatus } from '@/lib/consent';
import { Icons } from '@/lib/icons';
import SyncHistoryCard from './SyncHistoryCard';
import { SurfaceCard, EditIcon, TrashIcon, CloseIcon, EyeIcon, EyeOffIcon, BankIcon } from './shared';

interface Institution { id: string; name: string; logo?: string; bic?: string; }

function getBankLogo(institution: string | undefined) {
    if (!institution) return null;
    const inst = institution.toLowerCase().replace(/[^a-z0-9]/g, '');
    let logoFile = '';
    if (inst.includes('airbank')) logoFile = 'airbank';
    else if (inst.includes('csas') || inst.includes('cesk') || inst.includes('sporitelna')) logoFile = 'csas';
    else if (inst.includes('trading212')) logoFile = 'trading212';
    else if (inst.includes('kb') || inst.includes('komercni')) logoFile = 'kb';
    else if (inst.includes('moneta')) logoFile = 'moneta';
    else if (inst.includes('raiffeisen') || (inst.includes('rb') && !inst.includes('airbank'))) logoFile = 'rb';
    else if (inst.includes('fio')) logoFile = 'fio';
    else if (inst.includes('csob')) logoFile = 'csob';
    else if (inst.includes('revolut')) logoFile = 'revolut';
    return logoFile ? `/logos/${logoFile}.png` : null;
}

export default function AccountsTab({ accounts, setAccounts, apiKeysLoaded, refreshAccounts }: {
    accounts: Account[];
    setAccounts: Dispatch<SetStateAction<Account[]>>;
    apiKeysLoaded: ApiKeysResponse | null;
    refreshAccounts: () => void;
}) {
    const [editingAccount, setEditingAccount] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [processingAccount, setProcessingAccount] = useState<string | null>(null);

    // Banks (pro connect modal)
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [loadingBanks, setLoadingBanks] = useState(false);
    const [connectingBank, setConnectingBank] = useState<string | null>(null);
    const [showConnectBank, setShowConnectBank] = useState(false);

    // Manual account creation
    const [showAddManual, setShowAddManual] = useState(false);
    const [newManualName, setNewManualName] = useState('');
    const [newManualBalance, setNewManualBalance] = useState('');
    const [newManualAccountNumber, setNewManualAccountNumber] = useState('');
    const [savingManual, setSavingManual] = useState(false);

    const loadBanks = useCallback(async () => {
        setLoadingBanks(true);
        try {
            const data = await getInstitutions('CZ');
            setInstitutions(data.institutions);
        } finally { setLoadingBanks(false); }
    }, []);

    useEffect(() => {
        if (apiKeysLoaded?.has_gocardless) loadBanks();
    }, [apiKeysLoaded?.has_gocardless, loadBanks]);

    const handleRename = async (id: string) => {
        if (!editName.trim()) return;
        setProcessingAccount(id);
        try {
            if (id.startsWith('manual-inv-')) {
                await updateManualInvestment(Number(id.slice('manual-inv-'.length)), { name: editName });
            } else if (id.startsWith('manual-')) {
                await apiFetch(`/manual-accounts/${id.slice('manual-'.length)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName }) });
            } else {
                await updateAccount(id, { name: editName });
            }
            setAccounts(prev => prev.map(a => a.id === id ? { ...a, name: editName } : a));
            setEditingAccount(null);
            refreshAccounts();
        } finally { setProcessingAccount(null); }
    };

    const handleToggleVisibility = async (id: string, currentVisibility: boolean) => {
        setProcessingAccount(id);
        try {
            if (id.startsWith('manual-inv-')) {
                await updateManualInvestment(Number(id.slice('manual-inv-'.length)), { is_visible: !currentVisibility });
            } else if (id.startsWith('manual-')) {
                await apiFetch(`/manual-accounts/${id.slice('manual-'.length)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_visible: !currentVisibility }) });
            } else {
                await updateAccount(id, { is_visible: !currentVisibility });
            }
            setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_visible: !currentVisibility } : a));
            refreshAccounts();
        } finally { setProcessingAccount(null); }
    };

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('Opravdu chcete smazat tento účet a celou jeho historii transakcí?')) return;
        setProcessingAccount(id);
        try {
            if (id.startsWith('manual-inv-')) {
                await deleteManualInvestment(Number(id.slice('manual-inv-'.length)));
            } else if (id.startsWith('manual-')) {
                await apiFetch(`/manual-accounts/${id.slice('manual-'.length)}`, { method: 'DELETE' });
            } else {
                await deleteAccount(id);
            }
            setAccounts(prev => prev.filter(a => a.id !== id));
            refreshAccounts();
        } finally { setProcessingAccount(null); }
    };

    const handleConnectBank = async (institutionId: string) => {
        try {
            const redirectUrl = `${window.location.origin}/settings?ref=`;
            const result = await connectBank(institutionId, redirectUrl);
            window.location.href = result.link;
        } catch (err) { console.error(err); }
    };

    const handleCreateManualAccount = async () => {
        if (!newManualName.trim()) return;
        setSavingManual(true);
        try {
            const res = await apiFetch(`/manual-accounts/`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newManualName.trim(),
                    balance: parseFloat(newManualBalance) || 0,
                    account_number: newManualAccountNumber.trim() || null,
                }),
            });
            if (res.ok) {
                setNewManualName(''); setNewManualBalance(''); setNewManualAccountNumber('');
                setShowAddManual(false);
                const dashData = await getDashboard(true);
                setAccounts(dashData.accounts || []);
                refreshAccounts();
            }
        } finally { setSavingManual(false); }
    };

    return (
        <>
            <div className="settings-accounts-wrap">
                <SurfaceCard
                    title="Účty"
                    sub="Přejmenuj, skryj nebo odpoj propojené a manuální účty."
                    action={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span className="set-count-chip">{accounts.length} {accounts.length === 1 ? 'účet' : accounts.length < 5 ? 'účty' : 'účtů'}</span>
                            <button className="btn btn-sm" onClick={() => setShowConnectBank(true)}>{BankIcon} Banka</button>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowAddManual(true)}>{Icons.action.add} Účet</button>
                        </div>
                    }
                    className="settings-category-card"
                >
                    {accounts.length === 0 ? (
                        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Zatím žádné účty. Přidej přes „+ Banka“ nebo „+ Účet“.</div>
                    ) : (
                        <div className="settings-scroll-list settings-account-list">
                            {accounts.map(acc => {
                                const logo = getBankLogo(acc.institution);
                                const visible = acc.is_visible !== false;
                                const consent = acc.type === 'bank' ? getConsentStatus(acc.consent_expires_at) : null;
                                const needsRenewal = !!consent && (consent.expired || consent.expiringSoon);
                                return (
                                    <div key={acc.id} className={`set-acc-row ${visible ? '' : 'is-hidden'}`} style={{ opacity: processingAccount === acc.id ? 0.5 : undefined }}>
                                        <span className="set-acc-logo" style={logo ? { background: '#fff' } : undefined}>
                                            {logo ? <Image src={logo} alt={acc.name} width={34} height={34} /> : (acc.type === 'bank' ? Icons.accountType.bank : Icons.accountType.investment)}
                                        </span>
                                        {editingAccount === acc.id ? (
                                            <div className="set-acc-edit">
                                                <input className="input" value={editName} autoFocus onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRename(acc.id); }} style={{ flex: 1 }} />
                                                <button className="btn btn-sm btn-primary" onClick={() => handleRename(acc.id)}>OK</button>
                                                <button className="set-icon-btn" onClick={() => setEditingAccount(null)} title="Zrušit">{CloseIcon}</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="set-acc-info">
                                                    <div className="set-acc-name">{acc.name}</div>
                                                    <div className="set-acc-meta">
                                                        {acc.institution || acc.type}
                                                        {consent && (
                                                            <>
                                                                {' · '}
                                                                <span style={{ color: consent.color, fontWeight: needsRenewal ? 600 : undefined }}>
                                                                    {consent.label}
                                                                </span>
                                                            </>
                                                        )}
                                                        {acc.last_sync_error && (
                                                            <>
                                                                {' · '}
                                                                <span style={{ color: 'var(--neg)', fontWeight: 600 }} title={acc.last_sync_error}>
                                                                    sync selhává
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                {!visible && <span className="set-tag">Skryto</span>}
                                                <div className="set-row-actions">
                                                    {needsRenewal && acc.institution && (
                                                        <button className="btn btn-sm btn-primary" onClick={() => handleConnectBank(acc.institution!)} title="Obnovit souhlas banky">
                                                            Obnovit
                                                        </button>
                                                    )}
                                                    <button className="set-icon-btn" title="Přejmenovat" onClick={() => { setEditName(acc.name); setEditingAccount(acc.id); }}>{EditIcon}</button>
                                                    <button className="set-icon-btn" title={visible ? 'Skrýt' : 'Zobrazit'} onClick={() => handleToggleVisibility(acc.id, acc.is_visible ?? true)}>{visible ? EyeIcon : EyeOffIcon}</button>
                                                    <button className="set-icon-btn danger" title="Smazat" onClick={() => handleDeleteAccount(acc.id)}>{TrashIcon}</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </SurfaceCard>
                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                    <SyncHistoryCard />
                </div>
            </div>

            {/* Connect bank modal */}
            {showConnectBank && (
                <div className="set-modal-overlay" onClick={() => setShowConnectBank(false)}>
                    <div className="set-modal" onClick={e => e.stopPropagation()}>
                        <div className="set-modal-head">
                            <div>
                                <h3 style={{ margin: 0 }}>Připojit banku</h3>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Přes GoCardless (Open Banking).</div>
                            </div>
                            <button className="set-icon-btn" title="Zavřít" onClick={() => setShowConnectBank(false)}>{CloseIcon}</button>
                        </div>
                        {!apiKeysLoaded?.has_gocardless ? (
                            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                                Nejdřív zadej GoCardless klíče v záložce <strong>Pokročilé</strong>.
                            </div>
                        ) : loadingBanks ? (
                            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Načítám banky...</div>
                        ) : institutions.length === 0 ? (
                            <button className="btn btn-primary" onClick={loadBanks}>{Icons.action.sync} Načíst banky</button>
                        ) : (
                            <>
                                <div>
                                    <label className="set-field-label">Banka</label>
                                    <CustomSelect
                                        options={institutions.map(b => ({ value: b.id, label: b.name, icon: Icons.accountType.bank }))}
                                        value={connectingBank || ''}
                                        onChange={setConnectingBank}
                                        placeholder="Vyberte banku..."
                                        searchable
                                        searchPlaceholder="Hledat banku..."
                                    />
                                </div>
                                <button className="btn btn-primary" disabled={!connectingBank} onClick={() => connectingBank && handleConnectBank(connectingBank)}>
                                    Připojit a přejít na banku →
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Add manual account modal */}
            {showAddManual && (
                <div className="set-modal-overlay" onClick={() => { setShowAddManual(false); setNewManualName(''); setNewManualBalance(''); setNewManualAccountNumber(''); }}>
                    <div className="set-modal" onClick={e => e.stopPropagation()}>
                        <div className="set-modal-head">
                            <div>
                                <h3 style={{ margin: 0 }}>Nový manuální účet</h3>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Pro účty bez API (hotovost, spoření…).</div>
                            </div>
                            <button className="set-icon-btn" title="Zavřít" onClick={() => { setShowAddManual(false); setNewManualName(''); setNewManualBalance(''); setNewManualAccountNumber(''); }}>{CloseIcon}</button>
                        </div>
                        <div>
                            <label className="set-field-label">Název účtu</label>
                            <input className="input" placeholder="např. Hotovost" value={newManualName} autoFocus onChange={e => setNewManualName(e.target.value)} style={{ width: '100%' }} />
                        </div>
                        <div>
                            <label className="set-field-label">Číslo účtu / IBAN (volitelné)</label>
                            <input className="input" placeholder="" value={newManualAccountNumber} onChange={e => setNewManualAccountNumber(e.target.value)} style={{ width: '100%' }} />
                        </div>
                        <div>
                            <label className="set-field-label">Počáteční zůstatek (Kč)</label>
                            <input type="number" className="input" placeholder="0" value={newManualBalance} onChange={e => setNewManualBalance(e.target.value)} style={{ width: '100%' }} />
                        </div>
                        <button className="btn btn-primary" disabled={savingManual || !newManualName.trim()} onClick={handleCreateManualAccount}>
                            {savingManual ? 'Vytvářím...' : <>{Icons.action.add} Vytvořit účet</>}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
