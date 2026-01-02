'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import StatCard from '@/components/StatCard';
import TransactionList from '@/components/TransactionList';
import CategoryChart from '@/components/CategoryChart';
import GlassCard from '@/components/GlassCard';
import { DashboardData, getDashboard, Transaction } from '@/lib/api';

// Demo data for when API is not available
const demoData: DashboardData = {
  summary: {
    total_balance: 245780,
    bank_balance: 185420,
    investment_balance: 60360,
    currency: 'CZK',
    accounts_count: 3,
  },
  monthly: {
    income: 65000,
    expenses: 42350,
    savings: 22650,
  },
  categories: {
    'Food': 8500,
    'Transport': 4200,
    'Utilities': 6800,
    'Entertainment': 3500,
    'Shopping': 12350,
    'Other': 7000,
  },
  recent_transactions: [
    { id: '1', date: '2024-12-26', description: 'Lidl - nákup', amount: -1250, currency: 'CZK', category: 'Food', account_id: 'demo', account_type: 'bank' },
    { id: '2', date: '2024-12-25', description: 'Výplata', amount: 65000, currency: 'CZK', category: 'Salary', account_id: 'demo', account_type: 'bank' },
    { id: '3', date: '2024-12-24', description: 'Netflix', amount: -299, currency: 'CZK', category: 'Entertainment', account_id: 'demo', account_type: 'bank' },
    { id: '4', date: '2024-12-23', description: 'Uber', amount: -185, currency: 'CZK', category: 'Transport', account_id: 'demo', account_type: 'bank' },
    { id: '5', date: '2024-12-22', description: 'Dividenda AAPL', amount: 450, currency: 'CZK', category: 'Dividend', account_id: 'trading212', account_type: 'investment' },
  ],
  accounts: [
    { id: '1', name: 'Hlavní účet', type: 'bank', balance: 125420, currency: 'CZK' },
    { id: '2', name: 'Spořicí účet', type: 'bank', balance: 60000, currency: 'CZK' },
    { id: '3', name: 'Trading 212', type: 'investment', balance: 60360, currency: 'EUR' },
  ],
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(demoData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const dashboardData = await getDashboard();
        setData(dashboardData);
        setError(null);
      } catch (err) {
        console.log('Using demo data - API not available');
        setError('Demo mode - API nedostupné');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const formatCurrency = (amount: number, currency: string = 'CZK') => {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const savingsPercent = data.monthly.income > 0
    ? ((data.monthly.savings / data.monthly.income) * 100).toFixed(1)
    : '0';

  return (
    <MainLayout accounts={data.accounts} disableScroll={true}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <header style={{ marginBottom: 'var(--spacing-xl)', flexShrink: 0 }}>
          <h1>Dashboard</h1>
          {error && (
            <p className="text-tertiary" style={{ fontSize: '0.875rem', marginTop: 'var(--spacing-sm)' }}>
              ⚠️ {error}
            </p>
          )}
        </header>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', paddingBottom: 'var(--spacing-xl)' }}>
          {/* Summary Stats */}
          <div className="dashboard-grid">
            <StatCard
              icon="💰"
              label="Celkový zůstatek"
              value={data.summary.total_balance}
              currency={data.summary.currency}
            />
            <StatCard
              icon="🏦"
              label="Bankovní účty"
              value={data.summary.bank_balance}
              currency={data.summary.currency}
            />
            <StatCard
              icon="📈"
              label="Investice"
              value={data.summary.investment_balance}
              currency={data.summary.currency}
            />
          </div>

          {/* Monthly Overview */}
          <div className="dashboard-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
            <GlassCard>
              <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                Měsíční přehled
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-secondary">Příjmy</span>
                  <span style={{ color: 'var(--accent-success)', fontWeight: 600 }}>
                    +{formatCurrency(data.monthly.income)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-secondary">Výdaje</span>
                  <span style={{ fontWeight: 600 }}>
                    -{formatCurrency(data.monthly.expenses)}
                  </span>
                </div>
                <div style={{
                  borderTop: '1px solid var(--glass-border-light)',
                  paddingTop: 'var(--spacing-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontWeight: 500 }}>Úspory</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      color: data.monthly.savings >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)',
                      fontWeight: 700,
                      fontSize: '1.25rem'
                    }}>
                      {formatCurrency(data.monthly.savings)}
                    </span>
                    <span className="stat-change positive" style={{ marginLeft: 'var(--spacing-sm)' }}>
                      {savingsPercent}%
                    </span>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h4 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                Výdaje podle kategorií
              </h4>
              <CategoryChart categories={data.categories} currency={data.summary.currency} />
            </GlassCard>
          </div>

          {/* Recent Transactions */}
          <GlassCard hover={false}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--spacing-lg)'
            }}>
              <h4>Poslední transakce</h4>
              <a
                href="/transactions"
                style={{
                  color: 'var(--accent-primary)',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                Zobrazit vše →
              </a>
            </div>
            <TransactionList transactions={data.recent_transactions} showAccount />
          </GlassCard>
        </div>
      </div>
    </MainLayout>
  );
}
