'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getSalaryConfig, saveSalaryConfig, getSalaryEstimate,
    uploadSalaryTimesheet, uploadSalaryPayslip, acceptSalaryEstimate,
    SalaryConfig, SalaryEstimate,
} from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { getLineIcon } from '@/lib/line-icons';
import { formatCurrency } from './shared';

// Karta odhadu výplaty (timesheet → výpočet → kalibrace výplatnicí).
// Renderuje se jen v měsíčním pohledu; workMonth = M-1 zobrazeného měsíce,
// protože výplata za M-1 chodí na účet v M.
export default function SalaryEstimateCard({ workMonth, workMonthName, refreshBudget }: {
    workMonth: string;
    workMonthName: string;
    refreshBudget: () => Promise<unknown>;
}) {
    const queryClient = useQueryClient();

    const [salaryCfgEdit, setSalaryCfgEdit] = useState<Record<string, string>>({});
    const [salaryBonus, setSalaryBonus] = useState('');
    const [salaryFile, setSalaryFile] = useState<File | null>(null);
    const [salaryUploading, setSalaryUploading] = useState(false);
    const [salaryError, setSalaryError] = useState<string | null>(null);
    const [salaryReceiptOpen, setSalaryReceiptOpen] = useState(false);
    const [salaryInfo, setSalaryInfo] = useState<string | null>(null);
    const [salaryPayslipUploading, setSalaryPayslipUploading] = useState(false);
    const salaryFileRef = useRef<HTMLInputElement>(null);
    const salaryPayslipRef = useRef<HTMLInputElement>(null);

    const { data: salaryConfig } = useQuery<SalaryConfig>({
        queryKey: queryKeys.salaryConfig,
        queryFn: getSalaryConfig,
        staleTime: 5 * 60 * 1000,
    });

    const { data: salaryEstimate } = useQuery<SalaryEstimate | null>({
        queryKey: queryKeys.salaryEstimate(workMonth),
        queryFn: () => getSalaryEstimate(workMonth),
    });

    // Uloží konfiguraci, pokud jsou vyplněná povinná pole (kvartál je volitelný).
    // Vrací false, když mzda/průměr chybí — volající zobrazí hlášku.
    const commitSalaryConfig = async (): Promise<boolean> => {
        const base = parseFloat(salaryCfgEdit['base_monthly'] ?? String(salaryConfig?.base_monthly ?? ''));
        const prumer = parseFloat(salaryCfgEdit['prumer'] ?? String(salaryConfig?.prumer ?? ''));
        const quarter = (salaryCfgEdit['prumer_quarter'] ?? salaryConfig?.prumer_quarter ?? '').trim();
        if (!Number.isFinite(base) || !Number.isFinite(prumer)) return false;
        await saveSalaryConfig({ base_monthly: base, prumer, prumer_quarter: quarter || null });
        queryClient.invalidateQueries({ queryKey: queryKeys.salaryConfig });
        return true;
    };

    const computeSalaryEstimate = async () => {
        if (!salaryFile) return;
        setSalaryUploading(true);
        setSalaryError(null);
        try {
            // Timesheet od zaměstnavatele má v názvu RRRRMM — pro rozpočet
            // měsíce M patří timesheet za M-1 (výplata chodí měsíc pozadu)
            const m = salaryFile.name.match(/(20\d{2})(0[1-9]|1[0-2])/);
            if (m) {
                const fileYm = `${m[1]}-${m[2]}`;
                if (fileYm !== workMonth) {
                    setSalaryError(`Soubor je timesheet za ${fileYm} — ta výplata patří do rozpočtu následujícího měsíce. Přepni měsíc v navigaci nahoře.`);
                    return;
                }
            }
            // Konfigurace se uloží vždy před výpočtem — blur eventy nejsou spolehlivé
            const configOk = await commitSalaryConfig();
            if (!configOk) {
                setSalaryError('Vyplň nejdřív měsíční mzdu a průměr náhrady.');
                return;
            }
            const est = await uploadSalaryTimesheet(workMonth, salaryFile, parseFloat(salaryBonus) || 0);
            queryClient.setQueryData(queryKeys.salaryEstimate(workMonth), est);
            setSalaryReceiptOpen(true);
        } catch (e) {
            setSalaryError(e instanceof Error ? e.message : 'Nahrání timesheetu selhalo');
        } finally {
            setSalaryUploading(false);
        }
    };

    const uploadPayslip = async (file: File) => {
        setSalaryPayslipUploading(true);
        setSalaryError(null);
        setSalaryInfo(null);
        try {
            const result = await uploadSalaryPayslip(workMonth, file);
            queryClient.setQueryData(queryKeys.salaryEstimate(workMonth), result);
            if (result.config_updated.prumer || result.config_updated.base) {
                queryClient.invalidateQueries({ queryKey: queryKeys.salaryConfig });
                const parts = [];
                if (result.config_updated.prumer) parts.push(`průměr náhrady → ${result.actual?.prumer}`);
                if (result.config_updated.base) parts.push(`základní mzda → ${result.actual?.base_monthly}`);
                setSalaryInfo(`Konfigurace zkalibrována z výplatnice: ${parts.join(', ')}.`);
            }
        } catch (e) {
            setSalaryError(e instanceof Error ? e.message : 'Nahrání výplatnice selhalo');
        } finally {
            setSalaryPayslipUploading(false);
        }
    };

    const acceptEstimateAsIncome = async () => {
        // Odhad za M-1 se zapíše jako příjem do zobrazeného měsíce M (backend
        // cílí payout_month = work month + 1) — refreshBudget() invaliduje
        // právě zobrazený rozpočet
        await acceptSalaryEstimate(workMonth);
        await refreshBudget();
        queryClient.invalidateQueries({ queryKey: queryKeys.salaryEstimate(workMonth) });
    };

    const salaryCfgField = (field: 'base_monthly' | 'prumer' | 'prumer_quarter', label: string, numeric: boolean) => (
        <div className="plan-row" key={field}>
            <span className="plan-label">{label}</span>
            <span className="plan-row-spacer" />
            <input type={numeric ? 'number' : 'text'} className="plan-input plan-amount" placeholder={numeric ? '0' : 'RRRR-Q1'}
                value={salaryCfgEdit[field] ?? (salaryConfig?.[field] == null ? '' : String(salaryConfig[field]))}
                onChange={(e) => setSalaryCfgEdit(p => ({ ...p, [field]: e.target.value }))}
                onBlur={commitSalaryConfig}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
        </div>
    );

    const b = salaryEstimate?.breakdown;
    const receiptLines: Array<[string, string, number]> = b ? [
        ['Základní mzda', `${Math.round(b.zakladni_hodiny)} h × ${b.hodinova_sazba.toFixed(2)}`, b.zakladni_mzda],
        ['Přesčas všední', '25 %', b.priplatek_prescas_vsedni],
        ['Přesčas SO/NE', '50 %', b.priplatek_prescas_vikend],
        ['Příplatek SO/NE', '50 %', b.priplatek_so_ne],
        ['Práce ve svátek', '100 %', b.priplatek_svatek],
        ['Noční', '10 %', b.priplatek_noc],
        ['Pohotovost', `${Math.round(b.pohotovost_placena_h)} h · 10 %`, b.priplatek_pohotovost],
        ['Dovolená', 'průměr', b.nahrada_dovolena],
        ['Překážky', 'průměr', b.nahrada_prekazky],
        ['Pracovní volno', 'základ', b.nahrada_prac_volno],
        ['Roční bonus', '', b.bonus],
    ].filter((l): l is [string, string, number] => Math.abs(l[2] as number) > 0.5) : [];

    return (
        <section className="budget-plan-section">
            <div className="budget-plan-section-head">
                <h3>{getLineIcon('income', 16)} Odhad výplaty <span className="muted small" style={{ fontWeight: 400 }}>za {workMonthName.toLowerCase()}</span></h3>
                {salaryEstimate?.is_accepted && <span className="muted small">Přijato ✓</span>}
            </div>
            <div className="plan-rows">
                {salaryCfgField('base_monthly', 'Měsíční mzda', true)}
                {salaryCfgField('prumer', 'Průměr náhrady (Kč/h)', true)}
                {salaryCfgField('prumer_quarter', 'Kvartál průměru', false)}
            </div>
            <div className="plan-rows">
                <div className="plan-row">
                    <span className="plan-label">Roční bonus (Kč)</span>
                    <span className="plan-row-spacer" />
                    <input type="number" className="plan-input plan-amount" placeholder="0"
                        value={salaryBonus} onChange={(e) => setSalaryBonus(e.target.value)} />
                </div>
                <input ref={salaryFileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
                    onChange={(e) => { setSalaryFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-sm" onClick={() => salaryFileRef.current?.click()}
                        style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {salaryFile ? salaryFile.name : 'Nahrát timesheet (.xlsx)'}
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={!salaryFile || salaryUploading} onClick={computeSalaryEstimate}>
                        {salaryUploading ? 'Počítám…' : 'Spočítat'}
                    </button>
                    {salaryEstimate && (
                        <>
                            <input ref={salaryPayslipRef} type="file" accept=".pdf" style={{ display: 'none' }}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPayslip(f); e.target.value = ''; }} />
                            <button className="btn btn-sm" disabled={salaryPayslipUploading} onClick={() => salaryPayslipRef.current?.click()}>
                                {salaryPayslipUploading ? 'Čtu…' : 'Výplatnice (PDF)'}
                            </button>
                        </>
                    )}
                </div>
                {salaryError && <div style={{ color: 'var(--neg)', fontSize: 12 }}>{salaryError}</div>}
                {salaryInfo && <div style={{ color: 'var(--pos)', fontSize: 12 }}>{salaryInfo}</div>}
            </div>
            {salaryEstimate && b && (
                <div className="plan-rows" style={{ gap: 12 }}>
                    {salaryEstimate.prumer_stale && (
                        <div style={{ color: 'var(--warn)', fontSize: 12 }}>
                            Průměr náhrady je z jiného kvartálu ({salaryConfig?.prumer_quarter}) — po první pásce kvartálu ho aktualizuj.
                        </div>
                    )}
                    <div style={{ padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border)' }}>
                        <button type="button" onClick={() => setSalaryReceiptOpen(o => !o)}
                            style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 13 }}>
                            <span style={{ color: 'var(--text-2)' }}>Na účet ({salaryEstimate.fond_days} prac. dní)</span>
                            <span style={{ fontWeight: 600 }}>{formatCurrency(salaryEstimate.net_to_account)} {salaryReceiptOpen ? '▾' : '▸'}</span>
                        </button>
                        {salaryEstimate.actual_net_to_account !== null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: '0.5px solid var(--border)' }}>
                                <span style={{ color: 'var(--text-2)' }}>Realita (výplatnice)</span>
                                <span>
                                    <span className="num" style={{ fontWeight: 600 }}>{formatCurrency(salaryEstimate.actual_net_to_account)}</span>
                                    <span className="num" style={{ marginLeft: 8, color: Math.abs(salaryEstimate.actual?.delta ?? 0) < 100 ? 'var(--pos)' : 'var(--warn)' }}>
                                        Δ {(salaryEstimate.actual?.delta ?? 0) >= 0 ? '+' : ''}{formatCurrency(salaryEstimate.actual?.delta ?? 0)}
                                    </span>
                                </span>
                            </div>
                        )}
                        {salaryReceiptOpen && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                                {receiptLines.map(([name, meta, val]) => (
                                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-2)' }}>{name}{meta ? <span style={{ color: 'var(--text-3)', marginLeft: 6, fontSize: 11 }}>{meta}</span> : null}</span>
                                        <span className="num">{formatCurrency(val)}</span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid var(--border)', paddingTop: 6, marginTop: 4, fontWeight: 600 }}>
                                    <span>Hrubá mzda</span><span className="num">{formatCurrency(b.hruba_mzda)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                    <span>Sociální 7,1 %</span><span className="num">−{formatCurrency(b.socialni)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                    <span>Zdravotní 4,5 %</span><span className="num">−{formatCurrency(b.zdravotni)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                    <span>Záloha daně 15 % − sleva</span><span className="num">−{formatCurrency(b.dan)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '0.5px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                                    <span>Čistá mzda</span><span className="num">{formatCurrency(b.cista_mzda)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--neg)' }}>
                                    <span>Stravenky {b.hours?.worked_days ?? ''} × 105,75</span><span className="num">−{formatCurrency(b.stravenky)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--pos)', borderTop: '0.5px solid var(--border-strong)', paddingTop: 6, marginTop: 4 }}>
                                    <span>Na účet</span><span className="num">{formatCurrency(salaryEstimate.net_to_account)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    {!salaryEstimate.is_accepted && (
                        <button className="btn btn-primary btn-sm" onClick={acceptEstimateAsIncome}>
                            Přijmout jako příjem
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
