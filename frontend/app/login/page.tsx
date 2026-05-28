"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { enterDemo } from "@/lib/demo-mode";
import { clearBackendTokenCache } from "@/lib/api";
import "./login.css";

type Mode = "login" | "register";
type Pending = null | "google" | "demo" | "credentials";

const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// `from` is read on-demand from window.location at click time, not via
// useSearchParams or useState — that hook forces a Suspense boundary and
// caused hydration mismatches between server-rendered HTML and the client
// re-render. The value is only consumed in click handlers, so reading it
// lazily skips React state, the prerender bailout, and the "setState in
// effect" lint rule all at once.
function sanitizeFrom(raw: string | null): string {
    if (
        raw &&
        raw.startsWith("/") &&
        !raw.startsWith("//") &&
        !raw.startsWith("/login")
    ) {
        return raw;
    }
    return "/";
}

function readFromParam(): string {
    if (typeof window === "undefined") return "/";
    const params = new URLSearchParams(window.location.search);
    return sanitizeFrom(params.get("from"));
}

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<Mode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending>(null);

    const handleGoogle = () => {
        setPending("google");
        setError(null);
        signIn("google", { redirectTo: readFromParam() }).finally(() => setPending(null));
    };

    const handleDemo = () => {
        setPending("demo");
        setError(null);
        enterDemo();
        router.push(readFromParam());
    };

    const handleCredentials = async (e: FormEvent) => {
        e.preventDefault();
        if (pending) return;
        setError(null);
        setPending("credentials");

        try {
            if (mode === "register") {
                // Register first (creates the account), then fall through to
                // signIn so Auth.js mints a session cookie. signIn with the same
                // credentials hits /auth/login, which now finds the just-created
                // account and returns a JWT.
                const res = await fetch(`${API_BASE}/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password, name: name || null }),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setError(data.detail || `Registrace selhala (${res.status})`);
                    setPending(null);
                    return;
                }
            }

            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });
            if (result?.error) {
                setError(
                    mode === "register"
                        ? "Účet vytvořen, ale přihlášení selhalo. Zkus se přihlásit ručně."
                        : "Špatný email nebo heslo."
                );
                setPending(null);
                return;
            }
            // Force the next /api/auth/session read to include our brand-new
            // backendToken — without this the cached null sticks for 10s and
            // every API call in that window comes back 401.
            clearBackendTokenCache();
            router.push(readFromParam());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Něco se pokazilo.");
            setPending(null);
        }
    };

    const isPending = pending !== null;

    return (
        <div className="login-screen">
            <div className="login-card">
                <h1 className="login-title">Koruna</h1>
                <p className="login-sub">Osobní finance</p>

                <div className="login-mode-switch">
                    <button
                        type="button"
                        className={mode === "login" ? "active" : ""}
                        onClick={() => { setMode("login"); setError(null); }}
                        disabled={isPending}
                    >
                        Přihlášení
                    </button>
                    <button
                        type="button"
                        className={mode === "register" ? "active" : ""}
                        onClick={() => { setMode("register"); setError(null); }}
                        disabled={isPending}
                    >
                        Registrace
                    </button>
                </div>

                <form className="login-form" onSubmit={handleCredentials}>
                    {mode === "register" && (
                        <input
                            type="text"
                            className="login-input"
                            placeholder="Jméno (volitelné)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            disabled={isPending}
                        />
                    )}
                    <input
                        type="email"
                        className="login-input"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        disabled={isPending}
                    />
                    <input
                        type="password"
                        className="login-input"
                        placeholder={mode === "register" ? "Heslo (min. 8 znaků)" : "Heslo"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={mode === "register" ? 8 : 1}
                        autoComplete={mode === "register" ? "new-password" : "current-password"}
                        disabled={isPending}
                    />

                    {error && <div className="login-error">{error}</div>}

                    <button
                        type="submit"
                        className="login-btn login-btn-primary"
                        disabled={isPending}
                    >
                        {pending === "credentials"
                            ? (mode === "register" ? "Vytvářím účet…" : "Přihlašuji…")
                            : (mode === "register" ? "Vytvořit účet" : "Přihlásit se")
                        }
                    </button>
                </form>

                <div className="login-divider"><span>nebo</span></div>

                <button
                    type="button"
                    className="login-btn login-btn-google"
                    onClick={handleGoogle}
                    disabled={isPending}
                >
                    <span className="login-btn-icon" aria-hidden>G</span>
                    {pending === "google" ? "Přihlašuji…" : "Pokračovat přes Google"}
                </button>

                <button
                    type="button"
                    className="login-btn login-btn-demo"
                    onClick={handleDemo}
                    disabled={isPending}
                >
                    {pending === "demo" ? "Načítám demo…" : "Vyzkoušet demo"}
                </button>

                <p className="login-foot">
                    Demo používá ukázková data uložená pouze v prohlížeči.
                </p>
            </div>
        </div>
    );
}
