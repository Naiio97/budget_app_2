'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Okno s formulářem (přidat / upravit záznam) — stejný skleněný vzhled jako detail
// transakce a splátkový kalendář. Zavírá se klikem na pozadí, křížkem i Escapem.
export default function FormModal({ title, subtitle, onClose, children }: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: ReactNode;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    return createPortal(
        <div className="modal-backdrop tx-modal-overlay" onClick={onClose}>
            <div className="modal form-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
                <div className="form-modal-head">
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="form-modal-title">{title}</div>
                        {subtitle && <div className="form-modal-sub">{subtitle}</div>}
                    </div>
                    <button onClick={onClose} className="btn btn-icon btn-ghost" aria-label="Zavřít">×</button>
                </div>
                <div className="form-modal-body">{children}</div>
            </div>
        </div>,
        document.body
    );
}
