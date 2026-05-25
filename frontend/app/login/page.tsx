"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { enterDemo } from "@/lib/demo-mode";
import "./login.css";

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get("from") || "/";
    const [pending, setPending] = useState<null | "google" | "apple" | "demo">(null);

    const handleOAuth = (provider: "google" | "apple") => {
        setPending(provider);
        // Auth.js handles redirect to provider, then back to /from; reset just
        // in case the popup is closed and we stay on the page.
        signIn(provider, { redirectTo: from }).finally(() => setPending(null));
    };

    const handleDemo = () => {
        setPending("demo");
        enterDemo();
        router.push(from);
    };

    return (
        <div className="login-screen">
            <div className="login-card">
                <h1 className="login-title">Koruna</h1>
                <p className="login-sub">Osobní finance</p>

                <div className="login-actions">
                    <button
                        type="button"
                        className="login-btn login-btn-google"
                        onClick={() => handleOAuth("google")}
                        disabled={pending !== null}
                    >
                        <span className="login-btn-icon" aria-hidden>G</span>
                        {pending === "google" ? "Přihlašuji…" : "Přihlásit přes Google"}
                    </button>

                    <button
                        type="button"
                        className="login-btn login-btn-apple"
                        onClick={() => handleOAuth("apple")}
                        disabled={pending !== null}
                    >
                        <span className="login-btn-icon" aria-hidden></span>
                        {pending === "apple" ? "Přihlašuji…" : "Přihlásit přes Apple"}
                    </button>
                </div>

                <div className="login-divider"><span>nebo</span></div>

                <button
                    type="button"
                    className="login-btn login-btn-demo"
                    onClick={handleDemo}
                    disabled={pending !== null}
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
