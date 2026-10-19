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
        <>
            <div className="set-2col adv">
                <div className="set-col">
                    <SurfaceCard
                        title="Synchronizace"
                        sub={`Poslední: ${formatLastSync(syncStatus?.last_sync || null)}${syncStatus?.status === 'completed' ? ` · ${syncStatus.accounts_synced} účtů · ${syncStatus.transactions_synced} transakcí` : ''}`}
                        action={
                            <button className="btn btn-primary btn-sm" onClick={handleSync} disabled={isSyncing}>
                                {isSyncing ? <>{Icons.status.loading} Synchronizuji...</> : <>{Icons.action.sync} Synchronizovat data</>}
                            </button>
                        }
                    >
                        {syncError && (
                            <div className="set-alert">{Icons.status.warning} {syncError}</div>
                        )}
                    </SurfaceCard>

                    <SurfaceCard title="API klíče">
                        <div className="set-key-list">
                            <div className="set-key">
                                <div className="set-key-head">
                                    <strong>{Icons.accountType.bank} GoCardless</strong>
                                    {apiKeysLoaded?.has_gocardless && <span className="chip chip-success">Připojeno</span>}
                                    <a href="https://bankaccountdata.gocardless.com/" target="_blank" rel="noreferrer">Získat klíč →</a>
                                </div>
                                <input type="text" className="input" placeholder="Secret ID" value={gocardlessId} onChange={e => setGocardlessId(e.target.value)} />
                                <input type="password" className="input" placeholder="Secret Key" value={gocardlessKey} onChange={e => setGocardlessKey(e.target.value)} />
                            </div>
                            <div className="set-key">
                                <div className="set-key-head">
                                    <strong>{Icons.accountType.investment} Trading 212</strong>
                                    {apiKeysLoaded?.has_trading212 && <span className="chip chip-success">Připojeno</span>}
                                    <a href="https://trading212.com" target="_blank" rel="noreferrer">Získat klíč →</a>
                                </div>
                                <input type="password" className="input" placeholder="API Key" value={trading212Key} onChange={e => setTrading212Key(e.target.value)} />
                            </div>
                            <button className="btn set-save-btn" onClick={handleSaveKeys} disabled={savingKeys}>
                                {savingKeys ? 'Ukládám...' : keysSaved ? '✓ Uloženo' : <>{Icons.action.save} Uložit klíče</>}
                            </button>
                        </div>
                    </SurfaceCard>

                    <SurfaceCard title="Preference">
                        <div className="set-pref">
                            <div className="set-pref-row">
                                <div>
                                    <div className="set-pref-title">Výchozí měna</div>
                                    <div className="set-pref-sub">Pro zobrazení celkových zůstatků</div>
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
                            <div className="set-pref-row stack">
                                <div>
                                    <div className="set-pref-title">Notifikace</div>
                                    <div className="set-pref-sub">Push upozornění na selhaný sync a končící souhlas banky</div>
                                </div>
                                {!pushSupported ? (
                                    <div className="set-pref-sub">Tenhle prohlížeč push notifikace nepodporuje.</div>
                                ) : pushSubscribed ? (
                                    <div className="set-pref-actions">
                                        <span style={{ fontSize: 13, color: 'var(--pos)' }}>✓ Zapnuté na tomhle zařízení</span>
                                        <button className="btn btn-sm" onClick={handleTestPush}>Poslat test</button>
                                        <button className="btn btn-sm" onClick={disablePush} disabled={pushBusy} style={{ color: 'var(--neg)' }}>Vypnout</button>
                                    </div>
                                ) : (
                                    <div className="set-pref-actions">
                                        <button className="btn" onClick={enablePush} disabled={pushBusy}>
                                            {pushBusy ? 'Zapínám…' : <>{Icons.status.warning} Zapnout notifikace</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </SurfaceCard>
                </div>

                <div className="set-col">
                    <SurfaceCard title="Detekce převodů" sub="Pravidla pro automatické označení interních a rodinných převodů">
                        <div className="set-detect">
                            <div className="set-detect-block">
                                <div className="set-detect-title">{Icons.section.familyAccount} Rodinný účet</div>
                                <FamilyAccountSettings />
                            </div>
                            <div className="set-detect-block">
                                <div className="set-detect-title">{Icons.section.myAccounts} Moje další účty (spořicí, atd.)</div>
                                <MyAccountPatterns />
                            </div>
                            <div className="set-detect-block">
                                <div className="set-detect-title">{Icons.nav.transactions} Účty vyloučené z interních převodů (kreditka…)</div>
                                <TransferExcludedAccounts />
                            </div>
                        </div>
                    </SurfaceCard>

                    <SurfaceCard title="Pravidla dělení společných nákladů">
                        <div className="set-detect">
                            <ShareRulesSettings />
                        </div>
                    </SurfaceCard>
                </div>
            </div>

            <div className="set-detect-run">
                <button className="btn btn-primary" onClick={handleDetectTransfers} disabled={detecting}>
                    {detecting ? 'Detekuji...' : <>{Icons.action.search} Detekovat převody nyní</>}
                </button>
            </div>
        </>
    );
}
