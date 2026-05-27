"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { enterDemo } from "@/lib/demo-mode";
import "./login.css";

type Mode = "login" | "register";
type Pending = null | "google" | "demo" | "credentials";

const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    // Sanitize `from` so we never bounce back to /login (would cause an
    // infinite redirect chain with each level appending another encoded URL).
    // Also reject absolute URLs — open-redirect protection.
    const rawFrom = searchParams.get("from");
    const from =
        rawFrom &&
        rawFrom.startsWith("/") &&
        !rawFrom.startsWith("//") &&
        !rawFrom.startsWith("/login")
            ? rawFrom
            : "/";

    const [mode, setMode] = useState<Mode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending>(null);

    const handleGoogle = () => {
        setPending("google");
        setError(null);
        signIn("google", { redirectTo: from }).finally(() => setPending(null));
    };

    const handleDemo = () => {
        setPending("demo");
        setError(null);
        enterDemo();
        router.push(from);
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
            router.push(from);
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
