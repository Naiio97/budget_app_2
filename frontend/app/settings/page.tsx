'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import CustomSelect from '@/components/CustomSelect';
import { syncData, getSyncStatus, SyncStatus, getDashboard, getApiKeys, saveApiKeys, ApiKeysResponse, getInstitutions, connectBank, updateAccount, deleteAccount, Account } from '@/lib/api';
import { useAccounts } from '@/contexts/AccountsContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

interface Institution {
    id: string;
    name: string;
    logo: string;
    bic?: string;
}

interface CategoryRule {
    id: number;
    pattern: string;
    category: string;
    is_user_defined: boolean;
    match_count: number;
}

interface FamilyAccount {
    pattern: string;
    name: string;
}

interface Category {
    id: number;
    name: string;
    icon: string;
    color: string;
    order_index: number;
    is_income: boolean;
    is_active: boolean;
}

function CategoryManager({ onCategoriesChange }: { onCategoriesChange?: () => void }) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newCategory, setNewCategory] = useState({ name: '', icon: '📦', color: '#6366f1', is_income: false });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState({ name: '', icon: '', color: '', is_income: false });

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const res = await fetch(`${API_BASE}/categories/`);
            const data = await res.json();
            setCategories(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load categories:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newCategory.name.trim()) return;
        try {
            await fetch(`${API_BASE}/categories/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newCategory)
            });
            setNewCategory({ name: '', icon: '📦', color: '#6366f1', is_income: false });
            setShowAdd(false);
            loadCategories();
            onCategoriesChange?.();
        } catch (err) {
            console.error('Failed to add category:', err);
        }
    };

    const handleUpdate = async (id: number) => {
        try {
            await fetch(`${API_BASE}/categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editData)
            });
            setEditingId(null);
            loadCategories();
            onCategoriesChange?.();
        } catch (err) {
            console.error('Failed to update category:', err);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
            loadCategories();
            onCategoriesChange?.();
        } catch (err) {
            console.error('Failed to delete category:', err);
        }
    };

    const EMOJI_OPTIONS = ['🍔', '🚗', '💡', '🎬', '🛒', '💰', '📈', '💵', '🔄', '📦', '🏥', '🏠', '✈️', '🎮', '📱', '👕', '💄', '🐕', '🎁', '⚡'];

    if (loading) return <p className="text-secondary">Načítám kategorie...</p>;

    return (
        <div>
            {/* Add new category */}
            {showAdd ? (
                <div style={{ padding: 'var(--spacing-md)', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: 'var(--spacing-md)' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <CustomSelect
                            value={newCategory.icon}
                            onChange={(val) => setNewCategory({ ...newCategory, icon: val })}
                            style={{ width: '80px' }}
                            options={EMOJI_OPTIONS.map(e => ({ value: e, label: e }))}
                        />
                        <input
                            type="text"
                            className="input"
                            placeholder="Název kategorie"
                            value={newCategory.name}
                            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                            style={{ flex: 1 }}
                        />
                        <input
                            type="color"
                            value={newCategory.color}
                            onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                            style={{ width: '40px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={newCategory.is_income}
                                onChange={(e) => setNewCategory({ ...newCategory, is_income: e.target.checked })}
                            />
                            Je to příjem
                        </label>
                        <div style={{ flex: 1 }} />
                        <button className="btn btn-primary" onClick={handleAdd} style={{ padding: '6px 12px' }}>Přidat</button>
                        <button className="btn" onClick={() => setShowAdd(false)} style={{ padding: '6px 12px' }}>Zrušit</button>
                    </div>
                </div>
            ) : (
                <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ marginBottom: 'var(--spacing-md)', width: '100%' }}>
                    ➕ Přidat kategorii
                </button>
            )}

            {/* Categories list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '350px', overflowY: 'auto' }}>
                {categories.filter(c => c.is_active).map(cat => (
                    <div key={cat.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '6px',
                        borderLeft: `3px solid ${cat.color}`
                    }}>
                        {editingId === cat.id ? (
                            <>
                                <CustomSelect
                                    value={editData.icon}
                                    onChange={(val) => setEditData({ ...editData, icon: val })}
                                    style={{ width: '80px', padding: '4px' }}
                                    options={EMOJI_OPTIONS.map(e => ({ value: e, label: e }))}
                                />
                                <input
                                    type="text"
                                    className="input"
                                    value={editData.name}
                                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                    style={{ flex: 1, padding: '4px 8px' }}
                                />
                                <input
                                    type="color"
                                    value={editData.color}
                                    onChange={(e) => setEditData({ ...editData, color: e.target.value })}
                                    style={{ width: '30px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                />
                                <button className="btn" onClick={() => handleUpdate(cat.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>✓</button>
                                <button className="btn" onClick={() => setEditingId(null)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>✕</button>
                            </>
                        ) : (
                            <>
                                <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
                                <span style={{ flex: 1, fontWeight: 500, fontSize: '0.9rem' }}>
                                    {cat.name}
                                    {cat.is_income && <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--accent-success)' }}>příjem</span>}
                                </span>
                                <button
                                    onClick={() => { setEditingId(cat.id); setEditData({ name: cat.name, icon: cat.icon, color: cat.color, is_income: cat.is_income }); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '0.8rem' }}
                                >✏️</button>
                                <button
                                    onClick={() => handleDelete(cat.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b6b', fontSize: '0.8rem' }}
                                >🗑️</button>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}


function FamilyAccountSettings() {
    const [familyPattern, setFamilyPattern] = useState('');
    const [familyName, setFamilyName] = useState('Partner');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [existingAccount, setExistingAccount] = useState<FamilyAccount | null>(null);

    useEffect(() => {
        loadFamilyAccount();
    }, []);

    const loadFamilyAccount = async () => {
        try {
            const response = await fetch(`${API_BASE}/settings/family-accounts`);
            if (response.ok) {
                const data = await response.json();
                if (data.accounts && data.accounts.length > 0) {
                    setExistingAccount(data.accounts[0]);
                    setFamilyPattern(data.accounts[0].pattern);
                    setFamilyName(data.accounts[0].name);
                }
            }
        } catch (err) {
            console.error('Failed to load family account:', err);
        }
    };

    const handleSave = async () => {
        if (!familyPattern.trim()) return;
        setSaving(true);
        try {
            const response = await fetch(`${API_BASE}/settings/family-accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: familyPattern, name: familyName })
            });
            if (response.ok) {
                setSaved(true);
                setExistingAccount({ pattern: familyPattern, name: familyName });
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (err) {
            console.error('Failed to save family account:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await fetch(`${API_BASE}/settings/family-accounts`, { method: 'DELETE' });
            setExistingAccount(null);
            setFamilyPattern('');
            setFamilyName('Partner');
        } catch (err) {
            console.error('Failed to delete family account:', err);
        }
    };

    const handleDetectTransfers = async () => {
        setDetecting(true);
        try {
            const response = await fetch(`${API_BASE}/sync/detect-transfers`, { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                alert(`Detekce dokončena!\n\n🔄 Interní převody: ${data.marked_internal_transfers}\n👨‍👩‍👧 Rodinné převody: ${data.marked_family_transfers}`);
            }
        } catch (err) {
            console.error('Failed to detect transfers:', err);
        } finally {
            setDetecting(false);
        }
    };

    return (
        <GlassCard>
            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>👨‍👩‍👧 Rodinný účet</h3>
            <p className="text-tertiary" style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-md)' }}>
                Transakce obsahující tento text budou automaticky vyloučeny z příjmů a výdajů.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                <div>
                    <label className="text-secondary" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                        Jméno (volitelné)
                    </label>
                    <input
                        type="text"
                        className="input"
                        placeholder="Partner, Manželka, ..."
                        value={familyName}
                        onChange={(e) => setFamilyName(e.target.value)}
                    />
                </div>

                <div>
                    <label className="text-secondary" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>
                        Text v popisu transakce
                    </label>
                    <input
                        type="text"
                        className="input"
                        placeholder="Sandri, Manželka, ..."
                        value={familyPattern}
                        onChange={(e) => setFamilyPattern(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || !familyPattern.trim()}
                        style={{ flex: 1 }}
                    >
                        {saving ? '⏳ Ukládám...' : saved ? '✅ Uloženo' : '💾 Uložit'}
                    </button>
                    {existingAccount && (
                        <button
                            className="btn"
                            onClick={handleDelete}
                            style={{ color: '#ff6b6b', borderColor: 'rgba(255,100,100,0.3)' }}
                        >
                            🗑️
                        </button>
                    )}
                </div>
            </div>

            <div style={{ marginTop: 'var(--spacing-xl)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                    className="btn"
                    onClick={handleDetectTransfers}
                    disabled={detecting}
                    style={{ width: '100%' }}
                >
                    {detecting ? '⏳ Detekuji...' : '🔍 Detekovat převody'}
                </button>
                <p className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: '8px' }}>
                    Automaticky najde interní převody mezi vlastními účty a transakce s rodinným účtem.
                </p>
            </div>
        </GlassCard>
    );
}


function MyAccountPatterns() {
    const [patterns, setPatterns] = useState<string[]>([]);
    const [newPattern, setNewPattern] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [detecting, setDetecting] = useState(false);

    useEffect(() => {
        loadPatterns();
    }, []);

    const loadPatterns = async () => {
        try {
            const response = await fetch(`${API_BASE}/settings/my-account-patterns`);
            if (response.ok) {
                const data = await response.json();
                setPatterns(data.patterns || []);
            }
        } catch (err) {
            console.error('Failed to load patterns:', err);
        }
    };

    const handleAddPattern = () => {
        if (!newPattern.trim() || patterns.includes(newPattern.toLowerCase().trim())) return;
        setPatterns([...patterns, newPattern.toLowerCase().trim()]);
        setNewPattern('');
    };

    const handleRemovePattern = (pattern: string) => {
        setPatterns(patterns.filter(p => p !== pattern));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`${API_BASE}/settings/my-account-patterns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patterns })
            });
            if (response.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (err) {
            console.error('Failed to save patterns:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDetectTransfers = async () => {
        setDetecting(true);
        try {
            const response = await fetch(`${API_BASE}/sync/detect-transfers`, { method: 'POST' });
            if (response.ok) {
                const data = await response.json();
                alert(`Detekce dokončena!\n\n🔄 Interní převody: ${data.marked_internal_transfers}\n💼 Moje účty: ${data.marked_my_account_transfers}\n👨‍👩‍👧 Rodinné: ${data.marked_family_transfers}`);
            }
        } catch (err) {
            console.error('Failed to detect transfers:', err);
        } finally {
            setDetecting(false);
        }
    };

    return (
        <GlassCard>
            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>💼 Moje účty (spořící, atd.)</h3>
            <p className="text-tertiary" style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-md)' }}>
                Transakce obsahující tyto texty budou označeny jako interní převody a nebudou se počítat do příjmů/výdajů.
            </p>

            {/* Current patterns */}
            {patterns.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: 'var(--spacing-md)' }}>
                    {patterns.map(pattern => (
                        <span
                            key={pattern}
                            style={{
                                padding: '4px 8px',
                                background: 'rgba(34, 197, 94, 0.2)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '12px',
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            {pattern}
                            <button
                                onClick={() => handleRemovePattern(pattern)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, padding: 0 }}
                            >✕</button>
                        </span>
                    ))}
                </div>
            )}

            {/* Add new pattern */}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
                <input
                    type="text"
                    className="input"
                    placeholder="Např: spořící, savings, CZ1234..."
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPattern()}
                    style={{ flex: 1 }}
                />
                <button className="btn" onClick={handleAddPattern} disabled={!newPattern.trim()}>
                    ➕
                </button>
            </div>

            {/* Save button */}
            <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={{ width: '100%' }}
            >
                {saving ? '⏳ Ukládám...' : saved ? '✅ Uloženo' : '💾 Uložit vzory'}
            </button>

            {/* Detect transfers */}
            <div style={{ marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                    className="btn"
                    onClick={handleDetectTransfers}
                    disabled={detecting}
                    style={{ width: '100%' }}
                >
                    {detecting ? '⏳ Detekuji...' : '🔍 Detekovat převody'}
                </button>
                <p className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: '8px' }}>
                    Automaticky označí transakce odpovídající těmto vzorům jako interní převody.
                </p>
            </div>
        </GlassCard>
    );
}

export default function SettingsPage() {
    const { refreshAccounts } = useAccounts();
    const [gocardlessId, setGocardlessId] = useState('');
    const [gocardlessKey, setGocardlessKey] = useState('');
    const [trading212Key, setTrading212Key] = useState('');
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(true);
    const [apiKeysLoaded, setApiKeysLoaded] = useState<ApiKeysResponse | null>(null);

    // Account Management State
    const [editingAccount, setEditingAccount] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [processingAccount, setProcessingAccount] = useState<string | null>(null);

    // Banks
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [loadingBanks, setLoadingBanks] = useState(false);
    const [connectingBank, setConnectingBank] = useState<string | null>(null);

    // Sync state
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    // Category Rules
    const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
    const [newPattern, setNewPattern] = useState('');
    const [newCategory, setNewCategory] = useState('Food');
    const [savingRule, setSavingRule] = useState(false);
    const [ruleCategories, setRuleCategories] = useState<Category[]>([]);

    // Manual Account Creation
    const [showAddManual, setShowAddManual] = useState(false);
    const [newManualName, setNewManualName] = useState('');
    const [newManualBalance, setNewManualBalance] = useState('');
    const [newManualAccountNumber, setNewManualAccountNumber] = useState('');
    const [savingManual, setSavingManual] = useState(false);

    // ... (existing useEffect and handlers)


    const handleRename = async (id: string) => {
        if (!editName.trim()) return;
        setProcessingAccount(id);
        try {
            // Check if it's a manual account
            if (id.startsWith('manual-')) {
                const manualId = id.replace('manual-', '');
                await fetch(`${API_BASE}/manual-accounts/${manualId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editName })
                });
            } else {
                await updateAccount(id, { name: editName });
            }
            setAccounts(accounts.map(acc => acc.id === id ? { ...acc, name: editName } : acc));
            setEditingAccount(null);
            refreshAccounts(); // Update sidebar instantly
        } catch (err) {
            console.error('Failed to rename account:', err);
        } finally {
            setProcessingAccount(null);
        }
    };

    const handleToggleVisibility = async (id: string, currentVisibility: boolean) => {
        setProcessingAccount(id);
        try {
            // Check if it's a manual account
            if (id.startsWith('manual-')) {
                const manualId = id.replace('manual-', '');
                await fetch(`${API_BASE}/manual-accounts/${manualId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_visible: !currentVisibility })
                });
            } else {
                await updateAccount(id, { is_visible: !currentVisibility });
            }
            setAccounts(accounts.map(acc => acc.id === id ? { ...acc, is_visible: !currentVisibility } : acc));
            refreshAccounts(); // Update sidebar instantly
        } catch (err) {
            console.error('Failed to toggle visibility:', err);
        } finally {
            setProcessingAccount(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Opravdu chcete smazat tento účet a celou jeho historii transakcí? Tato akce je nevratná.')) return;

        setProcessingAccount(id);
        try {
            // Check if it's a manual account
            if (id.startsWith('manual-')) {
                const manualId = id.replace('manual-', '');
                await fetch(`${API_BASE}/manual-accounts/${manualId}`, {
                    method: 'DELETE'
                });
            } else {
                await deleteAccount(id);
            }
            setAccounts(accounts.filter(acc => acc.id !== id));
            refreshAccounts(); // Refresh sidebar Context immediately
        } catch (err) {
            console.error('Failed to delete account:', err);
            alert('Nepodařilo se smazat účet.');
        } finally {
            setProcessingAccount(null);
        }
    };

    // ... (rest of the component)

    const getBankLogo = (institution: string | undefined, type: string) => {
        if (!institution) return null;

        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const inst = normalize(institution);

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

        if (logoFile) {
            return `/logos/${logoFile}.png`;
        }
        return null;
    };

    const loadBanks = async () => {
        setLoadingBanks(true);
        try {
            const data = await getInstitutions('CZ');
            setInstitutions(data.institutions); // Show all banks
        } catch (err) {
            console.error('Failed to load banks:', err);
        } finally {
            setLoadingBanks(false);
        }
    };

    const handleConnectBank = async (institutionId: string) => {
        // setConnectingBank(institutionId); // Already set by select
        try {
            const redirectUrl = `${window.location.origin}/settings?ref=`;
            const result = await connectBank(institutionId, redirectUrl);
            // Redirect to bank authorization
            window.location.href = result.link;
        } catch (err) {
            console.error('Failed to connect bank:', err);
            // setConnectingBank(null);
        }
    };

    const handleCreateManualAccount = async () => {
        if (!newManualName.trim()) return;
        setSavingManual(true);
        try {
            const response = await fetch(`${API_BASE}/manual-accounts/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newManualName.trim(),
                    balance: parseFloat(newManualBalance) || 0,
                    account_number: newManualAccountNumber.trim() || null
                })
            });
            if (response.ok) {
                setNewManualName('');
                setNewManualBalance('');
                setNewManualAccountNumber('');
                setShowAddManual(false);
                // Refresh accounts list and sidebar
                const dashData = await getDashboard();
                setAccounts(dashData.accounts || []);
                await refreshAccounts();
            }
        } catch (err) {
            console.error('Failed to create manual account:', err);
        } finally {
            setSavingManual(false);
        }
    };

    useEffect(() => {
        async function init() {
            // Check for callback from bank OAuth FIRST
            const urlParams = new URLSearchParams(window.location.search);
            const ref = urlParams.get('ref');

            if (ref) {
                console.log('[Settings] Bank callback detected, ref:', ref);
                try {
                    // Process callback FIRST - wait for backend to save accounts to DB
                    const callbackResponse = await fetch(`${API_BASE}/accounts/connect/bank/callback?ref=${ref}`);
                    const callbackData = await callbackResponse.json();
                    console.log('[Settings] Bank callback result:', callbackData);

                    // Clear URL params
                    window.history.replaceState({}, '', '/settings');
                } catch (err) {
                    console.error('[Settings] Bank callback failed:', err);
                }
            }

            // Now fetch all data (will include newly connected account if callback was processed)
            try {
                const [status, dashData, keys] = await Promise.all([
                    getSyncStatus(),
                    getDashboard(),
                    getApiKeys()
                ]);
                setSyncStatus(status);
                setApiKeysLoaded(keys);

                if (keys.gocardless_secret_id) setGocardlessId(keys.gocardless_secret_id);
                if (keys.gocardless_secret_key) setGocardlessKey(keys.gocardless_secret_key);
                if (keys.trading212_api_key) setTrading212Key(keys.trading212_api_key);

                console.log('[Settings] Dashboard accounts loaded:', dashData.accounts?.length);
                setAccounts(dashData.accounts || []);
                setLoadingAccounts(false);

                // Load banks if GoCardless is configured
                if (keys.has_gocardless) {
                    loadBanks();
                }
            } catch (err) {
                console.log('[Settings] Failed to load settings data');
                setLoadingAccounts(false);
            }

            // Refresh sidebar context to reflect new accounts everywhere
            await refreshAccounts();
            console.log('[Settings] Sidebar context refreshed');
        }

        init();
        loadCategoryRules();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const keysToSave: Record<string, string> = {};

            if (gocardlessId && !gocardlessId.includes('...')) {
                keysToSave.gocardless_secret_id = gocardlessId;
            }
            if (gocardlessKey && !gocardlessKey.includes('...')) {
                keysToSave.gocardless_secret_key = gocardlessKey;
            }
            if (trading212Key && !trading212Key.includes('...')) {
                keysToSave.trading212_api_key = trading212Key;
            }

            if (Object.keys(keysToSave).length > 0) {
                await saveApiKeys(keysToSave);
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);

            const keys = await getApiKeys();
            setApiKeysLoaded(keys);
            if (keys.gocardless_secret_id) setGocardlessId(keys.gocardless_secret_id);
            if (keys.gocardless_secret_key) setGocardlessKey(keys.gocardless_secret_key);
            if (keys.trading212_api_key) setTrading212Key(keys.trading212_api_key);

            // Load banks after saving GoCardless keys
            if (keys.has_gocardless) {
                loadBanks();
            }
        } catch (err) {
            console.error('Failed to save settings:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncError(null);

        try {
            await syncData();
            const status = await getSyncStatus();
            setSyncStatus(status);

            try {
                const dashData = await getDashboard();
                if (dashData.accounts.length > 0) {
                    setAccounts(dashData.accounts);
                }
                // Update sidebar context
                await refreshAccounts();
            } catch { }
        } catch (err) {
            setSyncError('Synchronizace selhala. Zkontrolujte API klíče.');
            console.error('Sync error:', err);
        } finally {
            setIsSyncing(false);
        }
    };

    const formatLastSync = (dateStr: string | null) => {
        if (!dateStr) return 'Nikdy';
        const date = new Date(dateStr);
        return date.toLocaleString('cs-CZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const [activeTab, setActiveTab] = useState<'accounts' | 'connections' | 'preferences' | 'categories'>('accounts');

    // Load categories for rules dropdown
    const loadRuleCategories = async () => {
        try {
            const res = await fetch(`${API_BASE}/categories/`);
            const data = await res.json();
            setRuleCategories(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load categories:', err);
        }
    };

    // Category rule handlers
    const loadCategoryRules = async () => {
        try {
            const response = await fetch(`${API_BASE}/settings/category-rules`);
            if (response.ok) {
                const data = await response.json();
                setCategoryRules(data.rules || []);
            }
            // Also load categories for dropdown
            loadRuleCategories();
        } catch (err) {
            console.error('Failed to load category rules:', err);
        }
    };

    const handleAddRule = async () => {
        if (!newPattern.trim()) return;
        setSavingRule(true);
        try {
            const response = await fetch(`${API_BASE}/settings/category-rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: newPattern, category: newCategory })
            });
            if (response.ok) {
                setNewPattern('');
                loadCategoryRules();
            }
        } catch (err) {
            console.error('Failed to add rule:', err);
        } finally {
            setSavingRule(false);
        }
    };

    const handleDeleteRule = async (id: number) => {
        try {
            await fetch(`${API_BASE}/settings/category-rules/${id}`, { method: 'DELETE' });
            setCategoryRules(categoryRules.filter(r => r.id !== id));
        } catch (err) {
            console.error('Failed to delete rule:', err);
        }
    };

    const handleRecategorize = async () => {
        setIsSyncing(true);
        try {
            await fetch(`${API_BASE}/sync/recategorize`, { method: 'POST' });
            alert('Transakce byly překategorizovány!');
        } catch (err) {
            console.error('Failed to recategorize:', err);
        } finally {
            setIsSyncing(false);
        }
    };

    // ... (rest of the component)

    return (
        <MainLayout>
            <div className="page-container" style={{ paddingBottom: 'calc(var(--spacing-xl) * 2)' }}>
                <header style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h1>Nastavení</h1>
                    <p className="text-secondary" style={{ marginTop: 'var(--spacing-sm)' }}>
                        Správa připojení a preferencí
                    </p>
                </header>

                {/* Tabs Navigation */}
                <div className="hide-scrollbar" style={{
                    display: 'flex',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-lg)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    paddingBottom: 'var(--spacing-sm)',
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    WebkitOverflowScrolling: 'touch'
                }}>
                    <button
                        className={`btn ${activeTab === 'accounts' ? 'btn-primary' : ''}`}
                        style={{ background: activeTab === 'accounts' ? undefined : 'transparent', border: 'none', opacity: activeTab === 'accounts' ? 1 : 0.6 }}
                        onClick={() => setActiveTab('accounts')}
                    >
                        💳 Účty
                    </button>
                    <button
                        className={`btn ${activeTab === 'connections' ? 'btn-primary' : ''}`}
                        style={{ background: activeTab === 'connections' ? undefined : 'transparent', border: 'none', opacity: activeTab === 'connections' ? 1 : 0.6 }}
                        onClick={() => setActiveTab('connections')}
                    >
                        🔗 Propojení
                    </button>
                    <button
                        className={`btn ${activeTab === 'preferences' ? 'btn-primary' : ''}`}
                        style={{ background: activeTab === 'preferences' ? undefined : 'transparent', border: 'none', opacity: activeTab === 'preferences' ? 1 : 0.6 }}
                        onClick={() => setActiveTab('preferences')}
                    >
                        ⚙️ Preference
                    </button>
                    <button
                        className={`btn ${activeTab === 'categories' ? 'btn-primary' : ''}`}
                        style={{ background: activeTab === 'categories' ? undefined : 'transparent', border: 'none', opacity: activeTab === 'categories' ? 1 : 0.6 }}
                        onClick={() => setActiveTab('categories')}
                    >
                        🏷️ Kategorie
                    </button>
                </div>

                {/* TAB: ACCOUNTS */}
                {activeTab === 'accounts' && (
                    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        {/* My Accounts Management */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <GlassCard style={{ flex: 1 }}>
                                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>💳 Moje účty</h3>

                                {accounts.length === 0 ? (
                                    <p className="text-secondary">Zatím nemáte připojené žádné účty.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {accounts.map(account => (
                                            <div key={account.id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 12px',
                                                background: 'rgba(255,255,255,0.05)',
                                                borderRadius: 'var(--radius-sm)',
                                                opacity: processingAccount === account.id ? 0.5 : (account.is_visible !== false ? 1 : 0.6)
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flex: 1 }}>
                                                    {(() => {
                                                        const logoUrl = getBankLogo(account.institution, account.type);
                                                        return logoUrl ? (
                                                            <img src={logoUrl} alt={account.name} style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px' }} />
                                                        ) : (
                                                            <span style={{ fontSize: '1.25rem' }}>{account.type === 'bank' ? '🏦' : '📈'}</span>
                                                        );
                                                    })()}

                                                    {editingAccount === account.id ? (
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <input
                                                                type="text"
                                                                className="input"
                                                                value={editName}
                                                                onChange={(e) => setEditName(e.target.value)}
                                                                autoFocus
                                                                style={{ padding: '4px 8px', fontSize: '0.9rem' }}
                                                            />
                                                            <button className="btn btn-sm" onClick={() => handleRename(account.id)}>OK</button>
                                                            <button className="btn btn-sm" onClick={() => setEditingAccount(null)}>❌</button>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                                                                {account.name}
                                                                <button
                                                                    onClick={() => {
                                                                        setEditName(account.name);
                                                                        setEditingAccount(account.id);
                                                                    }}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '0.8rem' }}
                                                                    title="Přejmenovat"
                                                                >
                                                                    ✏️
                                                                </button>
                                                            </div>
                                                            <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                                                                {account.institution || account.type}
                                                                {account.is_visible === false && ' • (Skryto)'}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        className="btn"
                                                        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                                        onClick={() => handleToggleVisibility(account.id, account.is_visible ?? true)}
                                                        title={account.is_visible !== false ? "Skrýt z přehledů" : "Zobrazit v přehledech"}
                                                    >
                                                        {account.is_visible !== false ? '👁️' : '🙈'}
                                                    </button>
                                                    <button
                                                        className="btn"
                                                        style={{ padding: '4px 8px', fontSize: '0.8rem', color: '#ff6b6b', borderColor: 'rgba(255,100,100,0.3)' }}
                                                        onClick={() => handleDelete(account.id)}
                                                        title="Odstranit účet"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </GlassCard>
                        </div>

                        {/* Connect Bank */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <GlassCard style={{ flex: 1 }}>
                                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>➕ Připojit banku</h3>

                                {!apiKeysLoaded?.has_gocardless ? (
                                    <p className="text-tertiary" style={{ fontSize: '0.875rem' }}>
                                        Pro připojení banky nejdříve zadejte a uložte API klíče v záložce <strong>Propojení</strong>.
                                    </p>
                                ) : loadingBanks ? (
                                    <p className="text-secondary">Načítám seznam bank...</p>
                                ) : institutions.length === 0 ? (
                                    <div>
                                        <p className="text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
                                            Žádné banky nenačteny.
                                        </p>
                                        <button className="btn" onClick={loadBanks}>
                                            🔄 Načíst banky
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                            <CustomSelect
                                                options={institutions.map((bank) => ({
                                                    value: bank.id,
                                                    label: bank.name,
                                                    icon: '🏦',
                                                }))}
                                                value={connectingBank || ''}
                                                onChange={(val) => setConnectingBank(val)}
                                                placeholder="Vyberte banku..."
                                                searchable={true}
                                                searchPlaceholder="🔍 Hledat banku..."
                                            />
                                            <button
                                                className="btn btn-primary"
                                                disabled={!connectingBank}
                                                onClick={() => connectingBank && handleConnectBank(connectingBank)}
                                            >
                                                {connectingBank && institutions.find(b => b.id === connectingBank)?.name ? 'Připojit vybranou' : 'Připojit'}
                                            </button>
                                        </div>
                                        <p className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: 'var(--spacing-lg)' }}>
                                            Budete přesměrováni na stránku banky.
                                        </p>
                                    </>
                                )}
                            </GlassCard>

                            {/* Add Manual Account */}
                            <GlassCard style={{ marginTop: 'var(--spacing-lg)' }}>
                                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>💼 Přidat manuální účet</h3>
                                <p className="text-tertiary" style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-md)' }}>
                                    Pro účty bez API (spořící účet, hotovost, atd.). Zadáním čísla účtu se automaticky detekují interní převody.
                                </p>

                                {showAddManual ? (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 'var(--spacing-sm)'
                                    }}>
                                        <input
                                            className="input"
                                            placeholder="Název účtu (např. Spořící účet)"
                                            value={newManualName}
                                            onChange={(e) => setNewManualName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreateManualAccount()}
                                            autoFocus
                                        />
                                        <input
                                            className="input"
                                            placeholder="Číslo účtu / IBAN (např. 2049290001/6000)"
                                            value={newManualAccountNumber}
                                            onChange={(e) => setNewManualAccountNumber(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreateManualAccount()}
                                        />
                                        <p className="text-tertiary" style={{ fontSize: '0.75rem', margin: '-4px 0 0 0' }}>
                                            🔄 Převody na/z tohoto čísla se automaticky označí jako interní.
                                        </p>
                                        <input
                                            type="number"
                                            className="input"
                                            placeholder="Počáteční zůstatek (Kč)"
                                            value={newManualBalance}
                                            onChange={(e) => setNewManualBalance(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreateManualAccount()}
                                        />
                                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                                            <button
                                                className="btn btn-primary"
                                                onClick={handleCreateManualAccount}
                                                disabled={savingManual || !newManualName.trim()}
                                                style={{ flex: 1 }}
                                            >
                                                {savingManual ? '⏳ Vytvářím...' : '✅ Vytvořit účet'}
                                            </button>
                                            <button
                                                className="btn"
                                                onClick={() => { setShowAddManual(false); setNewManualName(''); setNewManualBalance(''); setNewManualAccountNumber(''); }}
                                            >
                                                Zrušit
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className="btn"
                                        onClick={() => setShowAddManual(true)}
                                        style={{ width: '100%' }}
                                    >
                                        ➕ Nový manuální účet
                                    </button>
                                )}
                            </GlassCard>
                        </div>
                    </div>
                )}

                {/* TAB: CONNECTIONS */}
                {activeTab === 'connections' && (
                    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        {/* Sync Section */}
                        <GlassCard style={{ height: '100%' }}>
                            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>🔄 Synchronizace</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSync}
                                    disabled={isSyncing}
                                    style={{
                                        width: '100%',
                                        opacity: isSyncing ? 0.7 : 1,
                                        cursor: isSyncing ? 'wait' : 'pointer',
                                        padding: '12px'
                                    }}
                                >
                                    {isSyncing ? (
                                        <>
                                            <span style={{
                                                display: 'inline-block',
                                                width: '16px',
                                                height: '16px',
                                                border: '2px solid rgba(255,255,255,0.3)',
                                                borderTopColor: 'white',
                                                borderRadius: '50%',
                                                animation: 'spin 1s linear infinite',
                                                marginRight: '8px'
                                            }} />
                                            Synchronizuji...
                                        </>
                                    ) : (
                                        '🔄 Synchronizovat data'
                                    )}
                                </button>

                                <div style={{ padding: 'var(--spacing-md)', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                    <div className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '4px' }}>
                                        Poslední synchronizace:
                                    </div>
                                    <div style={{ fontWeight: 500, fontSize: '1rem' }}>
                                        {formatLastSync(syncStatus?.last_sync || null)}
                                    </div>
                                    {syncStatus && syncStatus.status === 'completed' && (
                                        <div className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                            {syncStatus.accounts_synced} účtů, {syncStatus.transactions_synced} transakcí
                                        </div>
                                    )}
                                </div>

                                {syncError && (
                                    <div style={{
                                        padding: 'var(--spacing-sm) var(--spacing-md)',
                                        background: 'rgba(255,100,100,0.2)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: '#ff6b6b',
                                        fontSize: '0.875rem'
                                    }}>
                                        ⚠️ {syncError}
                                    </div>
                                )}
                            </div>
                        </GlassCard>

                        {/* API Connections */}
                        <GlassCard style={{ height: '100%' }}>
                            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>🔗 API Klíče</h3>

                            <div style={{ display: 'grid', gap: 'var(--spacing-lg)' }}>
                                <div style={{
                                    padding: 'var(--spacing-md)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: apiKeysLoaded?.has_gocardless ? '1px solid rgba(52, 199, 89, 0.3)' : '1px solid var(--glass-border-light)',
                                    background: apiKeysLoaded?.has_gocardless ? 'rgba(52, 199, 89, 0.05)' : 'transparent'
                                }}>
                                    <h4 style={{ marginBottom: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>🏦</span> GoCardless
                                        {apiKeysLoaded?.has_gocardless && <span style={{ fontSize: '0.7rem', color: 'var(--accent-success)', marginLeft: 'auto' }}>PŘIPOJENO</span>}
                                    </h4>
                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="Secret ID"
                                            value={gocardlessId}
                                            onChange={(e) => setGocardlessId(e.target.value)}
                                            style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                                        />
                                        <input
                                            type="password"
                                            className="input"
                                            placeholder="Secret Key"
                                            value={gocardlessKey}
                                            onChange={(e) => setGocardlessKey(e.target.value)}
                                            style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                                        />
                                    </div>
                                    <a href="https://bankaccountdata.gocardless.com/" target="_blank" className="text-tertiary" style={{ fontSize: '0.7rem', display: 'block', marginTop: '4px', textAlign: 'right' }}>Získat klíč →</a>
                                </div>

                                <div style={{
                                    padding: 'var(--spacing-md)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: apiKeysLoaded?.has_trading212 ? '1px solid rgba(52, 199, 89, 0.3)' : '1px solid var(--glass-border-light)',
                                    background: apiKeysLoaded?.has_trading212 ? 'rgba(52, 199, 89, 0.05)' : 'transparent'
                                }}>
                                    <h4 style={{ marginBottom: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>📈</span> Trading 212
                                        {apiKeysLoaded?.has_trading212 && <span style={{ fontSize: '0.7rem', color: 'var(--accent-success)', marginLeft: 'auto' }}>PŘIPOJENO</span>}
                                    </h4>
                                    <div>
                                        <input
                                            type="password"
                                            className="input"
                                            placeholder="API Key"
                                            value={trading212Key}
                                            onChange={(e) => setTrading212Key(e.target.value)}
                                            style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                                        />
                                    </div>
                                    <a href="https://trading212.com" target="_blank" className="text-tertiary" style={{ fontSize: '0.7rem', display: 'block', marginTop: '4px', textAlign: 'right' }}>Získat klíč →</a>
                                </div>
                            </div>

                            <div style={{ marginTop: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{ opacity: saving ? 0.7 : 1, width: '100%' }}
                                >
                                    {saving ? '⏳ Ukládám...' : '💾 Uložit klíče'}
                                </button>
                            </div>
                        </GlassCard>
                    </div>
                )}

                {/* TAB: PREFERENCES */}
                {activeTab === 'preferences' && (
                    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        <GlassCard>
                            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>⚙️ Preference</h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 500 }}>Výchozí měna</div>
                                        <div className="text-tertiary" style={{ fontSize: '0.875rem' }}>Měna pro zobrazení celkových zůstatků</div>
                                    </div>
                                    <CustomSelect
                                        value="CZK"
                                        onChange={(val) => console.log(val)}
                                        style={{ width: 'auto' }}
                                        options={[
                                            { value: 'CZK', label: 'CZK - Koruna česká' },
                                            { value: 'EUR', label: 'EUR - Euro' },
                                            { value: 'USD', label: 'USD - Americký dolar' },
                                        ]}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 500 }}>Automatická synchronizace</div>
                                        <div className="text-tertiary" style={{ fontSize: '0.875rem' }}>Automaticky stahovat nové transakce</div>
                                    </div>
                                    <label style={{
                                        position: 'relative',
                                        display: 'inline-block',
                                        width: '50px',
                                        height: '28px'
                                    }}>
                                        <input type="checkbox" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
                                        <span style={{
                                            position: 'absolute',
                                            cursor: 'pointer',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: 'var(--accent-primary)',
                                            borderRadius: 'var(--radius-full)',
                                            transition: 'var(--transition-fast)'
                                        }} />
                                    </label>
                                </div>
                            </div>
                        </GlassCard>

                        {/* Family Account Settings */}
                        <FamilyAccountSettings />

                        {/* My Account Patterns (Internal Transfers) */}
                        <MyAccountPatterns />
                    </div>
                )}

                {/* TAB: CATEGORIES */}
                {activeTab === 'categories' && (
                    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 'var(--spacing-lg)' }}>
                        {/* Manage Categories */}
                        <GlassCard>
                            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>🏷️ Správa kategorií</h3>
                            <p className="text-tertiary" style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-md)' }}>
                                Přidejte, upravte nebo skryjte kategorie pro transakce.
                            </p>

                            <CategoryManager onCategoriesChange={() => loadCategoryRules()} />
                        </GlassCard>

                        {/* Add New Rule */}
                        <GlassCard>
                            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>➕ Přidat pravidlo</h3>
                            <p className="text-tertiary" style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-md)' }}>
                                Když popis transakce obsahuje zadaný text, automaticky se přiřadí vybraná kategorie.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder='Např. "sensu" nebo "neruda"'
                                    value={newPattern}
                                    onChange={(e) => setNewPattern(e.target.value)}
                                />
                                <CustomSelect
                                    value={newCategory}
                                    onChange={(val) => setNewCategory(val)}
                                    options={ruleCategories.filter(c => c.is_active).map(cat => ({
                                        value: cat.name,
                                        label: cat.name,
                                        icon: cat.icon
                                    }))}
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={handleAddRule}
                                    disabled={savingRule || !newPattern.trim()}
                                >
                                    {savingRule ? 'Ukládám...' : '➕ Přidat pravidlo'}
                                </button>
                            </div>

                            <div style={{ marginTop: 'var(--spacing-xl)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <button
                                    className="btn"
                                    onClick={handleRecategorize}
                                    disabled={isSyncing}
                                    style={{ width: '100%' }}
                                >
                                    {isSyncing ? '⏳ Překategorizovávám...' : '🔄 Překategorizovat všechny transakce'}
                                </button>
                                <p className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: '8px' }}>
                                    Aplikuje aktuální pravidla na všechny existující transakce.
                                </p>
                            </div>
                        </GlassCard>

                        {/* Rules List */}
                        <GlassCard>
                            <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>📋 Pravidla kategorií</h3>

                            {categoryRules.length === 0 ? (
                                <p className="text-secondary">Zatím nemáte žádná vlastní pravidla. Přidejte nové pravidlo nebo změňte kategorii u transakce.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                                    {categoryRules.map(rule => (
                                        <div key={rule.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '10px 12px',
                                            background: rule.is_user_defined ? 'rgba(45, 212, 191, 0.1)' : 'rgba(255,255,255,0.05)',
                                            borderRadius: 'var(--radius-sm)',
                                            border: rule.is_user_defined ? '1px solid rgba(45, 212, 191, 0.2)' : 'none'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                                    '{rule.pattern}' → {rule.category}
                                                </div>
                                                <div className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                                                    {rule.is_user_defined ? '👤 Vlastní pravidlo' : '🤖 Naučené'} • {rule.match_count}× použito
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteRule(rule.id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#ff6b6b',
                                                    fontSize: '1rem',
                                                    padding: '4px 8px'
                                                }}
                                                title="Smazat pravidlo"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </GlassCard>
                    </div>
                )}
            </div>
            <style jsx>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </MainLayout>
    );
}
