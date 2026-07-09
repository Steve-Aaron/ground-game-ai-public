// Route-handler guards. Drop these at the top of every API handler that
// needs auth. They return a NextResponse on failure, or an AuthContext on
// success. Pattern:
//
//   export async function GET(req: NextRequest) {
//     const guard = await requireConstituencyAccess(req);
//     if (guard instanceof Response) return guard;
//     const { session, slug } = guard;
//     // ...
//   }

import { NextResponse, type NextRequest } from "next/server";
import { verifySession, type AuthContext } from "./auth";

/** Require an authenticated user. Returns Response on failure. */
export async function requireUser(
  request: NextRequest | Request
): Promise<AuthContext | NextResponse> {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

/** Require an authenticated admin. Returns Response on failure. */
export async function requireAdmin(
  request: NextRequest | Request
): Promise<AuthContext | NextResponse> {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

/**
 * Require an authenticated user AND verify they have access to the
 * constituency in the query string (`?constituency=<slug>`). A missing slug
 * is a 400 — routes must never silently fall back to a default constituency.
 * Returns the resolved slug alongside the session so the route doesn't have
 * to re-parse it.
 *
 * Admins are ALSO scoped per the access model decision — they must have the
 * slug in their allowedConstituencies just like users.
 */
export async function requireConstituencyAccess(
  request: NextRequest | Request
): Promise<{ session: AuthContext; slug: string } | NextResponse> {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const slug = url.searchParams.get("constituency");
  if (!slug) {
    return NextResponse.json(
      { error: "Missing constituency parameter" },
      { status: 400 }
    );
  }
  if (!session.allowedConstituencies.includes(slug)) {
    return NextResponse.json(
      { error: "Forbidden", constituency: slug },
      { status: 403 }
    );
  }
  return { session, slug };
}
