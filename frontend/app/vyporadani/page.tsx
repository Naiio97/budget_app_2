'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '@/components/MainLayout';
import PageLoader from '@/components/PageLoader';
import StatCard from '@/components/StatCard';
import { getLineIcon } from '@/lib/line-icons';
import { getSettlementSummary, SettlementTxSnippet } from '@/lib/api';
import { formatCurrency } from '@/lib/format';

const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1)
        .toLocaleDateString('cs-CZ', { month: 'short', year: '2-digit' });
};

const formatDate = (dateStr: string) =>
    new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(dateStr));

function TxTable({ items, amountKey, emptyText }: {
    items: SettlementTxSnippet[];
    amountKey: 'their_amount' | 'amount';
    emptyText: string;
}) {
    if (items.length === 0) {
        return <div style={{ padding: 'var(--spacing-lg)', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{emptyText}</div>;
    }
    return (
        <div>
            {items.map(tx => (
                <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px var(--spacing-lg)', borderBottom: '0.5px solid var(--border)',
                }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.description}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {formatDate(tx.date)}
                            {tx.counterparty ? ` · ${tx.counterparty}` : ''}
                            {tx.note ? ` · ${tx.note}` : ''}
                            {amountKey === 'their_amount' && ` · celkem ${formatCurrency(Math.abs(tx.amount))}`}
                        </div>
                    </div>
                    <div className="num" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(Math.abs((amountKey === 'their_amount' ? tx.their_amount : tx.amount) ?? 0))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function SettlementPage() {
    const [months, setMonths] = useState(12);

    const { data, isLoading } = useQuery({
        queryKey: ['settlement-summary', months],
        queryFn: () => getSettlementSummary(months),
    });

    if (isLoading || !data) {
        return <MainLayout><PageLoader /></MainLayout>;
    }

    const maxMonthValue = Math.max(1, ...data.months.map(m => Math.max(m.owed, m.received)));
    const namedCounterparties = data.counterparties.filter(c => c.name);

    return (
        <MainLayout>
            <div className="page-container" style={{ gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column' }}>

                <div className="page-head">
                    <div>
                        <h1>Vypořádání</h1>
                        <div className="sub">Společné náklady — kdo mi kolik dluží a co už poslal</div>
                    </div>
                    <div className="seg">
                        {[6, 12, 24].map(m => (
                            <div key={m} className={`seg-item ${months === m ? 'active' : ''}`} onClick={() => setMonths(m)}>
                                {m}M
                            </div>
                        ))}
                    </div>
                </div>

                {/* Souhrn */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                    <StatCard label="Zbývá vyrovnat" value={data.balance} icon={getLineIcon('handshake', 20)} />
                    <StatCard label="Podíly ostatních na výdajích" value={data.total_owed} icon={getLineIcon('users', 20)} />
                    <StatCard label="Už poslali (vypořádání)" value={data.total_received} icon={getLineIcon('coins', 20)} />
                </div>

                {/* Per protistrana */}
                {namedCounterparties.length > 0 && (
                    <div className="surface">
                        <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', fontSize: 13, fontWeight: 600, borderBottom: '0.5px solid var(--border)' }}>
                            Podle protistrany
                        </div>
                        {namedCounterparties.map(cp => (
                            <div key={cp.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px var(--spacing-lg)', borderBottom: '0.5px solid var(--border)' }}>
                                <div style={{ flex: 1, fontWeight: 500 }}>{cp.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                    dluží {formatCurrency(cp.owed)} · poslal(a) {formatCurrency(cp.received)}
                                </div>
                                <div className="num" style={{ fontWeight: 600, color: cp.balance > 0 ? 'var(--neg)' : 'var(--pos)' }}>
                                    {formatCurrency(cp.balance)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Měsíční přehled — jednoduchý sloupcový mini-graf */}
                <div className="surface">
                    <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', fontSize: 13, fontWeight: 600, borderBottom: '0.5px solid var(--border)' }}>
                        Po měsících <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(podíly ostatních vs. přijatá vypořádání)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: 'var(--spacing-lg)', height: 140, overflowX: 'auto' }}>
                        {data.months.map(m => (
                            <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '1 0 34px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
                                    <div title={`Podíly: ${formatCurrency(m.owed)}`} style={{
                                        width: 12, borderRadius: '3px 3px 0 0',
                                        height: Math.max(2, (m.owed / maxMonthValue) * 90),
                                        background: 'var(--neg)', opacity: 0.75,
                                    }} />
                                    <div title={`Přijato: ${formatCurrency(m.received)}`} style={{
                                        width: 12, borderRadius: '3px 3px 0 0',
                                        height: Math.max(2, (m.received / maxMonthValue) * 90),
                                        background: 'var(--pos)', opacity: 0.75,
                                    }} />
                                </div>
                                <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{formatMonth(m.month)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Seznamy */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-md)', alignItems: 'start' }}>
                    <div className="surface">
                        <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', fontSize: 13, fontWeight: 600, borderBottom: '0.5px solid var(--border)' }}>
                            Rozdělené výdaje <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(podíl ostatních)</span>
                        </div>
                        <TxTable items={data.expenses} amountKey="their_amount"
                            emptyText="Žádné rozdělené výdaje — rozděl výdaj v detailu transakce." />
                    </div>
                    <div className="surface">
                        <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', fontSize: 13, fontWeight: 600, borderBottom: '0.5px solid var(--border)' }}>
                            Přijatá vypořádání
                        </div>
                        <TxTable items={data.settlements} amountKey="amount"
                            emptyText="Žádná vypořádání — označ příchozí platbu v detailu transakce." />
                    </div>
                </div>

            </div>
        </MainLayout>
    );
}
