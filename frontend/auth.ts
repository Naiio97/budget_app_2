// Auth.js v5 configuration.
//
// Identity providers:
//   - Google OIDC (handled by Auth.js client-side)
//   - Email + password (Credentials provider; calls backend /auth/login)
//   - Apple OIDC: temporarily disabled — Apple Developer account ($99/yr)
//     plus JWT-signed client secret needed before this is wired up again.
//
// Backend integration: on first OAuth sign-in we POST to /auth/oauth-upsert
// to mint a backend JWT and stash it on the session as `backendToken`. The
// Credentials provider takes a different path — its `authorize` callback
// calls /auth/login directly and returns the backend JWT on the user object,
// which the jwt callback then promotes onto the session token.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
// import Apple from "next-auth/providers/apple";

// Module augmentation — Auth.js v5 strips custom fields off User/JWT/Session
// unless they're declared here. Without this, `backendToken` returned from
// authorize() silently never reaches the jwt callback.
declare module "next-auth" {
    interface Session {
        backendToken?: string;
    }
    interface User {
        backendToken?: string;
    }
    interface JWT {
        backendToken?: string;
        backendUser?: unknown;
    }
}

const BACKEND_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:8000";

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        // allowDangerousEmailAccountLinking lets the backend adopt the same
        // user across providers when emails match — explicit because Auth.js
        // refuses by default to prevent account takeover via spoofed emails.
        // Safe here because Google verifies the email itself.
        Google({ allowDangerousEmailAccountLinking: true }),
        // Apple({ allowDangerousEmailAccountLinking: true }),
        Credentials({
            name: "Email a heslo",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Heslo", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    console.error("[auth] credentials missing email or password");
                    return null;
                }
                try {
                    const res = await fetch(`${BACKEND_URL}/auth/login`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: credentials.email,
                            password: credentials.password,
                        }),
                    });
                    if (!res.ok) {
                        // Surface the real reason in the Next dev console so a
                        // CredentialsSignin error in the browser isn't a black box
                        // (most common: 429 rate limit, 401 wrong password).
                        const body = await res.text().catch(() => "");
                        console.error(`[auth] POST /auth/login -> ${res.status}: ${body}`);
                        return null;
                    }
                    const data = await res.json();
                    return {
                        id: String(data.user.id),
                        email: data.user.email,
                        name: data.user.name,
                        image: data.user.image_url,
                        backendToken: data.access_token,
                    };
                } catch (err) {
                    console.error("[auth] POST /auth/login threw:", err);
                    return null;
                }
            },
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 60 * 60 * 24, // 24h, matches backend AUTH_JWT_TTL_HOURS default
    },
    pages: {
        signIn: "/login",
    },
    // Trust the Host header on incoming requests. Azure Container Apps puts us
    // behind their reverse proxy, which terminates TLS and sets X-Forwarded-Host
    // to the public domain — without trustHost (or an AUTH_URL env), Auth.js
    // refuses to mint cookies for that host and every /api/auth/* call errors
    // with UntrustedHost. The container itself only accepts traffic from the
    // proxy, so trusting the header here is safe.
    trustHost: true,
    callbacks: {
        async jwt({ token, account, user }) {
            // Credentials flow: authorize() stashed the backend JWT on `user`.
            // Both providers reach this branch via `user` on initial sign-in.
            if (user?.backendToken) {
                token.backendToken = user.backendToken;
            }

            // OAuth flow: we don't get a backend JWT from the provider — exchange
            // the OIDC identity at /auth/oauth-upsert. `account` is only set on
            // the initial sign-in callback. We forward the provider's signed
            // id_token (NOT the decoded profile claims) — the backend re-verifies
            // it against the provider JWKS and derives identity from there, so a
            // forged request body can't mint a token for someone else's account.
            if (account && !token.backendToken) {
                if (!account.id_token) {
                    console.error("[auth] OAuth account has no id_token — cannot exchange for backend JWT");
                    return token;
                }
                try {
                    const res = await fetch(`${BACKEND_URL}/auth/oauth-upsert`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            provider: account.provider,
                            id_token: account.id_token,
                        }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        token.backendToken = data.access_token;
                        token.backendUser = data.user;
                    } else {
                        console.error(
                            "[auth] backend oauth-upsert failed:",
                            res.status,
                            await res.text().catch(() => "")
                        );
                    }
                } catch (err) {
                    console.error("[auth] backend oauth-upsert error:", err);
                }
            }
            return token;
        },
        async session({ session, token }) {
            const backendToken = (token as { backendToken?: string }).backendToken;
            if (backendToken) {
                session.backendToken = backendToken;
            }
            return session;
        },
    },
});
