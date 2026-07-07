// POST /api/auth/session
// Exchange a Firebase Auth ID token (obtained client-side after Google sign-in
// or magic link completion) for an httpOnly session cookie. The cookie is
// what every subsequent server request authenticates against.

import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Session cookie lifetime. Firebase max is 14 days.
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  let idToken: string | undefined;
  try {
    const body = await request.json();
    idToken = body?.idToken;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Verify the user has a Firestore record (i.e. was invited by an admin).
  // Without this check, anyone with a Google account could mint a session
  // cookie. The user record is the invite gate.
  const userDoc = await adminDb().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    return NextResponse.json(
      {
        error: "Not invited",
        message:
          "Your account is not yet provisioned. Contact your administrator.",
      },
      { status: 403 }
    );
  }

  const sessionCookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_TTL_MS,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionCookie,
    maxAge: SESSION_TTL_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}
