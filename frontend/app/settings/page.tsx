'use client';

import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';

const demoAccounts = [
    { id: '1', name: 'Hlavní účet', type: 'bank' as const, balance: 125420, currency: 'CZK' },
    { id: '2', name: 'Spořicí účet', type: 'bank' as const, balance: 60000, currency: 'CZK' },
    { id: '3', name: 'Trading 212', type: 'investment' as const, balance: 60360, currency: 'EUR' },
];

export default function SettingsPage() {
    const [gocardlessId, setGocardlessId] = useState('');
    const [gocardlessKey, setGocardlessKey] = useState('');
    const [trading212Key, setTrading212Key] = useState('');
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        // In real app, this would save to backend
        console.log('Saving settings...');
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    return (
        <MainLayout accounts={demoAccounts}>
            <header style={{ marginBottom: 'var(--spacing-xl)' }}>
                <h1>Nastavení</h1>
                <p className="text-secondary" style={{ marginTop: 'var(--spacing-sm)' }}>
                    Správa připojení a preferencí
                </p>
            </header>

            {/* API Connections */}
            <GlassCard className="animate-fade-in" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>🔗 Připojení k API</h3>

                <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h4 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontSize: '1.5rem' }}>🏦</span>
                        GoCardless Bank Account Data
                    </h4>
                    <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-md)' }}>
                        Připojte své bankovní účty pro automatický import transakcí.
                        <a
                            href="https://bankaccountdata.gocardless.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}
                        >
                            Získat API klíče →
                        </a>
                    </p>
                    <div style={{ display: 'grid', gap: 'var(--spacing-md)', maxWidth: '500px' }}>
                        <div>
                            <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                                Secret ID
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Váš Secret ID..."
                                value={gocardlessId}
                                onChange={(e) => setGocardlessId(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                                Secret Key
                            </label>
                            <input
                                type="password"
                                className="input"
                                placeholder="Váš Secret Key..."
                                value={gocardlessKey}
                                onChange={(e) => setGocardlessKey(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid var(--glass-border-light)', paddingTop: 'var(--spacing-xl)' }}>
                    <h4 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontSize: '1.5rem' }}>📈</span>
                        Trading 212
                    </h4>
                    <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-md)' }}>
                        Připojte své investiční portfolio z Trading 212.
                        <a
                            href="https://trading212.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}
                        >
                            Získat API klíč →
                        </a>
                    </p>
                    <div style={{ maxWidth: '500px' }}>
                        <label className="text-secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                            API Key
                        </label>
                        <input
                            type="password"
                            className="input"
                            placeholder="Váš Trading 212 API Key..."
                            value={trading212Key}
                            onChange={(e) => setTrading212Key(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ marginTop: 'var(--spacing-xl)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-primary" onClick={handleSave}>
                        💾 Uložit nastavení
                    </button>
                    {saved && (
                        <span style={{ color: 'var(--accent-success)', fontSize: '0.875rem' }}>
                            ✓ Uloženo
                        </span>
                    )}
                </div>
            </GlassCard>

            {/* Connect Bank */}
            <GlassCard className="animate-fade-in" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>➕ Připojit nový účet</h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                    <button className="btn" style={{
                        padding: 'var(--spacing-lg)',
                        flexDirection: 'column',
                        height: 'auto'
                    }}>
                        <span style={{ fontSize: '2rem', marginBottom: 'var(--spacing-sm)' }}>🏦</span>
                        <span style={{ fontWeight: 600 }}>Česká spořitelna</span>
                        <span className="text-tertiary" style={{ fontSize: '0.75rem' }}>Připojit</span>
                    </button>
                    <button className="btn" style={{
                        padding: 'var(--spacing-lg)',
                        flexDirection: 'column',
                        height: 'auto'
                    }}>
                        <span style={{ fontSize: '2rem', marginBottom: 'var(--spacing-sm)' }}>🏦</span>
                        <span style={{ fontWeight: 600 }}>Komerční banka</span>
                        <span className="text-tertiary" style={{ fontSize: '0.75rem' }}>Připojit</span>
                    </button>
                    <button className="btn" style={{
                        padding: 'var(--spacing-lg)',
                        flexDirection: 'column',
                        height: 'auto'
                    }}>
                        <span style={{ fontSize: '2rem', marginBottom: 'var(--spacing-sm)' }}>🏦</span>
                        <span style={{ fontWeight: 600 }}>ČSOB</span>
                        <span className="text-tertiary" style={{ fontSize: '0.75rem' }}>Připojit</span>
                    </button>
                    <button className="btn" style={{
                        padding: 'var(--spacing-lg)',
                        flexDirection: 'column',
                        height: 'auto'
                    }}>
                        <span style={{ fontSize: '2rem', marginBottom: 'var(--spacing-sm)' }}>🏦</span>
                        <span style={{ fontWeight: 600 }}>Raiffeisenbank</span>
                        <span className="text-tertiary" style={{ fontSize: '0.75rem' }}>Připojit</span>
                    </button>
                </div>

                <p className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: 'var(--spacing-lg)', textAlign: 'center' }}>
                    Více bank dostupných po zadání GoCardless API klíčů
                </p>
            </GlassCard>

            {/* Preferences */}
            <GlassCard className="animate-fade-in">
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 500 }}>Notifikace</div>
                            <div className="text-tertiary" style={{ fontSize: '0.875rem' }}>Upozornění na velké transakce</div>
                        </div>
                        <label style={{
                            position: 'relative',
                            display: 'inline-block',
                            width: '50px',
                            height: '28px'
                        }}>
                            <input type="checkbox" style={{ opacity: 0, width: 0, height: 0 }} />
                            <span style={{
                                position: 'absolute',
                                cursor: 'pointer',
                                top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                borderRadius: 'var(--radius-full)',
                                transition: 'var(--transition-fast)'
                            }} />
                        </label>
                    </div>
                </div>
            </GlassCard>
        </MainLayout>
    );
}
