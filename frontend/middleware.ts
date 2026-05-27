// Edge middleware — gates every page route behind Auth.js OR a demo_mode cookie.
//
// Demo mode lives in a cookie (not localStorage) so middleware can read it on
// the server. The login page's "Try demo" button sets demo_mode=1; logout +
// "Exit demo" both clear it.
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

export default auth((req) => {
    const { pathname } = req.nextUrl;

    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    if (req.cookies.get("demo_mode")?.value === "1") {
        return NextResponse.next();
    }

    if (!req.auth) {
        const loginUrl = new URL("/login", req.url);
        // Only carry `from` for real destinations — never let a /login URL
        // become the redirect target, otherwise we recursively nest the URL
        // every time middleware fires and from= ends up tens-of-levels deep.
        if (!pathname.startsWith("/login")) {
            loginUrl.searchParams.set("from", pathname);
        }
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
});

export const config = {
    // Skip Next internals + static assets so they don't hit the auth check.
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.png|.*\\.svg|.*\\.ico).*)",
    ],
};
