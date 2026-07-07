// Edge middleware — runs on every request matching the matcher below.
// Responsibility: lightweight redirects only. Real auth enforcement lives in
// the API route guards (src/lib/guards.ts) and Firestore Security Rules.
//
// The middleware can't verify session cookies (Admin SDK can't run on Edge),
// so it only checks for the cookie's PRESENCE. A forged cookie would still be
// rejected by route handlers when they call verifySession().

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/auth-constants";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page + Next.js internals + auth callbacks.
  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSession = !!request.cookies.get(SESSION_COOKIE_NAME);

  // Unauthenticated request → /login (carry the original destination).
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Auth API endpoints must be reachable pre-session.
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

// Match everything except: static files, Next internals, favicon, image
// optimisation. Pages and API routes ARE matched so the redirect logic above
// works for both.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|images/|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
