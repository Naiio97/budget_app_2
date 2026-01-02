'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import { syncData, getSyncStatus, SyncStatus, getDashboard, getApiKeys, saveApiKeys, ApiKeysResponse, getInstitutions, connectBank, updateAccount, deleteAccount, Account } from '@/lib/api';

const demoAccounts: Account[] = [
    { id: '1', name: 'Hlavní účet', type: 'bank', balance: 125420, currency: 'CZK' },
    { id: '2', name: 'Spořicí účet', type: 'bank', balance: 60000, currency: 'CZK' },
    { id: '3', name: 'Trading 212', type: 'investment', balance: 60360, currency: 'EUR' },
];

interface Institution {
    id: string;
    name: string;
    logo: string;
    bic?: string;
}

export default function SettingsPage() {
    const [gocardlessId, setGocardlessId] = useState('');
    const [gocardlessKey, setGocardlessKey] = useState('');
    const [trading212Key, setTrading212Key] = useState('');
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>(demoAccounts); // Use Account interface
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

    // ... (existing useEffect and handlers)

    const handleRename = async (id: string) => {
        if (!editName.trim()) return;
        setProcessingAccount(id);
        try {
            await updateAccount(id, { name: editName });
            setAccounts(accounts.map(acc => acc.id === id ? { ...acc, name: editName } : acc));
            setEditingAccount(null);
        } catch (err) {
            console.error('Failed to rename account:', err);
        } finally {
            setProcessingAccount(null);
        }
    };

    const handleToggleVisibility = async (id: string, currentVisibility: boolean) => {
        setProcessingAccount(id);
        try {
            await updateAccount(id, { is_visible: !currentVisibility });
            setAccounts(accounts.map(acc => acc.id === id ? { ...acc, is_visible: !currentVisibility } : acc));
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
            await deleteAccount(id);
            setAccounts(accounts.filter(acc => acc.id !== id));
        } catch (err) {
            console.error('Failed to delete account:', err);
            alert('Nepodařilo se smazat účet.');
        } finally {
            setProcessingAccount(null);
        }
    };

    // ... (rest of the component)



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

    const handleBankCallback = async (requisitionId: string) => {
        try {
            // Call backend to finalize connection
            const response = await fetch(`http://localhost:8000/api/accounts/connect/bank/callback?ref=${requisitionId}`);
            if (response.ok) {
                // Refresh data
                const dashData = await getDashboard();
                if (dashData.accounts.length > 0) {
                    setAccounts(dashData.accounts);
                }
                // Clear URL params
                window.history.replaceState({}, '', '/settings');
            }
        } catch (err) {
            console.error('Bank callback failed:', err);
        }
    };

    useEffect(() => {
        async function fetchData() {
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

                if (dashData.accounts.length > 0) {
                    setAccounts(dashData.accounts);
                }

                // Load banks if GoCardless is configured
                if (keys.has_gocardless) {
                    loadBanks();
                }
            } catch (err) {
                console.log('Using demo data');
            }
        }
        fetchData();

        // Check for callback from bank OAuth
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref) {
            handleBankCallback(ref);
        }
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

    const [activeTab, setActiveTab] = useState<'accounts' | 'connections' | 'preferences'>('accounts');

    // ... (rest of the component)

    return (
        <MainLayout accounts={accounts} disableScroll={true}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ flexShrink: 0 }}>
                    <header style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <h1>Nastavení</h1>
                        <p className="text-secondary" style={{ marginTop: 'var(--spacing-sm)' }}>
                            Správa připojení a preferencí
                        </p>
                    </header>

                    {/* Tabs Navigation */}
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 'var(--spacing-sm)' }}>
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
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', paddingBottom: 'var(--spacing-lg)' }}>
                    {/* TAB: ACCOUNTS */}
                    {activeTab === 'accounts' && (
                        <div className="animate-fade-in" style={{ display: 'flex', gap: 'var(--spacing-lg)' }}>
                            {/* My Accounts Management */}
                            <div style={{ flex: 2 }}>
                                <GlassCard style={{ height: '100%' }}>
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
                                                        <span style={{ fontSize: '1.25rem' }}>
                                                            {account.type === 'bank' ? '🏦' : '📈'}
                                                        </span>

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
                                                                    {account.balance} {account.currency} • {account.institution || account.type}
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
                            <div style={{ flex: 1 }}>
                                <GlassCard style={{ height: '100%' }}>
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
                                                <select
                                                    className="input"
                                                    onChange={(e) => setConnectingBank(e.target.value)}
                                                    value={connectingBank || ''}
                                                >
                                                    <option value="" disabled>Vyberte banku...</option>
                                                    {institutions.map((bank) => (
                                                        <option key={bank.id} value={bank.id}>
                                                            {bank.name}
                                                        </option>
                                                    ))}
                                                </select>
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
                        <div className="animate-fade-in">
                            <GlassCard style={{ maxWidth: '600px', margin: '0 auto' }}>
                                <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>⚙️ Preference</h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 500 }}>Výchozí měna</div>
                                            <div className="text-tertiary" style={{ fontSize: '0.875rem' }}>Měna pro zobrazení celkových zůstatků</div>
                                        </div>
                                        <select className="input" style={{ width: 'auto' }}>
                                            <option value="CZK">CZK - Koruna česká</option>
                                            <option value="EUR">EUR - Euro</option>
                                            <option value="USD">USD - Americký dolar</option>
                                        </select>
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
                        </div>
                    )}
                </div>
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
