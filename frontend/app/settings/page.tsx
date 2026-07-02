'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import { syncData, getSyncStatus, SyncStatus, getDashboard, getApiKeys, saveApiKeys, ApiKeysResponse, getInstitutions, connectBank, updateAccount, deleteAccount, updateManualInvestment, deleteManualInvestment, Account, apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';

interface Institution { id: string; name: string; logo?: string; bic?: string; }
interface CategoryRule { id: number; pattern: string; category: string; is_user_defined: boolean; match_count: number; }
interface Category { id: number; name: string; icon: string; color: string; order_index: number; is_income: boolean; is_active: boolean; }

const CATEGORY_PALETTE = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#14b8a6',
    '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280', '#111827',
];
const EMOJI_OPTIONS = ['🍔', '🚗', '💡', '🎬', '🛒', '💰', '📈', '💵', '🔄', '📦', '🏥', '🏠', '✈️', '🎮', '📱', '👕', '💄', '🐕', '🎁', '⚡'];

// ── Card helpers ──────────────────────────────────────────────
// Crisp line icons for the settings redesign (the global Icons map is emoji).
const SvgIcon = ({ children }: { children: React.ReactNode }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const EditIcon = <SvgIcon><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></SvgIcon>;
const TrashIcon = <SvgIcon><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></SvgIcon>;
const SearchIcon = <SvgIcon><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></SvgIcon>;
const CloseIcon = <SvgIcon><path d="M18 6 6 18M6 6l12 12" /></SvgIcon>;
const EyeIcon = <SvgIcon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></SvgIcon>;
const EyeOffIcon = <SvgIcon><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A11 11 0 0 1 12 5c6.5 0 10 7 10 7a13 13 0 0 1-2.16 3.19" /><path d="M6.61 6.61A13 13 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.39-1.39" /><path d="m2 2 20 20" /></SvgIcon>;
const BankIcon = <SvgIcon><path d="M3 22h18" /><path d="M6 18v-7M10 18v-7M14 18v-7M18 18v-7" /><path d="M12 2 21 7H3z" /></SvgIcon>;

function SurfaceCard({ title, sub, children, action, className = '' }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
    return (
        <section className={`surface ${className}`} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-head" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    {action}
                </div>
                {sub && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</div>}
            </div>
            <div className="card-body">{children}</div>
        </section>
    );
}

// ── Category manager ──────────────────────────────────────────
function CategoryManager({ onCategoriesChange, showAdd, setShowAdd }: { onCategoriesChange?: () => void; showAdd: boolean; setShowAdd: (v: boolean) => void }) {
    const queryClient = useQueryClient();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCategory, setNewCategory] = useState({ name: '', icon: '📦', color: CATEGORY_PALETTE[0], is_income: false });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState({ name: '', icon: '', color: '', is_income: false });

    const loadCategories = useCallback(async () => {
        try {
            const res = await apiFetch(`/categories/`);
            const data = await res.json();
            setCategories(Array.isArray(data) ? data : []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadCategories(); }, [loadCategories]);

    const invalidate = () => { queryClient.invalidateQueries({ queryKey: queryKeys.categories }); onCategoriesChange?.(); };

    const handleAdd = async () => {
        if (!newCategory.name.trim()) return;
        await apiFetch(`/categories/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCategory) });
        setNewCategory({ name: '', icon: '📦', color: CATEGORY_PALETTE[0], is_income: false });
        setShowAdd(false);
        loadCategories();
        invalidate();
    };

    const handleUpdate = async (id: number) => {
        await apiFetch(`/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editData) });
        setEditingId(null);
        loadCategories();
        invalidate();
    };

    const handleDelete = async (id: number) => {
        await apiFetch(`/categories/${id}`, { method: 'DELETE' });
        loadCategories();
        invalidate();
    };

    if (loading) return <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Načítám kategorie...</div>;

    const ColorSwatches = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CATEGORY_PALETTE.map(c => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    aria-label={c}
                    style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: c,
                        border: value === c ? '2px solid var(--text)' : '2px solid transparent',
                        cursor: 'pointer', padding: 0,
                    }}
                />
            ))}
        </div>
    );

    const activeCategories = categories.filter(c => c.is_active);

    return (
        <div className="settings-category-manager">
            <div className="settings-scroll-list settings-category-list">
                {activeCategories.map(cat => (
                    <div key={cat.id} className="set-cat-row">
                        {editingId === cat.id ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <CustomSelect
                                        value={editData.icon}
                                        onChange={(val) => setEditData({ ...editData, icon: val })}
                                        style={{ width: 80 }}
                                        options={EMOJI_OPTIONS.map(e => ({ value: e, label: e }))}
                                    />
                                    <input
                                        className="input"
                                        value={editData.name}
                                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                                <ColorSwatches value={editData.color} onChange={(c) => setEditData({ ...editData, color: c })} />
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(cat.id)}>Uložit</button>
                                    <button className="btn btn-sm" onClick={() => setEditingId(null)}>Zrušit</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <span className="set-cat-accent" style={{ background: cat.color }} />
                                <span className="set-cat-emoji">{cat.icon}</span>
                                <span className="set-cat-name">{cat.name}</span>
                                <span className={`set-tag ${cat.is_income ? 'income' : ''}`}>{cat.is_income ? 'Příjem' : 'Výdaj'}</span>
                                <div className="set-row-actions">
                                    <button className="set-icon-btn" title="Upravit" onClick={() => { setEditingId(cat.id); setEditData({ name: cat.name, icon: cat.icon, color: cat.color, is_income: cat.is_income }); }}>{EditIcon}</button>
                                    <button className="set-icon-btn danger" title="Smazat" onClick={() => handleDelete(cat.id)}>{TrashIcon}</button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {showAdd && (
                <div className="set-modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="set-modal" onClick={e => e.stopPropagation()}>
                        <div className="set-modal-head">
                            <h3 style={{ margin: 0 }}>Nová kategorie</h3>
                            <button className="set-icon-btn" title="Zavřít" onClick={() => setShowAdd(false)}>{CloseIcon}</button>
                        </div>
                        <div>
                            <label className="set-field-label">Ikona a název</label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <CustomSelect
                                    value={newCategory.icon}
                                    onChange={(val) => setNewCategory({ ...newCategory, icon: val })}
                                    style={{ width: 80 }}
                                    options={EMOJI_OPTIONS.map(e => ({ value: e, label: e }))}
                                />
                                <input
                                    className="input"
                                    autoFocus
                                    placeholder="Název kategorie"
                                    value={newCategory.name}
                                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && newCategory.name.trim()) handleAdd(); }}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="set-field-label">Barva</label>
                            <ColorSwatches value={newCategory.color} onChange={(c) => setNewCategory({ ...newCategory, color: c })} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={newCategory.is_income} onChange={(e) => setNewCategory({ ...newCategory, is_income: e.target.checked })} />
                            Je to příjem
                        </label>
                        <button className="btn btn-primary" onClick={handleAdd} disabled={!newCategory.name.trim()}>{Icons.action.add} Přidat kategorii</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Family account ────────────────────────────────────────────
function FamilyAccountSettings() {
    const [familyPattern, setFamilyPattern] = useState('');
    const [familyName, setFamilyName] = useState('Partner');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasExisting, setHasExisting] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch(`/settings/family-accounts`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.accounts?.length > 0) {
                        setHasExisting(true);
                        setFamilyPattern(data.accounts[0].pattern);
                        setFamilyName(data.accounts[0].name);
                    }
                }
            } catch (err) { console.error(err); }
        })();
    }, []);

    const save = async () => {
        if (!familyPattern.trim()) return;
        setSaving(true);
        try {
            const res = await apiFetch(`/settings/family-accounts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: familyPattern, name: familyName }),
            });
            if (res.ok) { setSaved(true); setHasExisting(true); setTimeout(() => setSaved(false), 2000); }
        } finally { setSaving(false); }
    };

    const remove = async () => {
        await apiFetch(`/settings/family-accounts`, { method: 'DELETE' });
        setHasExisting(false); setFamilyPattern(''); setFamilyName('Partner');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Transakce obsahující tento text budou automaticky vyloučeny z příjmů a výdajů jako rodinný převod.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input className="input" placeholder="Jméno (Partner, ...)" value={familyName} onChange={e => setFamilyName(e.target.value)} />
                <input className="input" placeholder="Text (Sandri, IBAN, ...)" value={familyPattern} onChange={e => setFamilyPattern(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={saving || !familyPattern.trim()} onClick={save} style={{ flex: 1 }}>
                    {saving ? 'Ukládám...' : saved ? '✓ Uloženo' : 'Uložit rodinný účet'}
                </button>
                {hasExisting && <button className="btn" onClick={remove} style={{ color: 'var(--neg)' }}>{Icons.action.delete}</button>}
            </div>
        </div>
    );
}

// ── My account patterns (internal transfers) ──────────────────
function MyAccountPatterns() {
    const [patterns, setPatterns] = useState<string[]>([]);
    const [newPattern, setNewPattern] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch(`/settings/my-account-patterns`);
                if (res.ok) {
                    const data = await res.json();
                    setPatterns(data.patterns || []);
                }
            } catch (err) { console.error(err); }
        })();
    }, []);

    const addPattern = () => {
        const t = newPattern.toLowerCase().trim();
        if (!t || patterns.includes(t)) return;
        setPatterns([...patterns, t]);
        setNewPattern('');
    };

    const removePattern = (p: string) => setPatterns(patterns.filter(x => x !== p));

    const save = async () => {
        setSaving(true);
        try {
            const res = await apiFetch(`/settings/my-account-patterns`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patterns }),
            });
            if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
        } finally { setSaving(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Texty v popisu transakcí, které označí transakci jako interní převod (mezi tvými účty).
            </div>
            {patterns.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {patterns.map(p => (
                        <span key={p} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {p}
                            <button onClick={() => removePattern(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>✕</button>
                        </span>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="Např. spořící, savings, IBAN..." value={newPattern} onChange={e => setNewPattern(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPattern()} style={{ flex: 1 }} />
                <button className="btn" onClick={addPattern} disabled={!newPattern.trim()}>{Icons.action.add}</button>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Ukládám...' : saved ? '✓ Uloženo' : 'Uložit vzory'}
            </button>
        </div>
    );
}

// ── Main settings page ────────────────────────────────────────
type Tab = 'accounts' | 'categories' | 'advanced';

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
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [detecting, setDetecting] = useState(false);

    // Category rules
    const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
    const [newPattern, setNewPattern] = useState('');
    const [newRuleCategory, setNewRuleCategory] = useState('Food');
    const [savingRule, setSavingRule] = useState(false);
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [showConnectBank, setShowConnectBank] = useState(false);
    const [detailRule, setDetailRule] = useState<CategoryRule | null>(null);
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
    }, [loadBanks, loadCategoryRules, refreshAccounts]);

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
        } finally { setIsSyncing(false); }
    };

    const handleDetectTransfers = async () => {
        setDetecting(true);
        try {
            const res = await apiFetch(`/sync/detect-transfers`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                alert(`Detekce hotová.\nInterní převody: ${data.marked_internal_transfers ?? 0}\nMoje účty: ${data.marked_my_account_transfers ?? 0}\nRodinné: ${data.marked_family_transfers ?? 0}`);
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

    const handleRecategorize = async () => {
        setIsSyncing(true);
        try {
            await apiFetch(`/sync/recategorize`, { method: 'POST' });
            alert('Transakce byly překategorizovány.');
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
                    {([['accounts', 'Účty'], ['categories', 'Kategorie'], ['advanced', 'Pokročilé']] as [Tab, string][]).map(([val, label]) => (
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
                                                            <div className="set-acc-meta">{acc.institution || acc.type}</div>
                                                        </div>
                                                        {!visible && <span className="set-tag">Skryto</span>}
                                                        <div className="set-row-actions">
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
                                {savingManual ? 'Vytvářím...' : `${Icons.action.add} Vytvořit účet`}
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

                        <SurfaceCard
                            title="Pravidla"
                            sub="Když popis transakce obsahuje text, automaticky se přiřadí kategorie."
                            action={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    <span className="set-count-chip">{categoryRules.length} pravidel</span>
                                    <button className="btn btn-sm" onClick={handleRecategorize} disabled={isSyncing} title="Překategorizovat všechny transakce">
                                        {isSyncing ? '…' : `${Icons.action.sync} Sync`}
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
                                <div className="settings-scroll-list settings-rules-list">
                                    {categoryRules.map(rule => {
                                        const catColor = ruleCategories.find(c => c.name === rule.category)?.color ?? 'var(--text-3)';
                                        return (
                                            <button key={rule.id} type="button" className="set-rule-row" onClick={() => setDetailRule(rule)}>
                                                <span className="set-rule-pattern">„{rule.pattern}“</span>
                                                <span className="set-rule-arrow">→</span>
                                                <span className="set-rule-dot" style={{ background: catColor }} />
                                                <span className="set-rule-cat">{rule.category}</span>
                                                <span className="set-rule-chevron">›</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </SurfaceCard>
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
                                    options={ruleCategories.filter(c => c.is_active).map(c => ({ value: c.name, label: c.name, icon: c.icon }))}
                                />
                            </div>
                            <button className="btn btn-primary" onClick={handleAddRule} disabled={savingRule || !newPattern.trim()}>
                                {savingRule ? 'Ukládám...' : `${Icons.action.add} Přidat pravidlo`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Rule detail modal */}
                {tab === 'categories' && detailRule && (
                    <div className="set-modal-overlay" onClick={() => setDetailRule(null)}>
                        <div className="set-modal" onClick={e => e.stopPropagation()}>
                            <div className="set-modal-head">
                                <h3 style={{ margin: 0 }}>Detail pravidla</h3>
                                <button className="set-icon-btn" title="Zavřít" onClick={() => setDetailRule(null)}>{CloseIcon}</button>
                            </div>
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
                                <div className="set-modal-value">{detailRule.is_user_defined ? 'Vlastní pravidlo' : 'Naučené'} · {detailRule.match_count}× použito</div>
                            </div>
                            <button className="btn" style={{ color: 'var(--neg)' }} onClick={() => { handleDeleteRule(detailRule.id); setDetailRule(null); }}>
                                {TrashIcon} Smazat pravidlo
                            </button>
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
                                        {isSyncing ? `${Icons.status.loading} Synchronizuji...` : `${Icons.action.sync} Synchronizovat data`}
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
                                        {savingKeys ? 'Ukládám...' : keysSaved ? '✓ Uloženo' : `${Icons.action.save} Uložit klíče`}
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
                                    <button className="btn" onClick={handleDetectTransfers} disabled={detecting}>
                                        {detecting ? 'Detekuji...' : `${Icons.action.search} Detekovat převody nyní`}
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

                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
