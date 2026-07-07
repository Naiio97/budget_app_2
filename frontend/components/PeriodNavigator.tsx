'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { apiFetch } from '@/lib/api';
import { getLineIcon } from '@/lib/line-icons';

const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const MONTH_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

const POP_WIDTH = 272;

interface AnnualMonths {
    months: Array<{ month: number; income: number; expenses: number }>;
}

interface PeriodNavigatorProps {
    year: number;
    month: number;
    mode: 'month' | 'year';
    /** Šipky — posun období bez změny režimu zobrazení. */
    onChange: (year: number, month: number) => void;
    /** Explicitní výběr měsíce (mřížka, Dnes) — rodič může přepnout na měsíční pohled. */
    onPickMonth: (year: number, month: number) => void;
}

export default function PeriodNavigator({ year, month, mode, onChange, onPickMonth }: PeriodNavigatorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [pickerYear, setPickerYear] = useState(year);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const anchorRef = useRef<HTMLDivElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;

    const mounted = useSyncExternalStore(() => () => { }, () => true, () => false);

    const updatePos = useCallback(() => {
        if (!anchorRef.current) return;
        const r = anchorRef.current.getBoundingClientRect();
        const left = Math.min(Math.max(r.left + r.width / 2 - POP_WIDTH / 2, 8), window.innerWidth - POP_WIDTH - 8);
        setPos({ top: r.bottom + 6, left });
    }, []);

    useLayoutEffect(() => { if (isOpen) updatePos(); }, [isOpen, updatePos]);

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('resize', updatePos);
        window.addEventListener('scroll', updatePos, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('resize', updatePos);
            window.removeEventListener('scroll', updatePos, true);
        };
    }, [isOpen, updatePos]);

    // Tečky u měsíců s daty — sdílí cache s ročním přehledem na stránce
    const { data: pickerAnnual } = useQuery<AnnualMonths>({
        queryKey: queryKeys.annualOverview(pickerYear),
        queryFn: () => apiFetch(`/annual-overview/${pickerYear}`).then(r => r.json()),
        enabled: isOpen,
        staleTime: 60 * 1000,
    });
    const hasData = (m: number) => {
        const row = pickerAnnual?.months?.find(x => x.month === m);
        return !!row && (row.income > 0 || row.expenses > 0);
    };

    const step = (delta: number) => {
        if (mode === 'year') { onChange(year + delta, month); return; }
        let m = month + delta, y = year;
        if (m < 1) { m = 12; y -= 1; }
        if (m > 12) { m = 1; y += 1; }
        onChange(y, m);
    };

    const togglePicker = () => {
        setPickerYear(year);
        setIsOpen(o => !o);
    };

    const pick = (y: number, m: number) => {
        onPickMonth(y, m);
        setIsOpen(false);
    };

    const popover = isOpen ? (
        <div ref={popRef} className="month-picker-pop" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label="Výběr měsíce">
            <div className="month-picker-head">
                <button type="button" className="period-nav-arrow" onClick={() => setPickerYear(y => y - 1)} aria-label="Předchozí rok">
                    {getLineIcon('chevronLeft', 16)}
                </button>
                <span className="month-picker-year num">{pickerYear}</span>
                <button type="button" className="period-nav-arrow" onClick={() => setPickerYear(y => y + 1)} aria-label="Další rok">
                    {getLineIcon('chevronRight', 16)}
                </button>
            </div>
            <div className="month-picker-grid">
                {MONTH_SHORT.map((name, i) => {
                    const m = i + 1;
                    const isSelected = pickerYear === year && m === month;
                    const isCurrent = pickerYear === thisYear && m === thisMonth;
                    return (
                        <button key={m} type="button"
                            className={`mp-month ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                            onClick={() => pick(pickerYear, m)}
                            aria-label={`${MONTH_NAMES[i]} ${pickerYear}`}
                        >
                            {name}
                            {hasData(m) && <span className="mp-dot" />}
                        </button>
                    );
                })}
            </div>
            <div className="month-picker-foot">
                <button type="button" className="btn btn-sm" onClick={() => pick(thisYear, thisMonth)}>Dnes</button>
            </div>
        </div>
    ) : null;

    return (
        <div ref={anchorRef} className="period-nav" data-mode={mode}>
            <button type="button" className="period-nav-arrow" onClick={() => step(-1)}
                aria-label={mode === 'year' ? 'Předchozí rok' : 'Předchozí měsíc'}>
                {getLineIcon('chevronLeft', 16)}
            </button>
            <button type="button" className={`period-nav-label ${isOpen ? 'open' : ''}`} onClick={togglePicker}
                aria-haspopup="dialog" aria-expanded={isOpen}>
                {mode === 'year' ? year : `${MONTH_NAMES[month - 1]} ${year}`}
                {getLineIcon('chevronDown', 11)}
            </button>
            <button type="button" className="period-nav-arrow" onClick={() => step(1)}
                aria-label={mode === 'year' ? 'Další rok' : 'Další měsíc'}>
                {getLineIcon('chevronRight', 16)}
            </button>
            {mounted && createPortal(popover, document.body)}
        </div>
    );
}
