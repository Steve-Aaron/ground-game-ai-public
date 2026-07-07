// Session verification + user-record lookup.
// Reads the Firebase session cookie set by /api/auth/session and resolves it
// to a typed AuthContext for downstream guards.

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { adminAuth, adminDb } from "./firebase-admin";
import { SESSION_COOKIE_NAME } from "./auth-constants";

export { SESSION_COOKIE_NAME };

export type UserRole = "user" | "admin";

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  allowedConstituencies: string[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface AuthContext {
  uid: string;
  email: string;
  role: UserRole;
  allowedConstituencies: string[];
}

/**
 * Verify the Firebase session cookie and resolve to an AuthContext.
 * Returns null if the cookie is missing, invalid, expired, or the user has no
 * Firestore record (which means they were authenticated by Firebase Auth but
 * never invited — treat as unauthenticated).
 *
 * Can be called from:
 *   - API route handlers (pass `request`)
 *   - Server components / pages (omit `request`, reads cookies() from headers)
 */
export async function verifySession(
  request?: NextRequest | Request
): Promise<AuthContext | null> {
  const cookie = readSessionCookie(request);
  if (!cookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const snap = await adminDb().collection("users").doc(decoded.uid).get();
    if (!snap.exists) return null;
    const data = snap.data() as UserRecord;
    return {
      uid: decoded.uid,
      email: data.email,
      role: data.role,
      allowedConstituencies: data.allowedConstituencies ?? [],
    };
  } catch {
    return null;
  }
}

function readSessionCookie(request?: NextRequest | Request): string | undefined {
  if (request) {
    // NextRequest exposes .cookies; standard Request requires header parsing.
    const anyReq = request as NextRequest;
    if (typeof anyReq.cookies?.get === "function") {
      return anyReq.cookies.get(SESSION_COOKIE_NAME)?.value;
    }
    const header = request.headers.get("cookie") ?? "";
    return parseCookieHeader(header)[SESSION_COOKIE_NAME];
  }
  // Server component path.
  return cookies().get(SESSION_COOKIE_NAME)?.value;
}

function parseCookieHeader(header: string): Record<string, string> {
  return header.split(/;\s*/).reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return acc;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) acc[k] = v;
    return acc;
  }, {});
}
