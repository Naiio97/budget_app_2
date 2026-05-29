'use client';

// Inactivity auto-logout with a "stay signed in" prompt.
//
// Rules (finance-app hardening):
//   - 15 min of inactivity → warning modal, then sign out.
//   - The user can postpone ("Zůstat přihlášen") to get a fresh 15-min window.
//   - A HARD 1-hour cap on the whole session overrides everything: once an hour
//     has passed since login you're signed out no matter what — so postponing
//     only works ~3 times (15·4 = 60 min) before the cap kicks in.
//
// Activity (mouse/keys/scroll/touch) also resets the idle window, so an active
// user never sees the prompt; the 1-hour cap still applies to them.
//
// Timestamps live in localStorage so multiple tabs share one session clock and
// reopening a tab re-evaluates against real elapsed time.

import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { clearBackendTokenCache } from '@/lib/api';
import { isDemoMode } from '@/lib/demo-mode';

const IDLE_LIMIT_MS = 15 * 60 * 1000;   // inactivity window
const SESSION_MAX_MS = 60 * 60 * 1000;  // absolute session cap
const WARN_BEFORE_MS = 60 * 1000;       // show the prompt this long before idle logout
const TICK_MS = 1000;                   // evaluation cadence (drives the live countdown)

const LS_LAST_ACTIVITY = 'idle_last_activity';
const LS_SESSION_START = 'idle_session_start';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'mousemove', 'touchstart', 'scroll', 'wheel'];

const readNum = (key: string): number => {
    const v = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    return v ? parseInt(v, 10) : 0;
};

export default function IdleLogout() {
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [capLeftMin, setCapLeftMin] = useState(0);
    const loggingOut = useRef(false);
    // True while the countdown prompt is showing. Once it's up, passive activity
    // (mouse drift, scroll) must NOT silently keep the session alive — only an
    // explicit "Zůstat přihlášen" click does, like a bank's "are you there?".
    const warningActive = useRef(false);

    const doLogout = useCallback(async (reason: 'idle' | 'cap') => {
        if (loggingOut.current) return;
        loggingOut.current = true;
        localStorage.removeItem(LS_LAST_ACTIVITY);
        localStorage.removeItem(LS_SESSION_START);
        clearBackendTokenCache();
        await signOut({ redirectTo: `/login?timeout=${reason}` });
    }, []);

    const markActivity = useCallback(() => {
        localStorage.setItem(LS_LAST_ACTIVITY, String(Date.now()));
    }, []);

    useEffect(() => {
        if (isDemoMode()) return; // demo has no real session

        const nowTs = Date.now();
        if (!readNum(LS_SESSION_START)) localStorage.setItem(LS_SESSION_START, String(nowTs));
        if (!readNum(LS_LAST_ACTIVITY)) localStorage.setItem(LS_LAST_ACTIVITY, String(nowTs));

        // Throttle activity writes to ~once/2s so mousemove doesn't hammer
        // localStorage. Activity is ignored while the prompt is up so only the
        // explicit button resets the timer.
        let lastWrite = 0;
        const onActivity = () => {
            if (loggingOut.current || warningActive.current) return;
            const t = Date.now();
            if (t - lastWrite > 2000) {
                lastWrite = t;
                markActivity();
            }
        };
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

        const tick = () => {
            if (loggingOut.current) return;
            const t = Date.now();
            const sessionAge = t - readNum(LS_SESSION_START);
            const idleFor = t - readNum(LS_LAST_ACTIVITY);

            if (sessionAge >= SESSION_MAX_MS) {
                doLogout('cap');
                return;
            }
            if (idleFor >= IDLE_LIMIT_MS) {
                doLogout('idle');
                return;
            }
            const msUntilIdleLogout = IDLE_LIMIT_MS - idleFor;
            if (msUntilIdleLogout <= WARN_BEFORE_MS) {
                warningActive.current = true;
                setSecondsLeft(Math.ceil(msUntilIdleLogout / 1000));
                // Remaining slice of the 1-hour hard cap — postponing can't exceed it.
                setCapLeftMin(Math.max(0, Math.round((SESSION_MAX_MS - sessionAge) / 60000)));
            } else {
                warningActive.current = false;
                setSecondsLeft(null);
            }
        };

        tick();
        const interval = setInterval(tick, TICK_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);

        return () => {
            ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [doLogout, markActivity]);

    const stayLoggedIn = () => {
        warningActive.current = false;
        markActivity();
        setSecondsLeft(null);
    };

    if (secondsLeft === null) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.5)',
                padding: 24,
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 360,
                    background: 'var(--surface)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 20,
                    padding: '28px 24px',
                    textAlign: 'center',
                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.45)',
                }}
            >
                <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                    Jsi tu ještě?
                </h2>
                <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-2)' }}>
                    Kvůli nečinnosti tě za <strong>{secondsLeft}&nbsp;s</strong> odhlásíme.
                </p>
                <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-3)' }}>
                    Relace skončí nejpozději za {capLeftMin}&nbsp;min.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button type="button" className="btn btn-primary" style={{ width: '100%', height: 44 }} onClick={stayLoggedIn}>
                        Zůstat přihlášen
                    </button>
                    <button type="button" className="btn" style={{ width: '100%', height: 44 }} onClick={() => doLogout('idle')}>
                        Odhlásit se
                    </button>
                </div>
            </div>
        </div>
    );
}
