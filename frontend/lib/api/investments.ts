import { apiFetch, fetchApi } from './core';

// Investment portfolio (from database)
export interface InvestmentPortfolio {
    total_value: number;
    currency: string;
    last_synced: string | null;
    transactions: Array<{
        id: string;
        date: string;
        description: string;
        amount: number;
        currency: string;
        category: string;
    }>;
}

export interface PortfolioHistory {
    history: Array<{ date: string; value: number }>;
    currency: string;
}

export interface Dividend {
    date: string;
    ticker: string;
    amount: number;
    currency: string;
}

export async function getInvestmentPortfolio(): Promise<InvestmentPortfolio> {
    return fetchApi<InvestmentPortfolio>('/investments/portfolio');
}

export async function getPortfolioHistory(period: string = '1M'): Promise<PortfolioHistory> {
    return fetchApi<PortfolioHistory>(`/investments/history?period=${period}`);
}

export async function getDividends(limit: number = 50): Promise<{ dividends: Dividend[] }> {
    return fetchApi<{ dividends: Dividend[] }>(`/investments/dividends?limit=${limit}`);
}

export interface InvestmentPortfolioDetail {
    total_value: number;
    invested: number;
    result: number;
    cash_free: number;
    currency: string;
    last_synced: string | null;
}

export async function getPortfolioDetail(): Promise<InvestmentPortfolioDetail> {
    return fetchApi<InvestmentPortfolioDetail>('/investments/portfolio-detail');
}

export interface PortfolioPosition {
    ticker: string;
    quantity: number;
    average_price_eur: number;
    current_price_eur: number;
    value_czk: number;
    invested_czk: number;
    ppl_czk: number;
    ppl_pct: number;
}

export async function getPositions(): Promise<{ positions: PortfolioPosition[]; currency: string }> {
    return fetchApi<{ positions: PortfolioPosition[]; currency: string }>('/investments/positions');
}

export interface PieInstrument {
    ticker: string;
    current_share: number;  // percentage
    value_czk: number;
    result_czk: number;
}

export interface Pie {
    id: number;
    name: string;
    icon: string;
    goal: number | null;
    invested_czk: number;
    value_czk: number;
    result_czk: number;
    result_pct: number;
    instruments: PieInstrument[];
}

export async function getPies(): Promise<{ pies: Pie[]; currency: string }> {
    return fetchApi<{ pies: Pie[]; currency: string }>('/investments/pies');
}

// === Manual Investments ===

export interface ManualInvestmentPosition {
    id: number;
    name: string;
    quantity: number | null;
    avg_buy_price: number | null;
    current_value: number;
    currency: string;
    note: string | null;
    invested: number | null;
    pnl: number | null;
    pnl_pct: number | null;
}

export interface ManualInvestmentAccount {
    id: number;
    name: string;
    currency: string;
    note: string | null;
    is_visible: boolean;
    total_value: number;
    invested: number;
    pnl: number;
    pnl_pct: number;
    positions: ManualInvestmentPosition[];
}

export interface ManualInvestmentHistoryPoint {
    date: string;
    value: number;
}

export async function getManualInvestments(): Promise<ManualInvestmentAccount[]> {
    const r = await apiFetch(`/manual-investments/`);
    if (!r.ok) throw new Error('Failed to fetch manual investments');
    return r.json();
}

export async function getManualInvestment(id: number): Promise<ManualInvestmentAccount> {
    const r = await apiFetch(`/manual-investments/${id}`);
    if (!r.ok) throw new Error('Failed to fetch manual investment');
    return r.json();
}

export async function createManualInvestment(data: { name: string; currency?: string; note?: string }): Promise<ManualInvestmentAccount> {
    const r = await apiFetch(`/manual-investments/`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to create manual investment');
    return r.json();
}

export async function updateManualInvestment(id: number, data: { name?: string; currency?: string; note?: string; is_visible?: boolean }): Promise<ManualInvestmentAccount> {
    const r = await apiFetch(`/manual-investments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to update manual investment');
    return r.json();
}

export async function deleteManualInvestment(id: number): Promise<void> {
    const r = await apiFetch(`/manual-investments/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete manual investment');
}

export async function getManualInvestmentHistory(id: number): Promise<ManualInvestmentHistoryPoint[]> {
    const r = await apiFetch(`/manual-investments/${id}/history`);
    if (!r.ok) throw new Error('Failed to fetch history');
    return r.json();
}

export async function createManualInvestmentPosition(accountId: number, data: { name: string; quantity?: number | null; avg_buy_price?: number | null; current_value: number; currency?: string; note?: string | null }): Promise<ManualInvestmentPosition> {
    const r = await apiFetch(`/manual-investments/${accountId}/positions`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to create position');
    return r.json();
}

export async function updateManualInvestmentPosition(accountId: number, positionId: number, data: { name?: string; quantity?: number | null; avg_buy_price?: number | null; current_value?: number; currency?: string; note?: string | null }): Promise<ManualInvestmentPosition> {
    const r = await apiFetch(`/manual-investments/${accountId}/positions/${positionId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to update position');
    return r.json();
}

export async function deleteManualInvestmentPosition(accountId: number, positionId: number): Promise<void> {
    const r = await apiFetch(`/manual-investments/${accountId}/positions/${positionId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete position');
}
