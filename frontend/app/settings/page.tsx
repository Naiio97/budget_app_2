'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import CustomSelect from '@/components/CustomSelect';
import { syncData, getSyncStatus, SyncStatus, getDashboard, getApiKeys, saveApiKeys, ApiKeysResponse, getInstitutions, connectBank, updateAccount, deleteAccount, Account } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

interface Institution { id: string; name: string; logo?: string; bic?: string; }
interface CategoryRule { id: number; pattern: string; category: string; is_user_defined: boolean; match_count: number; }
interface Category { id: number; name: string; icon: string; color: string; order_index: number; is_income: boolean; is_active: boolean; }

const CATEGORY_PALETTE = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#14b8a6',
    '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#6b7280', '#111827',
];
const EMOJI_OPTIONS = ['🍔', '🚗', '💡', '🎬', '🛒', '💰', '📈', '💵', '🔄', '📦', '🏥', '🏠', '✈️', '🎮', '📱', '👕', '💄', '🐕', '🎁', '⚡'];

// ── Card helpers ──────────────────────────────────────────────
function SurfaceCard({ title, sub, children, action, className = '' }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
    return (
        <section className={`surface ${className}`} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
                </div>
                {action}
            </div>
            <div className="card-body">{children}</div>
        </section>
    );
}

// ── Category manager ──────────────────────────────────────────
function CategoryManager({ onCategoriesChange }: { onCategoriesChange?: () => void }) {
    const queryClient = useQueryClient();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newCategory, setNewCategory] = useState({ name: '', icon: '📦', color: CATEGORY_PALETTE[0], is_income: false });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState({ name: '', icon: '', color: '', is_income: false });

    const loadCategories = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/categories/`);
            const data = await res.json();
            setCategories(Array.isArray(data) ? data : []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadCategories(); }, [loadCategories]);

    const invalidate = () => { queryClient.invalidateQueries({ queryKey: queryKeys.categories }); onCategoriesChange?.(); };

    const handleAdd = async () => {
        if (!newCategory.name.trim()) return;
        await fetch(`${API_BASE}/categories/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCategory) });
        setNewCategory({ name: '', icon: '📦', color: CATEGORY_PALETTE[0], is_income: false });
        setShowAdd(false);
        loadCategories();
        invalidate();
    };

    const handleUpdate = async (id: number) => {
        await fetch(`${API_BASE}/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editData) });
        setEditingId(null);
        loadCategories();
        invalidate();
    };

    const handleDelete = async (id: number) => {
        await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
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

    return (
        <div className="settings-category-manager">
            {showAdd ? (
                <div style={{ padding: 14, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <CustomSelect
                            value={newCategory.icon}
                            onChange={(val) => setNewCategory({ ...newCategory, icon: val })}
                            style={{ width: 80 }}
                            options={EMOJI_OPTIONS.map(e => ({ value: e, label: e }))}
                        />
                        <input
                            className="input"
                            placeholder="Název kategorie"
                            value={newCategory.name}
                            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                            style={{ flex: 1 }}
                        />
                    </div>
                    <ColorSwatches value={newCategory.color} onChange={(c) => setNewCategory({ ...newCategory, color: c })} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newCategory.is_income} onChange={(e) => setNewCategory({ ...newCategory, is_income: e.target.checked })} />
                        Je to příjem
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" onClick={handleAdd} style={{ flex: 1 }}>Přidat</button>
                        <button className="btn" onClick={() => setShowAdd(false)}>Zrušit</button>
                    </div>
                </div>
            ) : (
                <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginBottom: 12, width: '100%' }}>
                    {Icons.action.add} Přidat kategorii
                </button>
            )}

            <div className="settings-scroll-list settings-category-list">
                {categories.filter(c => c.is_active).map(cat => (
                    <div key={cat.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px',
                        background: 'var(--surface-sunken)',
                        borderRadius: 'var(--radius-sm)',
                        borderLeft: `3px solid ${cat.color}`,
                    }}>
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
                                <span style={{ fontSize: 18 }}>{cat.icon}</span>
                                <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>
                                    {cat.name}
                                    {cat.is_income && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--pos)' }}>· příjem</span>}
                                </span>
                                <button className="btn btn-sm" onClick={() => { setEditingId(cat.id); setEditData({ name: cat.name, icon: cat.icon, color: cat.color, is_income: cat.is_income }); }}>{Icons.action.edit}</button>
                                <button className="btn btn-sm" onClick={() => handleDelete(cat.id)} style={{ color: 'var(--neg)' }}>{Icons.action.delete}</button>
                            </>
                        )}
                    </div>
                ))}
            </div>
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
                const res = await fetch(`${API_BASE}/settings/family-accounts`);
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
            const res = await fetch(`${API_BASE}/settings/family-accounts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: familyPattern, name: familyName }),
            });
            if (res.ok) { setSaved(true); setHasExisting(true); setTimeout(() => setSaved(false), 2000); }
        } finally { setSaving(false); }
    };

    const remove = async () => {
        await fetch(`${API_BASE}/settings/family-accounts`, { method: 'DELETE' });
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
                const res = await fetch(`${API_BASE}/settings/my-account-patterns`);
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
            const res = await fetch(`${API_BASE}/settings/my-account-patterns`, {
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
    const [swipedAccount, setSwipedAccount] = useState<string | null>(null);
    const swipeStart = useRef<{ x: number; y: number } | null>(null);

    // Banks
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [loadingBanks, setLoadingBanks] = useState(false);
    const [connectingBank, setConnectingBank] = useState<string | null>(null);

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
    const [ruleCategories, setRuleCategories] = useState<Category[]>([]);

    // Manual account creation
    const [showAddManual, setShowAddManual] = useState(false);
    const [newManualName, setNewManualName] = useState('');
    const [newManualBalance, setNewManualBalance] = useState('');
    const [newManualAccountNumber, setNewManualAccountNumber] = useState('');
    const [savingManual, setSavingManual] = useState(false);

    const loadCategoryRules = useCallback(async () => {
        try {
            const r = await fetch(`${API_BASE}/settings/category-rules`);
            if (r.ok) {
                const data = await r.json();
                setCategoryRules(data.rules || []);
            }
            const c = await fetch(`${API_BASE}/categories/`);
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
                    await fetch(`${API_BASE}/accounts/connect/bank/callback?ref=${ref}`);
                    window.history.replaceState({}, '', '/settings');
                } catch (err) { console.error(err); }
            }
            try {
                const [status, dashData, keys] = await Promise.all([getSyncStatus(), getDashboard(), getApiKeys()]);
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
            if (id.startsWith('manual-')) {
                await fetch(`${API_BASE}/manual-accounts/${id.replace('manual-', '')}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName }) });
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
            if (id.startsWith('manual-')) {
                await fetch(`${API_BASE}/manual-accounts/${id.replace('manual-', '')}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_visible: !currentVisibility }) });
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
            if (id.startsWith('manual-')) {
                await fetch(`${API_BASE}/manual-accounts/${id.replace('manual-', '')}`, { method: 'DELETE' });
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
            const res = await fetch(`${API_BASE}/manual-accounts/`, {
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
                const dashData = await getDashboard();
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
            const dashData = await getDashboard();
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
            const res = await fetch(`${API_BASE}/sync/detect-transfers`, { method: 'POST' });
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
            const r = await fetch(`${API_BASE}/settings/category-rules`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: newPattern, category: newRuleCategory }),
            });
            if (r.ok) { setNewPattern(''); loadCategoryRules(); }
        } finally { setSavingRule(false); }
    };

    const handleDeleteRule = async (id: number) => {
        await fetch(`${API_BASE}/settings/category-rules/${id}`, { method: 'DELETE' });
        setCategoryRules(categoryRules.filter(r => r.id !== id));
    };

    const handleRecategorize = async () => {
        setIsSyncing(true);
        try {
            await fetch(`${API_BASE}/sync/recategorize`, { method: 'POST' });
            alert('Transakce byly překategorizovány.');
        } finally { setIsSyncing(false); }
    };

    const formatLastSync = (dateStr: string | null) => {
        if (!dateStr) return 'Nikdy';
        return new Date(dateStr).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const startAccountSwipe = (event: React.TouchEvent, accountId: string) => {
        if (editingAccount) return;
        const touch = event.touches[0];
        swipeStart.current = { x: touch.clientX, y: touch.clientY };
        if (swipedAccount && swipedAccount !== accountId) setSwipedAccount(null);
    };

    const endAccountSwipe = (event: React.TouchEvent, accountId: string) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || editingAccount) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        setSwipedAccount(dx < 0 ? accountId : null);
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
        <MainLayout>
            <div className={`page-container settings-page ${tab === 'categories' ? 'settings-page-fit' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--spacing-lg)' }}>

                        <SurfaceCard title="Moje účty" sub={`${accounts.length} ${accounts.length === 1 ? 'účet' : accounts.length < 5 ? 'účty' : 'účtů'}`}>
                            {accounts.length === 0 ? (
                                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Zatím žádné připojené účty.</div>
                            ) : (
                                <div className="settings-account-list">
                                    {accounts.map(acc => {
                                        const logo = getBankLogo(acc.institution);
                                        const visible = acc.is_visible !== false;
                                        return (
                                            <div
                                                key={acc.id}
                                                className={`settings-account-row ${editingAccount === acc.id ? 'editing' : ''} ${swipedAccount === acc.id ? 'swiped' : ''}`}
                                                onTouchStart={(event) => startAccountSwipe(event, acc.id)}
                                                onTouchEnd={(event) => endAccountSwipe(event, acc.id)}
                                                style={{ opacity: processingAccount === acc.id ? 0.5 : visible ? 1 : 0.6 }}
                                            >
                                                {logo ? (
                                                    <Image className="settings-account-logo" src={logo} alt={acc.name} width={28} height={28} style={{ objectFit: 'contain', borderRadius: 4 }} />
                                                ) : (
                                                    <span className="settings-account-logo">{acc.type === 'bank' ? Icons.accountType.bank : Icons.accountType.investment}</span>
                                                )}
                                                {editingAccount === acc.id ? (
                                                    <div className="settings-account-edit">
                                                        <input className="input" value={editName} autoFocus onChange={e => setEditName(e.target.value)} style={{ flex: 1 }} />
                                                        <button className="btn btn-sm btn-primary" onClick={() => handleRename(acc.id)}>OK</button>
                                                        <button className="btn btn-sm" onClick={() => setEditingAccount(null)}>✕</button>
                                                    </div>
                                                ) : (
                                                    <div className="settings-account-copy">
                                                        <div className="settings-account-name">
                                                            {acc.name}
                                                        </div>
                                                        <div className="settings-account-meta">
                                                            {acc.institution || acc.type}{!visible && ' · skryto'}
                                                        </div>
                                                    </div>
                                                )}
                                                {editingAccount !== acc.id && (
                                                    <div className="settings-account-actions">
                                                        <button className="btn btn-sm settings-account-rename" onClick={() => { setEditName(acc.name); setEditingAccount(acc.id); setSwipedAccount(null); }} title="Přejmenovat">{Icons.action.edit}</button>
                                                        <button className="btn btn-sm" onClick={() => handleToggleVisibility(acc.id, acc.is_visible ?? true)} title={visible ? 'Skrýt' : 'Zobrazit'}>
                                                            {visible ? Icons.action.visible : Icons.action.hidden}
                                                        </button>
                                                        <button className="btn btn-sm" onClick={() => handleDeleteAccount(acc.id)} style={{ color: 'var(--neg)' }} title="Smazat">{Icons.action.delete}</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </SurfaceCard>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                            <SurfaceCard title="Připojit banku" sub="Přes GoCardless (Open Banking)">
                                {!apiKeysLoaded?.has_gocardless ? (
                                    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                                        Nejdřív zadej GoCardless klíče v záložce <strong>Pokročilé</strong>.
                                    </div>
                                ) : loadingBanks ? (
                                    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Načítám banky...</div>
                                ) : institutions.length === 0 ? (
                                    <button className="btn" onClick={loadBanks}>{Icons.action.sync} Načíst banky</button>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <CustomSelect
                                            options={institutions.map(b => ({ value: b.id, label: b.name, icon: Icons.accountType.bank }))}
                                            value={connectingBank || ''}
                                            onChange={setConnectingBank}
                                            placeholder="Vyberte banku..."
                                            searchable
                                            searchPlaceholder="Hledat banku..."
                                        />
                                        <button className="btn btn-primary" disabled={!connectingBank} onClick={() => connectingBank && handleConnectBank(connectingBank)}>
                                            Připojit a přejít na banku →
                                        </button>
                                    </div>
                                )}
                            </SurfaceCard>

                            <SurfaceCard title="Přidat manuální účet" sub="Pro účty bez API (hotovost, atd.)">
                                {showAddManual ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <input className="input" placeholder="Název účtu" value={newManualName} onChange={e => setNewManualName(e.target.value)} autoFocus />
                                        <input className="input" placeholder="Číslo účtu / IBAN (volitelné)" value={newManualAccountNumber} onChange={e => setNewManualAccountNumber(e.target.value)} />
                                        <input type="number" className="input" placeholder="Počáteční zůstatek (Kč)" value={newManualBalance} onChange={e => setNewManualBalance(e.target.value)} />
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-primary" disabled={savingManual || !newManualName.trim()} onClick={handleCreateManualAccount} style={{ flex: 1 }}>
                                                {savingManual ? 'Vytvářím...' : 'Vytvořit'}
                                            </button>
                                            <button className="btn" onClick={() => { setShowAddManual(false); setNewManualName(''); setNewManualBalance(''); setNewManualAccountNumber(''); }}>Zrušit</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button className="btn" onClick={() => setShowAddManual(true)} style={{ width: '100%' }}>
                                        {Icons.action.add} Nový manuální účet
                                    </button>
                                )}
                            </SurfaceCard>
                        </div>
                    </div>
                )}

                {/* TAB: CATEGORIES */}
                {tab === 'categories' && (
                    <div className="settings-categories-grid">

                        <SurfaceCard title="Správa kategorií" sub="Přidej, uprav, nebo skryj kategorie" className="settings-category-card">
                            <CategoryManager onCategoriesChange={loadCategoryRules} />
                        </SurfaceCard>

                        <div className="settings-rules-column">

                            <SurfaceCard title="Přidat pravidlo" sub="Když popis transakce obsahuje text, přiřadí se kategorie" className="settings-add-rule-card">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <input className="input" placeholder='Např. "billa" nebo "uber"' value={newPattern} onChange={e => setNewPattern(e.target.value)} />
                                    <CustomSelect
                                        value={newRuleCategory}
                                        onChange={setNewRuleCategory}
                                        options={ruleCategories.filter(c => c.is_active).map(c => ({ value: c.name, label: c.name, icon: c.icon }))}
                                    />
                                    <button className="btn btn-primary" onClick={handleAddRule} disabled={savingRule || !newPattern.trim()}>
                                        {savingRule ? 'Ukládám...' : `${Icons.action.add} Přidat pravidlo`}
                                    </button>
                                    <button className="btn" onClick={handleRecategorize} disabled={isSyncing} style={{ marginTop: 4 }}>
                                        {isSyncing ? 'Překategorizovávám...' : `${Icons.action.sync} Překategorizovat všechny transakce`}
                                    </button>
                                </div>
                            </SurfaceCard>

                            <SurfaceCard title="Pravidla kategorií" sub={`${categoryRules.length} pravidel`} className="settings-rules-card">
                                {categoryRules.length === 0 ? (
                                    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                                        Zatím žádná pravidla. Přidej nahoře nebo změň kategorii u transakce.
                                    </div>
                                ) : (
                                    <div className="settings-scroll-list settings-rules-list">
                                        {categoryRules.map(rule => (
                                            <div key={rule.id} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 12px',
                                                background: rule.is_user_defined ? 'color-mix(in srgb, var(--accent) 8%, var(--surface-sunken))' : 'var(--surface-sunken)',
                                                borderRadius: 'var(--radius-sm)',
                                                border: rule.is_user_defined ? '0.5px solid color-mix(in srgb, var(--accent) 24%, transparent)' : '0.5px solid var(--border)',
                                            }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                                                        &apos;{rule.pattern}&apos; → {rule.category}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                                        {rule.is_user_defined ? `${Icons.rule.userDefined} Vlastní` : `${Icons.rule.learned} Naučené`} · {rule.match_count}× použito
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteRule(rule.id)} className="btn btn-sm" style={{ color: 'var(--neg)' }}>{Icons.action.delete}</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SurfaceCard>
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
