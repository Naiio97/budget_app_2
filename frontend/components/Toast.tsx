'use client';

import { useEffect } from 'react';

export type ToastMessage = { text: string; kind?: 'success' | 'error' } | null;

/** Krátké plovoucí potvrzení akce (dole uprostřed), samo zmizí. */
export default function Toast({ toast, onClose, duration = 4000 }: {
    toast: ToastMessage;
    onClose: () => void;
    duration?: number;
}) {
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(onClose, duration);
        return () => clearTimeout(t);
    }, [toast, duration, onClose]);

    if (!toast) return null;
    return (
        <div className={`app-toast ${toast.kind === 'error' ? 'error' : ''}`} role="status" onClick={onClose}>
            <span className="app-toast-dot" />
            {toast.text}
        </div>
    );
}
