// Demo mode is gated by a cookie (middleware-readable) PLUS a localStorage
// mirror for fast client-side checks without parsing cookies. The two are
// kept in sync by enterDemo / exitDemo. Always call those helpers — don't
// touch the cookie or localStorage directly elsewhere.

const COOKIE_NAME = "demo_mode";
const LS_KEY = "demo_mode";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function enterDemo(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    try {
        localStorage.setItem(LS_KEY, "1");
    } catch {
        // localStorage may be unavailable (private mode, quota) — cookie is the source of truth.
    }
}

export function exitDemo(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
    try {
        localStorage.removeItem(LS_KEY);
    } catch {
        // ignore
    }
}

export function isDemoMode(): boolean {
    if (typeof window === "undefined") return false;
    try {
        if (localStorage.getItem(LS_KEY) === "1") return true;
    } catch {
        // fall through to cookie check
    }
    if (typeof document !== "undefined") {
        return document.cookie
            .split(";")
            .some((c) => c.trim().startsWith(`${COOKIE_NAME}=1`));
    }
    return false;
}
