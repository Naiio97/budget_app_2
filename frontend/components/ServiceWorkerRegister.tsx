'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
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
                const activateWaiting = () => {
                    if (registration.waiting) {
                        registration.waiting.postMessage('SKIP_WAITING');
                    }
                };

                registration.addEventListener('updatefound', () => {
                    const installing = registration.installing;
                    if (!installing) return;
                    installing.addEventListener('statechange', () => {
                        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                            activateWaiting();
                        }
                    });
                });

                // Check immediately + hourly
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

    return null;
}
