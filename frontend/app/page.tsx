'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import StatCard from '@/components/StatCard';
import TransactionList from '@/components/TransactionList';
import CategoryChart from '@/components/CategoryChart';
import GlassCard from '@/components/GlassCard';
import { DashboardData, getDashboard, Transaction, BudgetOverview, getBudgetOverview } from '@/lib/api';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [budgetOverview, setBudgetOverview] = useState<BudgetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [dashboardData, budgetData] = await Promise.all([
          getDashboard(),
          getBudgetOverview().catch(() => null)
        ]);
        setData(dashboardData);
        setBudgetOverview(budgetData);
        setError(null);
      } catch (err) {
        console.log('API error:', err);
        setError('Nepodařilo se načíst data. Zkontrolujte připojení k serveru.');
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

  // Show loading spinner while fetching data
  if (loading || !data) {
    return (
      <MainLayout accounts={[]}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          flexDirection: 'column',
          gap: 'var(--spacing-md)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--glass-border-light)',
            borderTopColor: 'var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span className="text-secondary">Načítám data...</span>
        </div>
      </MainLayout>
    );
  }

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

          {/* Budget Overview Widget */}
          {budgetOverview && budgetOverview.categories_count > 0 && (
            <GlassCard style={{ marginBottom: 'var(--spacing-xl)' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-md)'
              }}>
                <h4 style={{ margin: 0 }}>💰 Stav rozpočtu</h4>
                <a
                  href="/budgets"
                  style={{
                    color: 'var(--accent-primary)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
                >
                  Spravovat →
                </a>
              </div>

              {/* Total Progress */}
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Celkem</span>
                  <span style={{ fontSize: '0.85rem' }}>
                    {formatCurrency(budgetOverview.total_spent)} / {formatCurrency(budgetOverview.total_budget)}
                  </span>
                </div>
                <div style={{
                  height: '8px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(budgetOverview.total_percentage, 100)}%`,
                    background: budgetOverview.total_percentage >= 100
                      ? 'var(--accent-error)'
                      : budgetOverview.total_percentage >= 80
                        ? 'var(--accent-warning)'
                        : 'var(--accent-success)',
                    borderRadius: '4px',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>

              {/* Top 3 Categories */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {budgetOverview.categories.slice(0, 3).map((cat, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <span style={{ width: '80px', fontSize: '0.8rem' }}>{cat.category}</span>
                    <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(cat.percentage, 100)}%`,
                        background: cat.percentage >= 100
                          ? 'var(--accent-error)'
                          : cat.percentage >= 80
                            ? 'var(--accent-warning)'
                            : 'var(--accent-success)',
                        borderRadius: '3px'
                      }} />
                    </div>
                    <span style={{
                      width: '45px',
                      textAlign: 'right',
                      fontSize: '0.8rem',
                      color: cat.percentage >= 100
                        ? 'var(--accent-error)'
                        : cat.percentage >= 80
                          ? 'var(--accent-warning)'
                          : 'var(--text-secondary)'
                    }}>
                      {cat.percentage.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

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
