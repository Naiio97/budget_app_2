"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { enterDemo } from "@/lib/demo-mode";
import { clearBackendTokenCache } from "@/lib/api";
import "./login.css";

type Mode = "login" | "register";
type Pending = null | "google" | "demo" | "credentials";

// Official Google "G" logo (4-color), per Google's branding guidelines.
// Must not be recolored, cropped, or boxed — used as-is on the white button.
function GoogleLogo() {
    return (
        <svg className="login-btn-google-logo" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
        </svg>
    );
}

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

// The ?timeout= reason is static for the page's lifetime, so the store never
// emits updates — subscribe is a no-op.
const noopSubscribe = () => () => {};

function getTimeoutNotice(): string | null {
    const reason = new URLSearchParams(window.location.search).get("timeout");
    if (reason === "idle") return "Byl jsi odhlášen z důvodu nečinnosti.";
    if (reason === "cap") return "Relace vypršela, přihlas se prosím znovu.";
    return null;
}

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<Mode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending>(null);

    // Explains an auto-logout (from the ?timeout= param). useSyncExternalStore
    // reads the browser URL safely across SSR — server snapshot is null, so
    // there's no hydration mismatch and no setState-in-effect.
    const notice = useSyncExternalStore(noopSubscribe, getTimeoutNotice, () => null);

    useEffect(() => {
        // Reset the idle/session clock so the next sign-in gets a fresh hour.
        localStorage.removeItem("idle_last_activity");
        localStorage.removeItem("idle_session_start");
    }, []);

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

                {notice && <div className="login-notice">{notice}</div>}

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
                    <GoogleLogo />
                    <span className="login-btn-google-text">
                        {pending === "google" ? "Přihlašuji…" : "Pokračovat přes Google"}
                    </span>
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
