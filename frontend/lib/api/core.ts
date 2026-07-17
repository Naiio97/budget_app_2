// Backend API client.
//
// One `apiFetch` helper is the single chokepoint for ALL backend traffic — it
// attaches the JWT from the Auth.js session, redirects to /login on 401, and
// (when demo mode is on) synthesizes a Response from mock-data.ts instead of
// touching the network. Every page hits the backend through apiFetch, so just
// flipping the demo cookie is enough to swap the whole app to canned data.

import { getSession } from "next-auth/react";
import { isDemoMode } from "../demo-mode";
import { dispatchDemoGet } from "../mock-data";

const API_BASE =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://budget-api.redfield-d4fd3af1.westeurope.azurecontainerapps.io";

// 10s cache so we don't hit getSession() on every request — it goes through
// Next.js's /api/auth/session endpoint which has its own server round-trip.
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_CACHE_MS = 10_000;

async function getBackendToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) return cachedToken;
    try {
        const session = await getSession();
        cachedToken = session?.backendToken ?? null;
    } catch {
        cachedToken = null;
    }
    tokenExpiresAt = now + TOKEN_CACHE_MS;
    return cachedToken;
}

export function clearBackendTokenCache(): void {
    cachedToken = null;
    tokenExpiresAt = 0;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body ?? {}), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function synthesizeDemoResponse(path: string, init: RequestInit): Response {
    const method = (init.method || "GET").toUpperCase();
    if (method === "GET") {
        const body = dispatchDemoGet(path);
        if (body === undefined) {
            console.warn("[DEMO] no fixture for GET", path, "— returning {}");
            return jsonResponse({});
        }
        return jsonResponse(body);
    }
    // Mutations: always synthesize a 200 OK with a permissive body so the UI
    // never gets stuck on an error. Nothing is persisted — that's the contract.
    return jsonResponse({ status: "ok", id: 1, deleted: 1 });
}

/** Single chokepoint for backend traffic. In demo mode, synthesizes a Response
 * from mock-data.ts instead of going to the network. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    if (isDemoMode()) {
        // Tiny artificial delay so loading states still get to render.
        await new Promise((r) => setTimeout(r, 60));
        return synthesizeDemoResponse(path, init);
    }
    const headers = new Headers(init.headers);
    // FormData must NOT get an explicit Content-Type — the browser sets
    // multipart/form-data with its own boundary.
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const token = await getBackendToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        cache: init.cache ?? "no-store",
    });
    if (res.status === 401 && typeof window !== "undefined") {
        // Skip the redirect when we're already on /login — global providers
        // (AccountsProvider's getDashboard query) keep firing here while the
        // user is signed out, and bouncing /login → /login?from=<encoded URL>
        // recursively nests the URL until the address bar explodes.
        // Use just pathname (no search) so we never encode the previous from.
        const { pathname } = window.location;
        if (!pathname.startsWith("/login")) {
            window.location.href = `/login?from=${encodeURIComponent(pathname)}`;
        }
    }
    return res;
}

export async function fetchApi<T>(endpoint: string): Promise<T> {
    const response = await apiFetch(endpoint);

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    return response.json();
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    size: number;
    pages: number;
}
