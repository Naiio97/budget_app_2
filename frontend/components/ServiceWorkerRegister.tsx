'use client';

import { useEffect, useState } from 'react';

export default function ServiceWorkerRegister() {
    const [updateReady, setUpdateReady] = useState(false);
    const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        let reloading = false;
        const onControllerChange = () => {
            if (reloading) return;
            reloading = true;
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => {
                // If a SW is already waiting (e.g. app was open during previous deploy)
                if (registration.waiting) {
                    setWaitingWorker(registration.waiting);
                    setUpdateReady(true);
                }

                registration.addEventListener('updatefound', () => {
                    const installing = registration.installing;
                    if (!installing) return;
                    installing.addEventListener('statechange', () => {
                        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                            setWaitingWorker(installing);
                            setUpdateReady(true);
                        }
                    });
                });

                // Check for updates on load + every hour
                registration.update();
                const interval = setInterval(() => registration.update(), 60 * 60 * 1000);
                return () => clearInterval(interval);
            })
            .catch((error) => {
                console.error('SW registration failed:', error);
            });

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, []);

    const applyUpdate = () => {
        if (waitingWorker) {
            waitingWorker.postMessage('SKIP_WAITING');
        }
    };

    if (!updateReady) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom) + 72px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--accent-primary, #2dd4bf)',
            color: '#000',
            borderRadius: '999px',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.85rem',
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
        }}>
            <span>Nová verze aplikace</span>
            <button
                onClick={applyUpdate}
                style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '4px 14px',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                }}
            >
                Aktualizovat
            </button>
        </div>
    );
}
