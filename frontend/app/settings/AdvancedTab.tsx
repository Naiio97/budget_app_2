'use client';

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import CustomSelect from '@/components/CustomSelect';
import { type ToastMessage } from '@/components/Toast';
import { apiFetch, syncData, getSyncStatus, SyncStatus, getDashboard, getApiKeys, saveApiKeys, ApiKeysResponse, Account, getVapidPublicKey, subscribePush, unsubscribePush, sendTestPush } from '@/lib/api';
import { Icons } from '@/lib/icons';
import { queryKeys } from '@/lib/queryKeys';
import FamilyAccountSettings from './FamilyAccountSettings';
import MyAccountPatterns from './MyAccountPatterns';
import ShareRulesSettings from './ShareRulesSettings';
import TransferExcludedAccounts from './TransferExcludedAccounts';
import { SurfaceCard } from './shared';

export default function AdvancedTab({ syncStatus, setSyncStatus, setAccounts, refreshAccounts, apiKeysLoaded, setApiKeysLoaded, setToast }: {
    syncStatus: SyncStatus | null;
    setSyncStatus: (s: SyncStatus) => void;
    setAccounts: Dispatch<SetStateAction<Account[]>>;
    refreshAccounts: () => void;
    apiKeysLoaded: ApiKeysResponse | null;
    setApiKeysLoaded: (k: ApiKeysResponse) => void;
    setToast: (t: ToastMessage) => void;
}) {
    const queryClient = useQueryClient();

    // API keys
    const [gocardlessId, setGocardlessId] = useState('');
    const [gocardlessKey, setGocardlessKey] = useState('');
    const [trading212Key, setTrading212Key] = useState('');
    const [savingKeys, setSavingKeys] = useState(false);
    const [keysSaved, setKeysSaved] = useState(false);

    // Předvyplnit inputy jen jednou z prvního načtení — po uložení se maskované
    // hodnoty z API nesmí propsat zpět přes rozepsaný text.
    const prefilled = useRef(false);
    useEffect(() => {
        if (prefilled.current || !apiKeysLoaded) return;
        prefilled.current = true;
        if (apiKeysLoaded.gocardless_secret_id) setGocardlessId(apiKeysLoaded.gocardless_secret_id);
        if (apiKeysLoaded.gocardless_secret_key) setGocardlessKey(apiKeysLoaded.gocardless_secret_key);
        if (apiKeysLoaded.trading212_api_key) setTrading212Key(apiKeysLoaded.trading212_api_key);
    }, [apiKeysLoaded]);

    // Sync
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [detecting, setDetecting] = useState(false);

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
            refreshAccounts();
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

    const formatLastSync = (dateStr: string | null) => {
        if (!dateStr) return 'Nikdy';
        return new Date(dateStr).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
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
    );
}
