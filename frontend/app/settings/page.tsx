'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import Toast, { ToastMessage } from '@/components/Toast';
import { syncData, getSyncStatus, SyncStatus, getDashboard, getApiKeys, saveApiKeys, ApiKeysResponse, getInstitutions, connectBank, updateAccount, deleteAccount, updateManualInvestment, deleteManualInvestment, Account, apiFetch, Tag, getTags, createTag, deleteTag, getVapidPublicKey, subscribePush, unsubscribePush, sendTestPush } from '@/lib/api';
import { getConsentStatus } from '@/lib/consent';
import { getCategoryIcon } from '@/lib/category-icons';
import { NAV_PAGES, NavPlacement, setNavPlacement, useNavPlacements } from '@/lib/nav-preferences';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';

interface Institution { id: string; name: string; logo?: string; bic?: string; }
interface CategoryRule { id: number; pattern: string; category: string; is_user_defined: boolean; is_builtin: boolean; match_count: number; }
import SyncHistoryCard from './SyncHistoryCard';
import CategoryManager from './CategoryManager';
import FamilyAccountSettings from './FamilyAccountSettings';
import MyAccountPatterns from './MyAccountPatterns';
import ShareRulesSettings from './ShareRulesSettings';
import TransferExcludedAccounts from './TransferExcludedAccounts';
import { SurfaceCard, CATEGORY_PALETTE, EditIcon, TrashIcon, SearchIcon, CloseIcon, EyeIcon, EyeOffIcon, BankIcon, type Category } from './shared';

// ── Main settings page ────────────────────────────────────────
type Tab = 'accounts' | 'categories' | 'menu' | 'advanced';

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const refreshAccounts = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }), [queryClient]);

    const [tab, setTab] = useState<Tab>('accounts');

    // API keys
    const [gocardlessId, setGocardlessId] = useState('');
    const [gocardlessKey, setGocardlessKey] = useState('');
    const [trading212Key, setTrading212Key] = useState('');
    const [savingKeys, setSavingKeys] = useState(false);
    const [keysSaved, setKeysSaved] = useState(false);
    const [apiKeysLoaded, setApiKeysLoaded] = useState<ApiKeysResponse | null>(null);

    // Accounts
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [editingAccount, setEditingAccount] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [processingAccount, setProcessingAccount] = useState<string | null>(null);

    // Banks
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [loadingBanks, setLoadingBanks] = useState(false);
    const [connectingBank, setConnectingBank] = useState<string | null>(null);

    // Fit-mode (two scrolling columns) is desktop-only; on phones the page
    // scrolls normally so cards stack instead of fighting over a fixed height.
    const [isNarrow, setIsNarrow] = useState(false);
    useEffect(() => {
        const check = () => setIsNarrow(window.innerWidth <= 1200);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Sync
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const navPlacements = useNavPlacements();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [detecting, setDetecting] = useState(false);
    const [toast, setToast] = useState<ToastMessage>(null);

    // Category rules
    const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);

    // Push notifikace
    const [pushSupported, setPushSupported] = useState(false);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);

    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        setPushSupported(true);
        navigator.serviceWorker.getRegistration()
            .then(reg => reg?.pushManager.getSubscription())
            .then(sub => setPushSubscribed(!!sub))
            .catch(() => {});
    }, []);

    const enablePush = async () => {
        setPushBusy(true);
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg) {
                alert('Service worker neběží (na localhostu je vypnutý) — notifikace fungují jen v nasazené appce.');
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('Notifikace jsou v prohlížeči zamítnuté. Povol je v nastavení prohlížeče.');
                return;
            }
            const key = await getVapidPublicKey();
            const padding = '='.repeat((4 - (key.length % 4)) % 4);
            const raw = atob((key + padding).replace(/-/g, '+').replace(/_/g, '/'));
            const applicationServerKey = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
            await subscribePush(sub.toJSON());
            setPushSubscribed(true);
        } catch (err) {
            console.error('Push subscribe failed:', err);
            alert('Zapnutí notifikací selhalo.');
        } finally { setPushBusy(false); }
    };

    const disablePush = async () => {
        setPushBusy(true);
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            if (sub) {
                await unsubscribePush(sub.endpoint);
                await sub.unsubscribe();
            }
            setPushSubscribed(false);
        } catch (err) { console.error(err); }
        finally { setPushBusy(false); }
    };

    const handleTestPush = async () => {
        try {
            await sendTestPush();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Test se nepodařil');
        }
    };

    // Tagy — volné štítky napříč kategoriemi
    const [tagsList, setTagsList] = useState<Tag[]>([]);
    const [newTagText, setNewTagText] = useState('');
    const [savingTag, setSavingTag] = useState(false);

    const loadTags = useCallback(async () => {
        try {
            const d = await getTags();
            setTagsList(d.tags);
        } catch (err) { console.error(err); }
    }, []);

    const handleAddTag = async () => {
        const name = newTagText.trim();
        if (!name) return;
        setSavingTag(true);
        try {
            await createTag(name, CATEGORY_PALETTE[tagsList.length % CATEGORY_PALETTE.length]);
            setNewTagText('');
            await loadTags();
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Tag se nepodařilo vytvořit');
        } finally { setSavingTag(false); }
    };

    const handleDeleteTag = async (tag: Tag) => {
        if ((tag.usage_count ?? 0) > 0 && !confirm(`Tag „${tag.name}" je na ${tag.usage_count} transakcích. Opravdu smazat?`)) return;
        try {
            await deleteTag(tag.id);
            setTagsList(prev => prev.filter(t => t.id !== tag.id));
        } catch (err) { console.error(err); }
    };
    const [newPattern, setNewPattern] = useState('');
    const [newRuleCategory, setNewRuleCategory] = useState('Food');
    const [ruleSearch, setRuleSearch] = useState('');
    const [savingRule, setSavingRule] = useState(false);
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [showConnectBank, setShowConnectBank] = useState(false);
    const [detailRule, setDetailRule] = useState<CategoryRule | null>(null);
    const [editingRule, setEditingRule] = useState(false);
    const [editRulePattern, setEditRulePattern] = useState('');
    const [editRuleCategory, setEditRuleCategory] = useState('');
    const [savingRuleEdit, setSavingRuleEdit] = useState(false);
    const [ruleCategories, setRuleCategories] = useState<Category[]>([]);

    // Manual account creation
    const [showAddManual, setShowAddManual] = useState(false);
    const [newManualName, setNewManualName] = useState('');
    const [newManualBalance, setNewManualBalance] = useState('');
    const [newManualAccountNumber, setNewManualAccountNumber] = useState('');
    const [savingManual, setSavingManual] = useState(false);

    const loadCategoryRules = useCallback(async () => {
        try {
            const r = await apiFetch(`/settings/category-rules`);
            if (r.ok) {
                const data = await r.json();
                setCategoryRules(data.rules || []);
            }
            const c = await apiFetch(`/categories/`);
            const cd = await c.json();
            setRuleCategories(Array.isArray(cd) ? cd : []);
        } catch (err) { console.error(err); }
    }, []);

    const loadBanks = useCallback(async () => {
        setLoadingBanks(true);
        try {
            const data = await getInstitutions('CZ');
            setInstitutions(data.institutions);
        } finally { setLoadingBanks(false); }
    }, []);

    useEffect(() => {
        (async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const ref = urlParams.get('ref');
            if (ref) {
                try {
                    const res = await apiFetch(`/accounts/connect/bank/callback?ref=${ref}`);
                    if (!res.ok) {
                        console.error('Bank connect callback failed:', res.status, await res.text().catch(() => ''));
                        alert('Připojení banky se nepodařilo dokončit. Zkuste to prosím znovu, případně spusťte synchronizaci.');
                    }
                    window.history.replaceState({}, '', '/settings');
                } catch (err) { console.error(err); }
            }
            try {
                const [status, dashData, keys] = await Promise.all([getSyncStatus(), getDashboard(true), getApiKeys()]);
                setSyncStatus(status);
                setApiKeysLoaded(keys);
                if (keys.gocardless_secret_id) setGocardlessId(keys.gocardless_secret_id);
                if (keys.gocardless_secret_key) setGocardlessKey(keys.gocardless_secret_key);
                if (keys.trading212_api_key) setTrading212Key(keys.trading212_api_key);
                setAccounts(dashData.accounts || []);
                if (keys.has_gocardless) loadBanks();
            } catch (err) { console.error(err); }
            await refreshAccounts();
        })();
        loadCategoryRules();
        loadTags();
    }, [loadBanks, loadCategoryRules, loadTags, refreshAccounts]);

    // ── Account handlers
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
            setAccounts(accounts.map(a => a.id === id ? { ...a, name: editName } : a));
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
            setAccounts(accounts.map(a => a.id === id ? { ...a, is_visible: !currentVisibility } : a));
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
            setAccounts(accounts.filter(a => a.id !== id));
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
                await refreshAccounts();
            }
        } finally { setSavingManual(false); }
    };

    const handleSaveKeys = async () => {
        setSavingKeys(true);
        try {
            const keysToSave: Record<string, string> = {};
            if (gocardlessId && !gocardlessId.includes('...')) keysToSave.gocardless_secret_id = gocardlessId;
            if (gocardlessKey && !gocardlessKey.includes('...')) keysToSave.gocardless_secret_key = gocardlessKey;
            if (trading212Key && !trading212Key.includes('...')) keysToSave.trading212_api_key = trading212Key;
            if (Object.keys(keysToSave).length > 0) await saveApiKeys(keysToSave);
            setKeysSaved(true);
            setTimeout(() => setKeysSaved(false), 2000);
            const keys = await getApiKeys();
            setApiKeysLoaded(keys);
            if (keys.has_gocardless) loadBanks();
        } finally { setSavingKeys(false); }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncError(null);
        try {
            await syncData();
            const status = await getSyncStatus();
            setSyncStatus(status);
            const dashData = await getDashboard(true);
            if (dashData.accounts.length > 0) setAccounts(dashData.accounts);
            await refreshAccounts();
        } catch (err) {
            setSyncError('Synchronizace selhala. Zkontrolujte API klíče.');
            console.error(err);
        } finally {
            // I selhaný běh se zapisuje do historie — obnovit vždy
            queryClient.invalidateQueries({ queryKey: queryKeys.syncHistory });
            setIsSyncing(false);
        }
    };

    const handleDetectTransfers = async () => {
        setDetecting(true);
        try {
            const res = await apiFetch(`/sync/detect-transfers`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                const marked = (data.marked_internal_transfers ?? 0) + (data.marked_my_account_transfers ?? 0) + (data.marked_family_transfers ?? 0);
                const unmarked = data.unmarked_excluded_accounts ?? 0;
                setToast({
                    text: marked === 0 && unmarked === 0
                        ? 'Detekce hotová — žádné nové převody.'
                        : `Detekce hotová — ${marked} nově označených převodů${unmarked > 0 ? `, ${unmarked} vráceno mezi výdaje` : ''}.`,
                });
            }
        } finally { setDetecting(false); }
    };

    const handleAddRule = async () => {
        if (!newPattern.trim()) return;
        setSavingRule(true);
        try {
            const r = await apiFetch(`/settings/category-rules`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: newPattern, category: newRuleCategory }),
            });
            if (r.ok) { setNewPattern(''); setShowRuleForm(false); loadCategoryRules(); }
        } finally { setSavingRule(false); }
    };

    const handleDeleteRule = async (id: number) => {
        await apiFetch(`/settings/category-rules/${id}`, { method: 'DELETE' });
        setCategoryRules(categoryRules.filter(r => r.id !== id));
    };

    const handleUpdateRule = async () => {
        if (!detailRule || !editRulePattern.trim()) return;
        setSavingRuleEdit(true);
        try {
            const r = await apiFetch(`/settings/category-rules/${detailRule.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: editRulePattern, category: editRuleCategory }),
            });
            if (r.ok) { setEditingRule(false); setDetailRule(null); loadCategoryRules(); }
        } finally { setSavingRuleEdit(false); }
    };

    const handleRecategorize = async () => {
        setIsSyncing(true);
        try {
            const r = await apiFetch(`/sync/recategorize`, { method: 'POST' });
            if (!r.ok) throw new Error(`recategorize ${r.status}`);
            const data = await r.json();
            const n: number = data.updated ?? 0;
            setToast({
                text: n === 0
                    ? 'Hotovo — všechny transakce už byly zařazené správně.'
                    : `Hotovo — překategorizováno ${n} ${n === 1 ? 'transakce' : n < 5 ? 'transakce' : 'transakcí'}.`,
            });
        } catch (err) {
            console.error(err);
            setToast({ text: 'Rekategorizace selhala.', kind: 'error' });
        } finally { setIsSyncing(false); }
    };

    const formatLastSync = (dateStr: string | null) => {
        if (!dateStr) return 'Nikdy';
        return new Date(dateStr).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getBankLogo = (institution: string | undefined) => {
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
    };

    return (
        <MainLayout disableScroll={tab === 'categories' && !isNarrow}>
            <div className={`page-container settings-page ${tab === 'categories' && !isNarrow ? 'settings-page-fit' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                {/* Page head */}
                <div className="page-head">
                    <div>
                        <h1>Nastavení</h1>
                        <div className="sub">Účty, kategorie a propojení</div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                    {([['accounts', 'Účty'], ['categories', 'Kategorie'], ['menu', 'Menu'], ['advanced', 'Pokročilé']] as [Tab, string][]).map(([val, label]) => (
                        <div key={val} className={`seg-item ${tab === val ? 'active' : ''}`} onClick={() => setTab(val)}>
                            {label}
                        </div>
                    ))}
                </div>

                {/* TAB: ACCOUNTS */}
                {tab === 'accounts' && (
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
                )}

                {/* Connect bank modal */}
                {tab === 'accounts' && showConnectBank && (
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
                {tab === 'accounts' && showAddManual && (
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

                {/* TAB: CATEGORIES */}
                {tab === 'categories' && (
                    <div className="settings-categories-grid">

                        <SurfaceCard
                            title="Kategorie"
                            sub="Přidej, uprav nebo skryj kategorie pro třídění transakcí."
                            action={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    <span className="set-count-chip">{ruleCategories.filter(c => c.is_active).length} kategorií</span>
                                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddCategory(true)}>{Icons.action.add} Kategorie</button>
                                </div>
                            }
                            className="settings-category-card"
                        >
                            <CategoryManager onCategoriesChange={loadCategoryRules} showAdd={showAddCategory} setShowAdd={setShowAddCategory} />
                        </SurfaceCard>

                        <div className="settings-rules-column" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                            <SurfaceCard
                                title="Pravidla"
                                sub="Když popis transakce obsahuje text, automaticky se přiřadí kategorie."
                                action={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                        <span className="set-count-chip">{categoryRules.length} pravidel</span>
                                        <button className="btn btn-sm" onClick={handleRecategorize} disabled={isSyncing} title="Překategorizovat všechny transakce">
                                            {isSyncing ? '…' : <>{Icons.action.sync} Sync</>}
                                        </button>
                                        <button className="btn btn-primary btn-sm" onClick={() => setShowRuleForm(true)}>{Icons.action.add} Pravidlo</button>
                                    </div>
                                }
                                className="settings-rules-card"
                            >
                                {categoryRules.length === 0 ? (
                                    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                                        Zatím žádná pravidla. Přidej přes „+ Pravidlo“ nebo změň kategorii u transakce.
                                    </div>
                                ) : (
                                    <>
                                        <div className="set-search" style={{ marginBottom: 8 }}>
                                            {SearchIcon}
                                            <input
                                                className="input"
                                                placeholder="Hledat v pravidlech…"
                                                value={ruleSearch}
                                                onChange={e => setRuleSearch(e.target.value)}
                                            />
                                        </div>
                                        {(() => {
                                            const q = ruleSearch.trim().toLowerCase();
                                            const visibleRules = q
                                                ? categoryRules.filter(r => r.pattern.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
                                                : categoryRules;
                                            if (visibleRules.length === 0) {
                                                return (
                                                    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                                                        Žádné pravidlo neodpovídá hledání „{ruleSearch}“.
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div className="settings-scroll-list settings-rules-list">
                                                    {visibleRules.map(rule => {
                                                        const catColor = ruleCategories.find(c => c.name === rule.category)?.color ?? 'var(--text-3)';
                                                        return (
                                                            <button key={rule.id} type="button" className="set-rule-row" onClick={() => { setDetailRule(rule); setEditingRule(false); setEditRulePattern(rule.pattern); setEditRuleCategory(rule.category); }}>
                                                                <span className="set-rule-pattern">„{rule.pattern}“</span>
                                                                <span className="set-rule-arrow">→</span>
                                                                <span className="set-rule-dot" style={{ background: catColor }} />
                                                                <span className="set-rule-cat">{rule.category}</span>
                                                                <span className="set-rule-chevron">›</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </>
                                )}
                            </SurfaceCard>

                            <SurfaceCard
                                title="Tagy"
                                sub="Volné štítky napříč kategoriemi — „dovolená 2026“, „rekonstrukce“…"
                                action={<span className="set-count-chip">{tagsList.length} tagů</span>}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {tagsList.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {tagsList.map(tag => (
                                                <span key={tag.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="set-rule-dot" style={{ background: tag.color ?? 'var(--text-3)' }} />
                                                    #{tag.name}
                                                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{tag.usage_count ?? 0}×</span>
                                                    <button
                                                        onClick={() => handleDeleteTag(tag)}
                                                        title="Smazat tag"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, fontSize: 12, lineHeight: 1 }}
                                                    >✕</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                            className="input"
                                            placeholder="Nový tag (např. dovolená 2026)"
                                            value={newTagText}
                                            onChange={e => setNewTagText(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }}
                                            style={{ flex: 1 }}
                                        />
                                        <button className="btn btn-primary btn-sm" onClick={handleAddTag} disabled={savingTag || !newTagText.trim()}>
                                            {savingTag ? '…' : 'Přidat'}
                                        </button>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                        Tagy přiřadíš transakci v jejím detailu; součet za tag najdeš ve filtru transakcí.
                                    </div>
                                </div>
                            </SurfaceCard>
                        </div>
                    </div>
                )}

                {/* New rule modal */}
                {tab === 'categories' && showRuleForm && (
                    <div className="set-modal-overlay" onClick={() => setShowRuleForm(false)}>
                        <div className="set-modal" onClick={e => e.stopPropagation()}>
                            <div className="set-modal-head">
                                <div>
                                    <h3 style={{ margin: 0 }}>Nové pravidlo</h3>
                                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Když popis transakce obsahuje text, automaticky se přiřadí kategorie.</div>
                                </div>
                                <button className="set-icon-btn" title="Zavřít" onClick={() => setShowRuleForm(false)}>{CloseIcon}</button>
                            </div>
                            <div>
                                <label className="set-field-label">Obsahuje text</label>
                                <div className="set-search">
                                    {SearchIcon}
                                    <input className="input" autoFocus placeholder='např. „billa" nebo „uber"' value={newPattern} onChange={e => setNewPattern(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newPattern.trim()) handleAddRule(); }} />
                                </div>
                            </div>
                            <div>
                                <label className="set-field-label">Přiřadit kategorii</label>
                                <CustomSelect
                                    value={newRuleCategory}
                                    onChange={setNewRuleCategory}
                                    options={ruleCategories.filter(c => c.is_active).map(c => ({ value: c.name, label: c.name, icon: getCategoryIcon(c.icon, 15) }))}
                                />
                            </div>
                            <button className="btn btn-primary" onClick={handleAddRule} disabled={savingRule || !newPattern.trim()}>
                                {savingRule ? 'Ukládám...' : <>{Icons.action.add} Přidat pravidlo</>}
                            </button>
                        </div>
                    </div>
                )}

                {/* Rule detail modal */}
                {tab === 'categories' && detailRule && (
                    <div className="set-modal-overlay" onClick={() => setDetailRule(null)}>
                        <div className="set-modal" onClick={e => e.stopPropagation()}>
                            <div className="set-modal-head">
                                <h3 style={{ margin: 0 }}>{editingRule ? 'Upravit pravidlo' : 'Detail pravidla'}</h3>
                                <button className="set-icon-btn" title="Zavřít" onClick={() => setDetailRule(null)}>{CloseIcon}</button>
                            </div>
                            {editingRule ? (
                                <>
                                    <div>
                                        <label className="set-field-label">Obsahuje text</label>
                                        <div className="set-search">
                                            {SearchIcon}
                                            <input className="input" autoFocus value={editRulePattern} onChange={e => setEditRulePattern(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editRulePattern.trim()) handleUpdateRule(); }} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="set-field-label">Přiřadit kategorii</label>
                                        <CustomSelect
                                            value={editRuleCategory}
                                            onChange={setEditRuleCategory}
                                            options={ruleCategories.filter(c => c.is_active).map(c => ({ value: c.name, label: c.name, icon: getCategoryIcon(c.icon, 15) }))}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn" style={{ flex: 1 }} onClick={() => setEditingRule(false)}>Zrušit</button>
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleUpdateRule} disabled={savingRuleEdit || !editRulePattern.trim()}>
                                            {savingRuleEdit ? 'Ukládám...' : 'Uložit'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="set-field-label">Obsahuje text</label>
                                        <div className="set-modal-value">„{detailRule.pattern}“</div>
                                    </div>
                                    <div>
                                        <label className="set-field-label">Přiřadí kategorii</label>
                                        <div className="set-modal-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className="set-rule-dot" style={{ background: ruleCategories.find(c => c.name === detailRule.category)?.color ?? 'var(--text-3)' }} />
                                            {detailRule.category}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="set-field-label">Původ</label>
                                        <div className="set-modal-value">{detailRule.is_user_defined ? 'Vlastní pravidlo' : detailRule.is_builtin ? 'Výchozí pravidlo' : 'Naučené'} · {detailRule.match_count}× použito</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn" style={{ flex: 1 }} onClick={() => setEditingRule(true)}>{Icons.action.edit} Upravit</button>
                                        <button className="btn" style={{ flex: 1, color: 'var(--neg)' }} onClick={() => { handleDeleteRule(detailRule.id); setDetailRule(null); }}>
                                            {TrashIcon} Smazat
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB: ADVANCED */}
                {tab === 'advanced' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--spacing-lg)' }}>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                            <SurfaceCard title="Synchronizace" sub={`Poslední: ${formatLastSync(syncStatus?.last_sync || null)}`}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <button className="btn btn-primary" onClick={handleSync} disabled={isSyncing} style={{ padding: 12 }}>
                                        {isSyncing ? <>{Icons.status.loading} Synchronizuji...</> : <>{Icons.action.sync} Synchronizovat data</>}
                                    </button>
                                    {syncStatus?.status === 'completed' && (
                                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                            {syncStatus.accounts_synced} účtů · {syncStatus.transactions_synced} transakcí
                                        </div>
                                    )}
                                    {syncError && (
                                        <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--neg) 12%, transparent)', borderRadius: 'var(--radius-sm)', color: 'var(--neg)', fontSize: 13 }}>
                                            {Icons.status.warning} {syncError}
                                        </div>
                                    )}
                                </div>
                            </SurfaceCard>

                            <SurfaceCard title="API Klíče">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div style={{
                                        padding: 12,
                                        borderRadius: 'var(--radius-sm)',
                                        border: apiKeysLoaded?.has_gocardless ? '0.5px solid color-mix(in srgb, var(--pos) 32%, transparent)' : '0.5px solid var(--border)',
                                        background: apiKeysLoaded?.has_gocardless ? 'color-mix(in srgb, var(--pos) 6%, transparent)' : 'transparent',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <strong style={{ fontSize: 14 }}>{Icons.accountType.bank} GoCardless</strong>
                                            {apiKeysLoaded?.has_gocardless && <span className="chip chip-success" style={{ marginLeft: 'auto' }}>Připojeno</span>}
                                        </div>
                                        <div style={{ display: 'grid', gap: 6 }}>
                                            <input type="text" className="input" placeholder="Secret ID" value={gocardlessId} onChange={e => setGocardlessId(e.target.value)} style={{ fontSize: 13 }} />
                                            <input type="password" className="input" placeholder="Secret Key" value={gocardlessKey} onChange={e => setGocardlessKey(e.target.value)} style={{ fontSize: 13 }} />
                                        </div>
                                        <a href="https://bankaccountdata.gocardless.com/" target="_blank" style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginTop: 6, textAlign: 'right' }}>Získat klíč →</a>
                                    </div>

                                    <div style={{
                                        padding: 12,
                                        borderRadius: 'var(--radius-sm)',
                                        border: apiKeysLoaded?.has_trading212 ? '0.5px solid color-mix(in srgb, var(--pos) 32%, transparent)' : '0.5px solid var(--border)',
                                        background: apiKeysLoaded?.has_trading212 ? 'color-mix(in srgb, var(--pos) 6%, transparent)' : 'transparent',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <strong style={{ fontSize: 14 }}>{Icons.accountType.investment} Trading 212</strong>
                                            {apiKeysLoaded?.has_trading212 && <span className="chip chip-success" style={{ marginLeft: 'auto' }}>Připojeno</span>}
                                        </div>
                                        <input type="password" className="input" placeholder="API Key" value={trading212Key} onChange={e => setTrading212Key(e.target.value)} style={{ fontSize: 13 }} />
                                        <a href="https://trading212.com" target="_blank" style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginTop: 6, textAlign: 'right' }}>Získat klíč →</a>
                                    </div>

                                    <button className="btn btn-primary" onClick={handleSaveKeys} disabled={savingKeys}>
                                        {savingKeys ? 'Ukládám...' : keysSaved ? '✓ Uloženo' : <>{Icons.action.save} Uložit klíče</>}
                                    </button>
                                </div>
                            </SurfaceCard>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

                            <SurfaceCard title="Detekce převodů" sub="Pravidla pro automatické označení interních a rodinných převodů">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{Icons.section.familyAccount} Rodinný účet</div>
                                        <FamilyAccountSettings />
                                    </div>
                                    <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{Icons.section.myAccounts} Moje další účty (spořicí, atd.)</div>
                                        <MyAccountPatterns />
                                    </div>
                                    <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{Icons.nav.transactions} Účty vyloučené z interních převodů (kreditka…)</div>
                                        <TransferExcludedAccounts />
                                    </div>
                                    <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{Icons.envelope.shared} Pravidla dělení společných nákladů</div>
                                        <ShareRulesSettings />
                                    </div>
                                    <button className="btn" onClick={handleDetectTransfers} disabled={detecting}>
                                        {detecting ? 'Detekuji...' : <>{Icons.action.search} Detekovat převody nyní</>}
                                    </button>
                                </div>
                            </SurfaceCard>

                            <SurfaceCard title="Preference">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: 14 }}>Výchozí měna</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Pro zobrazení celkových zůstatků</div>
                                        </div>
                                        <CustomSelect
                                            value="CZK"
                                            onChange={() => {}}
                                            style={{ width: 'auto', minWidth: 160 }}
                                            options={[
                                                { value: 'CZK', label: 'CZK · Koruna' },
                                                { value: 'EUR', label: 'EUR · Euro' },
                                                { value: 'USD', label: 'USD · Dolar' },
                                            ]}
                                        />
                                    </div>
                                </div>
                            </SurfaceCard>

                            <SurfaceCard title="Notifikace" sub="Push upozornění na selhaný sync a končící souhlas banky">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {!pushSupported ? (
                                        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                                            Tenhle prohlížeč push notifikace nepodporuje.
                                        </div>
                                    ) : pushSubscribed ? (
                                        <>
                                            <div style={{ fontSize: 13, color: 'var(--pos)' }}>✓ Notifikace jsou na tomhle zařízení zapnuté.</div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className="btn btn-sm" onClick={handleTestPush}>Poslat test</button>
                                                <button className="btn btn-sm" onClick={disablePush} disabled={pushBusy} style={{ color: 'var(--neg)' }}>Vypnout</button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                                                Dostaneš upozornění, když sync některého účtu selže nebo když bude souhlas s bankou do 7 dní vypršet.
                                            </div>
                                            <button className="btn btn-primary" onClick={enablePush} disabled={pushBusy}>
                                                {pushBusy ? 'Zapínám…' : 'Zapnout notifikace'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </SurfaceCard>

                        </div>
                    </div>
                )}

                {/* TAB: MENU */}
                {tab === 'menu' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        <SurfaceCard title="Menu a navigace" sub="Vyber, které stránky chceš v hlavním menu">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {NAV_PAGES.map(page => {
                                    const locked = page.href === '/';
                                    const placement = navPlacements[page.href];
                                    return (
                                        <div key={page.href} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                                            <span style={{ fontSize: 14, fontWeight: 500 }}>{page.label}</span>
                                            {locked ? (
                                                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>vždy v menu</span>
                                            ) : (
                                                <div className="seg">
                                                    {([['menu', 'Menu'], ['quick', 'Rychlé akce'], ['hidden', 'Skrýt']] as [NavPlacement, string][]).map(([val, label]) => (
                                                        <button
                                                            key={val}
                                                            type="button"
                                                            className={`seg-item ${placement === val ? 'active' : ''}`}
                                                            onClick={() => setNavPlacement(page.href, val)}
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                                    Na mobilu jsou první 4 položky menu ve spodní liště, zbytek v menu draweru. Skryté stránky zůstávají dostupné přes přímý odkaz.
                                </div>
                            </div>
                        </SurfaceCard>
                    </div>
                )}

                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        </MainLayout>
    );
}
