'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import GlassCard from '@/components/GlassCard';
import { queryKeys } from '@/lib/queryKeys';

interface Envelope {
    id: number;
    name: string;
    amount: number;
    is_mine: boolean;
    note: string | null;
}

interface ManualAccount {
    id: number;
    name: string;
    account_number: string | null;
    balance: number;
    currency: string;
    my_balance: number;
    envelopes: Envelope[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io';

export default function ManualAccountDetailPage() {
    const params = useParams();
    const router = useRouter();
    const accountId = params.id as string;
    const queryClient = useQueryClient();

    const [editingBalance, setEditingBalance] = useState(false);
    const [balance, setBalance] = useState(0);
    const [editingName, setEditingName] = useState(false);
    const [accountName, setAccountName] = useState('');
    const [showAddEnvelope, setShowAddEnvelope] = useState(false);
    const [newEnvelope, setNewEnvelope] = useState({ name: '', amount: 0, is_mine: false, note: '' });
    const [editingEnvelope, setEditingEnvelope] = useState<number | null>(null);
    const [editEnvelopeData, setEditEnvelopeData] = useState<{ name: string; amount: number; is_mine: boolean; note: string }>({ name: '', amount: 0, is_mine: false, note: '' });
    const [editingAccountNumber, setEditingAccountNumber] = useState(false);
    const [accountNumber, setAccountNumber] = useState('');

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.manualAccount(accountId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }); // sidebar
    };

    const { data: account, isLoading: loading } = useQuery<ManualAccount>({
        queryKey: queryKeys.manualAccount(accountId),
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/manual-accounts/${accountId}`);
            if (!res.ok) throw new Error('Failed to load account');
            const data = await res.json();
            // sync local input states on first load
            setBalance(data.balance);
            setAccountNumber(data.account_number || '');
            return data;
        },
        enabled: !!accountId,
    });

    const updateBalance = async () => {
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ balance })
            });
            setEditingBalance(false);
            invalidate();
        } catch (err) {
            console.error('Failed to update balance:', err);
        }
    };

    const addEnvelope = async () => {
        if (!newEnvelope.name.trim() || newEnvelope.amount <= 0) return;
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}/envelopes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEnvelope)
            });
            setNewEnvelope({ name: '', amount: 0, is_mine: false, note: '' });
            setShowAddEnvelope(false);
            invalidate();
        } catch (err) {
            console.error('Failed to add envelope:', err);
        }
    };

    const updateEnvelope = async (envelopeId: number, data: Partial<Envelope>) => {
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}/envelopes/${envelopeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            setEditingEnvelope(null);
            invalidate();
        } catch (err) {
            console.error('Failed to update envelope:', err);
        }
    };

    const startEditEnvelope = (envelope: Envelope) => {
        setEditingEnvelope(envelope.id);
        setEditEnvelopeData({
            name: envelope.name,
            amount: envelope.amount,
            is_mine: envelope.is_mine,
            note: envelope.note || ''
        });
    };

    const saveEnvelopeEdit = async () => {
        if (editingEnvelope === null) return;
        await updateEnvelope(editingEnvelope, editEnvelopeData);
    };

    const deleteEnvelope = async (envelopeId: number) => {
        if (!confirm('Opravdu smazat tuto obálku?')) return;
        try {
            await fetch(`${API_BASE}/manual-accounts/${accountId}/envelopes/${envelopeId}`, {
                method: 'DELETE'
            });
            invalidate();
        } catch (err) {
            console.error('Failed to delete envelope:', err);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency: 'CZK',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    if (loading) {
        return (
            <MainLayout>
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                    <p className="text-secondary">Načítám účet...</p>
                </div>
            </MainLayout>
        );
    }

    if (!account) {
        return (
            <MainLayout>
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                    <p className="text-secondary">Účet nenalezen</p>
                    <button className="btn btn-primary" onClick={() => router.push('/')}>
                        Zpět na přehled
                    </button>
                </div>
            </MainLayout>
        );
    }

    const borrowedTotal = account.envelopes
        .filter(e => !e.is_mine)
        .reduce((sum, e) => sum + e.amount, 0);
    const unallocated = account.balance - account.envelopes.reduce((sum, e) => sum + e.amount, 0);

    return (
        <MainLayout>
            <div className="page-container">
            <header style={{ marginBottom: 'var(--spacing-xl)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-md)' }}>
                    {editingName ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                            <input
                                type="text"
                                className="input"
                                value={accountName}
                                onChange={(e) => setAccountName(e.target.value)}
                                style={{ fontSize: '1.25rem', fontWeight: 600, width: '100%', maxWidth: '300px' }}
                            />
                            <button className="btn btn-primary" onClick={async () => {
                                await fetch(`${API_BASE}/manual-accounts/${accountId}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ name: accountName })
                                });
                                setEditingName(false);
                                invalidate();
                            }} style={{ padding: '4px 12px' }}>✓</button>
                            <button className="btn" onClick={() => setEditingName(false)} style={{ padding: '4px 12px' }}>✕</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                💼 {account.name}
                            </h1>
                            <button
                                onClick={() => { setAccountName(account.name); setEditingName(true); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '1.2rem', padding: '0 4px' }}
                                title="Přejmenovat"
                            >✏️</button>
                        </div>
                    )}
                    <button
                        className="btn"
                        onClick={() => router.push('/')}
                        style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                        Zpět
                    </button>
                </div>
            </header>

            {/* Balance Cards */}
            <div className="dashboard-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
                {/* 1. Celkem na účtu */}
                <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontSize: '1.25rem' }}>💰</span>
                        <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0, textTransform: 'uppercase', flex: 1, paddingTop: '2px' }}>Celkem na účtu</div>
                    </div>
                    {editingBalance ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '4px', alignItems: 'center', marginTop: 'auto' }}>
                            <input
                                type="number"
                                className="input"
                                value={balance}
                                onChange={(e) => setBalance(Number(e.target.value))}
                                style={{ width: '100%' }}
                            />
                            <button className="btn btn-primary" onClick={updateBalance} style={{ padding: '4px 8px' }}>✓</button>
                            <button className="btn" onClick={() => setEditingBalance(false)} style={{ padding: '4px 8px' }}>✕</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {formatCurrency(account.balance)}
                            </div>
                            <button onClick={() => setEditingBalance(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>✏️</button>
                        </div>
                    )}
                </div>

                {/* 2. Číslo účtu */}
                <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontSize: '1.25rem' }}>🏦</span>
                        <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0, textTransform: 'uppercase', flex: 1, paddingTop: '2px' }}>Číslo účtu (pro detekci)</div>
                    </div>
                    {editingAccountNumber ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '4px', alignItems: 'center', marginTop: 'auto' }}>
                            <input
                                type="text"
                                className="input"
                                value={accountNumber}
                                onChange={(e) => setAccountNumber(e.target.value)}
                                placeholder="např. 2049/6000"
                                style={{ width: '100%' }}
                            />
                            <button className="btn btn-primary" onClick={async () => {
                                await fetch(`${API_BASE}/manual-accounts/${accountId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_number: accountNumber }) });
                                setEditingAccountNumber(false);
                                invalidate();
                            }} style={{ padding: '4px 8px' }}>✓</button>
                            <button className="btn" onClick={() => setEditingAccountNumber(false)} style={{ padding: '4px 8px' }}>✕</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 500, color: accountNumber ? 'inherit' : 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                                {accountNumber || 'Nenastaveno'}
                            </div>
                            <button onClick={() => setEditingAccountNumber(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>✏️</button>
                        </div>
                    )}
                </div>

                {/* 3. Volné k utracení */}
                <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontSize: '1.25rem' }}>💚</span>
                        <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0, textTransform: 'uppercase', flex: 1, paddingTop: '2px' }}>Volné k utracení</div>
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--accent-success)', marginTop: 'auto' }}>
                        {formatCurrency(account.my_balance)}
                    </div>
                </div>

                {/* 4. Rezervované */}
                <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontSize: '1.25rem' }}>📌</span>
                        <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0, textTransform: 'uppercase', flex: 1, paddingTop: '2px' }}>Rezervované</div>
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--accent-warning)', marginTop: 'auto' }}>
                        {formatCurrency(borrowedTotal)}
                    </div>
                </div>

                {/* 5. Nerozděleno */}
                <div className="glass glass-card stat-card animate-fade-in" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontSize: '1.25rem' }}>📦</span>
                        <div className="stat-label" style={{ fontSize: '0.8125rem', marginBottom: 0, textTransform: 'uppercase', flex: 1, paddingTop: '2px' }}>Nerozděleno</div>
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: unallocated !== 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)', marginTop: 'auto' }}>
                        {formatCurrency(unallocated)}
                    </div>
                </div>
            </div>

            {/* Envelopes */}
            <GlassCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
                    <h2 style={{ fontSize: '1.25rem' }}>📨 Obálky</h2>
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowAddEnvelope(true)}
                        style={{ padding: '8px 16px' }}
                    >
                        + Přidat obálku
                    </button>
                </div>

                {/* Add Envelope Form */}
                {showAddEnvelope && (
                    <div style={{ padding: 'var(--spacing-md)', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: 'var(--spacing-md)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto 1fr', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="text"
                                className="input"
                                placeholder="Název (např. Peníze partnera)"
                                value={newEnvelope.name}
                                onChange={(e) => setNewEnvelope({ ...newEnvelope, name: e.target.value })}
                            />
                            <input
                                type="number"
                                className="input"
                                placeholder="Částka"
                                value={newEnvelope.amount || ''}
                                onChange={(e) => setNewEnvelope({ ...newEnvelope, amount: Number(e.target.value) })}
                            />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <input
                                    type="checkbox"
                                    checked={newEnvelope.is_mine}
                                    onChange={(e) => setNewEnvelope({ ...newEnvelope, is_mine: e.target.checked })}
                                />
                                Volné
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Poznámka (volitelné)"
                                value={newEnvelope.note}
                                onChange={(e) => setNewEnvelope({ ...newEnvelope, note: e.target.value })}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button className="btn btn-primary" onClick={addEnvelope}>Přidat</button>
                            <button className="btn" onClick={() => setShowAddEnvelope(false)}>Zrušit</button>
                        </div>
                    </div>
                )}

                {/* Envelopes List */}
                {account.envelopes.length === 0 ? (
                    <p className="text-secondary" style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
                        Zatím nemáte žádné obálky. Přidejte první obálku pro rozdělení peněz.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {account.envelopes.map(envelope => (
                            <div
                                key={envelope.id}
                                style={{
                                    padding: '12px 16px',
                                    background: envelope.is_mine ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                                    borderRadius: '8px',
                                    borderLeft: `4px solid ${envelope.is_mine ? 'var(--accent-success)' : 'var(--accent-warning)'}`
                                }}
                            >
                                {editingEnvelope === envelope.id ? (
                                    /* Edit Form */
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto 1fr', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                className="input"
                                                value={editEnvelopeData.name}
                                                onChange={(e) => setEditEnvelopeData({ ...editEnvelopeData, name: e.target.value })}
                                                placeholder="Název obálky"
                                            />
                                            <input
                                                type="number"
                                                className="input"
                                                value={editEnvelopeData.amount}
                                                onChange={(e) => setEditEnvelopeData({ ...editEnvelopeData, amount: Number(e.target.value) })}
                                            />
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={editEnvelopeData.is_mine}
                                                    onChange={(e) => setEditEnvelopeData({ ...editEnvelopeData, is_mine: e.target.checked })}
                                                />
                                                Volné
                                            </label>
                                            <input
                                                type="text"
                                                className="input"
                                                value={editEnvelopeData.note}
                                                onChange={(e) => setEditEnvelopeData({ ...editEnvelopeData, note: e.target.value })}
                                                placeholder="Poznámka"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn btn-primary" onClick={saveEnvelopeEdit} style={{ padding: '4px 12px' }}>Uložit</button>
                                            <button className="btn" onClick={() => setEditingEnvelope(null)} style={{ padding: '4px 12px' }}>Zrušit</button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Display Mode */
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {envelope.is_mine ? '💚' : '📌'} {envelope.name}
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: envelope.is_mine ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                                                    color: envelope.is_mine ? 'var(--accent-success)' : 'var(--accent-warning)'
                                                }}>
                                                    {envelope.is_mine ? 'Volné' : 'Rezervované'}
                                                </span>
                                            </div>
                                            {envelope.note && (
                                                <div className="text-tertiary" style={{ fontSize: '0.8rem', marginTop: '2px' }}>
                                                    {envelope.note}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontWeight: 600, marginRight: '16px' }}>
                                            {formatCurrency(envelope.amount)}
                                        </div>
                                        <button
                                            onClick={() => startEditEnvelope(envelope)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '8px' }}
                                            title="Upravit obálku"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={() => updateEnvelope(envelope.id, { is_mine: !envelope.is_mine })}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '8px' }}
                                            title={envelope.is_mine ? 'Označit jako rezervované' : 'Označit jako volné'}
                                        >
                                            🔄
                                        </button>
                                        <button
                                            onClick={() => deleteEnvelope(envelope.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b6b' }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </GlassCard>
            </div>
        </MainLayout>
    );
}
