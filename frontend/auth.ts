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
                if (!credentials?.email || !credentials?.password) return null;
                const res = await fetch(`${BACKEND_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: credentials.email,
                        password: credentials.password,
                    }),
                });
                if (!res.ok) return null;
                const data = await res.json();
                // Stash backendToken on the user — picked up by jwt callback below.
                return {
                    id: String(data.user.id),
                    email: data.user.email,
                    name: data.user.name,
                    image: data.user.image_url,
                    backendToken: data.access_token,
                } as unknown as { id: string; email: string };
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
    callbacks: {
        async jwt({ token, account, profile, user }) {
            // Credentials flow: authorize() already minted backendToken on the user.
            if (account?.provider === "credentials" && user) {
                const maybeToken = (user as { backendToken?: string }).backendToken;
                if (maybeToken) token.backendToken = maybeToken;
                return token;
            }
            // OAuth flow: exchange the provider identity for our backend JWT.
            // `account` is only populated on the initial sign-in callback.
            if (account && profile) {
                try {
                    const res = await fetch(`${BACKEND_URL}/auth/oauth-upsert`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            provider: account.provider,
                            provider_id: account.providerAccountId,
                            email: profile.email,
                            name: profile.name ?? null,
                            image_url:
                                (profile as { picture?: string; image?: string }).picture ??
                                (profile as { picture?: string; image?: string }).image ??
                                null,
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
            if (token.backendToken) {
                (session as { backendToken?: string }).backendToken = token.backendToken as string;
            }
            return session;
        },
    },
});
