import { apiFetch, fetchApi } from './core';
import { isDemoMode } from '../demo-mode';
import { MOCK_SALARY_ESTIMATE } from '../mock-data';

// === Salary estimate (odhad výplaty) ===

export interface SalaryConfig {
    base_monthly: number | null;
    prumer: number | null;
    prumer_quarter: string | null;
}

export interface SalaryBreakdown {
    fond_hodin: number;
    hodinova_sazba: number;
    zakladni_hodiny: number;
    zakladni_mzda: number;
    priplatek_prescas_vsedni: number;
    priplatek_prescas_vikend: number;
    priplatek_so_ne: number;
    priplatek_svatek: number;
    priplatek_noc: number;
    pohotovost_placena_h: number;
    priplatek_pohotovost: number;
    nahrada_dovolena: number;
    nahrada_prekazky: number;
    nahrada_prac_volno: number;
    bonus: number;
    hruba_mzda: number;
    zaklad_dane: number;
    socialni: number;
    zdravotni: number;
    dan: number;
    cista_mzda: number;
    stravenky: number;
    na_ucet: number;
    hours?: {
        dov_h: number;
        prek_h: number;
        volno_h: number;
        pres_wd: number;
        pres_we: number;
        svatek_h: number;
        noc_h: number;
        pohot_h: number;
        pohot_overlap_h: number;
        worked_days: number;
        fond_days: number;
        total_hours: number;
    };
}

export interface SalaryEstimate {
    year_month: string;
    source_filename: string | null;
    fond_days: number;
    salary_used: number;
    prumer_used: number;
    bonus: number;
    gross_pay: number;
    net_pay: number;
    net_to_account: number;
    breakdown: SalaryBreakdown;
    is_accepted: boolean;
    prumer_stale: boolean;
    payout_month: string; // měsíc, kdy výplata přijde na účet (year_month + 1)
    // Zpětná vazba z reálné výplatnice (null, dokud nebyla nahraná)
    actual_net_to_account: number | null;
    actual: {
        na_ucet: number;
        base_monthly: number | null;
        prumer: number | null;
        srazky: Record<string, number>;
        delta: number;
        source_filename?: string;
    } | null;
}

export type SalaryPayslipResult = SalaryEstimate & {
    config_updated: { prumer: boolean; base: boolean };
};

export async function getSalaryConfig(): Promise<SalaryConfig> {
    return fetchApi<SalaryConfig>('/settings/salary-config');
}

export async function saveSalaryConfig(data: SalaryConfig): Promise<void> {
    const r = await apiFetch('/settings/salary-config', { method: 'POST', body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Failed to save salary config');
}

export async function getSalaryEstimate(yearMonth: string): Promise<SalaryEstimate | null> {
    const r = await apiFetch(`/salary-estimate/${yearMonth}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
}

export async function uploadSalaryTimesheet(yearMonth: string, file: File, bonus: number): Promise<SalaryEstimate> {
    if (isDemoMode()) {
        // Mutace v demo módu vrací generické {status:'ok'} — tady potřebujeme
        // celý odhad, aby se vykreslila účtenka.
        await new Promise((r) => setTimeout(r, 300));
        return { ...MOCK_SALARY_ESTIMATE, year_month: yearMonth, bonus };
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bonus', String(bonus));
    const r = await apiFetch(`/salary-estimate/${yearMonth}`, { method: 'POST', body: formData });
    if (!r.ok) {
        const detail = await r.json().then((b) => b?.detail).catch(() => null);
        // FastAPI validační chyby (422) mají detail jako pole objektů — ukázat jen stringy
        throw new Error(typeof detail === 'string' ? detail : 'Nahrání timesheetu selhalo');
    }
    return r.json();
}

export async function uploadSalaryPayslip(yearMonth: string, file: File): Promise<SalaryPayslipResult> {
    if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 300));
        return {
            ...MOCK_SALARY_ESTIMATE,
            actual_net_to_account: MOCK_SALARY_ESTIMATE.net_to_account,
            actual: { na_ucet: MOCK_SALARY_ESTIMATE.net_to_account, base_monthly: 45000, prumer: 250, srazky: {}, delta: 0 },
            config_updated: { prumer: false, base: false },
        };
    }
    const formData = new FormData();
    formData.append('file', file);
    const r = await apiFetch(`/salary-estimate/${yearMonth}/payslip`, { method: 'POST', body: formData });
    if (!r.ok) {
        const detail = await r.json().then((b) => b?.detail).catch(() => null);
        throw new Error(typeof detail === 'string' ? detail : 'Nahrání výplatnice selhalo');
    }
    return r.json();
}

export async function acceptSalaryEstimate(yearMonth: string): Promise<void> {
    const r = await apiFetch(`/salary-estimate/${yearMonth}/accept`, { method: 'POST' });
    if (!r.ok) throw new Error('Failed to accept salary estimate');
}
