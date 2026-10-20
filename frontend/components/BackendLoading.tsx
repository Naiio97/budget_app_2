"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import "./BackendLoading.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
const EXPECTED_MS = 45000;
const SHOW_AFTER_MS = 700; // rychlý start (warm kontejner) nemá blikat loadingem

const STEPS = ["Spouštíme aplikační server", "Připojujeme databázi", "Připravujeme přihlášení"];
const STATUS = ["Probouzíme vaše finance…", "Ještě chvilku, databáze se probouzí…", "Skoro hotovo…"];

async function isOk(path: string): Promise<boolean> {
    try {
        const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
        return r.ok;
    } catch {
        return false;
    }
}

// Zobrazí children (login) až když backend odpovídá i databáze je dostupná.
// Při cold startu Azure kontejnerů a DB jinak login naběhne a nejde se přihlásit.
export default function BackendReady({ children }: { children: ReactNode }) {
    const [phase, setPhase] = useState(USE_MOCKS ? 3 : 0);
    const [showLoading, setShowLoading] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [sinceStep, setSinceStep] = useState(0);
    const [stepTimes, setStepTimes] = useState<number[]>([]);
    const startRef = useRef(0);
    const stepStartRef = useRef(0);

    useEffect(() => {
        if (USE_MOCKS) return;
        let cancelled = false;
        startRef.current = stepStartRef.current = Date.now();
        const showTimer = setTimeout(() => setShowLoading(true), SHOW_AFTER_MS);
        const tick = setInterval(() => {
            setElapsed(Date.now() - startRef.current);
            setSinceStep(Date.now() - stepStartRef.current);
        }, 400);

        (async () => {
            let p = 0;
            while (!cancelled) {
                const path = p === 0 ? "/api/health" : "/api/health/db";
                if (await isOk(path)) {
                    const secs = Math.max(1, Math.round((Date.now() - stepStartRef.current) / 1000));
                    stepStartRef.current = Date.now();
                    setStepTimes((t) => [...t, secs]);
                    p += 1;
                    setPhase(p === 2 ? 2 : p);
                    if (p === 2) {
                        // krátká pauza, ať je vidět dokončený stav
                        await new Promise((r) => setTimeout(r, 400));
                        if (!cancelled) setPhase(3);
                        return;
                    }
                } else {
                    await new Promise((r) => setTimeout(r, 2000));
                }
            }
        })();

        return () => {
            cancelled = true;
            clearTimeout(showTimer);
            clearInterval(tick);
        };
    }, []);

    if (phase >= 3) return <>{children}</>;
    if (!showLoading) return null;

    const base = [0, 45, 90][phase] ?? 100;
    const span = [43, 43, 8][phase] ?? 0;
    const pct = Math.round(base + span * (1 - Math.exp(-sinceStep / (EXPECTED_MS / 3))));

    return (
        <div className="bl-screen">
            <main className="bl-card" role="status" aria-live="polite">
                <div className="bl-ring">
                    <svg className="bl-arc" viewBox="0 0 132 132" aria-hidden="true">
                        <circle cx="66" cy="66" r="64" fill="none" stroke="rgba(47,107,234,.12)" strokeWidth="3" />
                        <circle cx="66" cy="66" r="64" fill="none" stroke="url(#bl-g)" strokeWidth="3" strokeLinecap="round" strokeDasharray="250 402" />
                        <defs><linearGradient id="bl-g"><stop offset="0" stopColor="#6FA2FF" /><stop offset="1" stopColor="#2F6BEA" /></linearGradient></defs>
                    </svg>
                    <div className="bl-tile">
                        <svg viewBox="0 0 400 400" fill="#fff" aria-hidden="true">
                            <path className="bl-bar" d="M46 159A41 41 0 0 1 128 159V255A41 41 0 0 1 46 255Z" />
                            <path className="bl-bar" d="M159 78A41 41 0 0 1 241 78V255A41 41 0 0 1 159 255Z" />
                            <path className="bl-bar" d="M272 159A41 41 0 0 1 354 159V255A41 41 0 0 1 272 255Z" />
                            <path d="M56 310H344A27 27 0 0 1 344 364H56A27 27 0 0 1 56 310Z" />
                        </svg>
                    </div>
                </div>
                <div className="bl-titles">
                    <h1>Koruna</h1>
                    <p className="bl-status">{STATUS[Math.min(phase, 2)]}</p>
                </div>
                <ol className="bl-steps">
                    {STEPS.map((label, i) => (
                        <li key={label} className={`bl-step ${i < phase ? "done" : i === phase ? "active" : ""}`}>
                            <span className="bl-b" />
                            {label}
                            <span className="bl-t">{stepTimes[i] ? `${stepTimes[i]} s` : ""}</span>
                        </li>
                    ))}
                </ol>
                <div className="bl-progress">
                    <div className="bl-track"><div className="bl-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="bl-meta">
                        <span>{elapsed > 90000 ? "Trvá to déle než obvykle. Zkoušíme to dál…" : "Po delší pauze to může trvat až minutu."}</span>
                        <b>{pct} %</b>
                    </div>
                </div>
            </main>
        </div>
    );
}
