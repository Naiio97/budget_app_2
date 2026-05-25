// Auth.js v5 configuration.
//
// Identity provider: Google + Apple OIDC (handled by Auth.js client-side).
// Backend integration: on first sign-in we POST to /auth/oauth-upsert to mint
// a backend JWT and stash it on the session as `backendToken`. The API client
// reads that and sends it as Authorization: Bearer on every backend call.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";

const BACKEND_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:8000";

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        // allowDangerousEmailAccountLinking lets the backend adopt the same
        // user across providers when emails match — explicit because Auth.js
        // refuses by default to prevent account takeover via spoofed emails.
        // We only enable it on Google + Apple where the provider verifies
        // the email itself.
        Google({ allowDangerousEmailAccountLinking: true }),
        Apple({ allowDangerousEmailAccountLinking: true }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 60 * 60 * 24, // 24h, matches backend AUTH_JWT_TTL_HOURS default
    },
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async jwt({ token, account, profile }) {
            // `account` is only populated on the initial sign-in callback —
            // this is the one shot we get to exchange OAuth identity for our
            // own backend JWT.
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
                        // Don't fail the sign-in — surface as a missing
                        // backendToken so the API client can redirect on 401.
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
