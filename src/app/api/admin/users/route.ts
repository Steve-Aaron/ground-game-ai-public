// GET  /api/admin/users  → list all users
// POST /api/admin/users  → invite a user by email
//
// Admin-only. The POST handler creates a Firebase Auth user (if one doesn't
// exist for that email already), writes the Firestore user record, and
// generates a magic sign-in link the admin can forward to the invitee.
// Sending the email is OUT OF SCOPE for this endpoint — wire it to your
// transactional mailer of choice when you have one.

import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/guards";
import type { UserRecord } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const snap = await adminDb().collection("users").orderBy("email").get();
  const users = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserRecord, "uid">) }));
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  let body: {
    email?: string;
    displayName?: string;
    role?: "user" | "admin";
    allowedConstituencies?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim() || email || "";
  const role = body.role === "admin" ? "admin" : "user";
  // Default new users to Braintree if the admin didn't pick any constituencies.
  // Admin can edit afterwards to grant more.
  const submittedConstituencies = Array.isArray(body.allowedConstituencies)
    ? body.allowedConstituencies.filter((s) => typeof s === "string")
    : [];
  const allowedConstituencies =
    submittedConstituencies.length > 0 ? submittedConstituencies : ["braintree"];

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Create the Firebase Auth user (or fetch the existing one if email already
  // exists in Auth but not in our users collection).
  let authUser;
  try {
    authUser = await adminAuth().getUserByEmail(email);
  } catch {
    authUser = await adminAuth().createUser({ email, displayName });
  }

  // Mirror role into custom claims so middleware/JWT checks can RBAC fast.
  await adminAuth().setCustomUserClaims(authUser.uid, { role });

  const now = new Date().toISOString();
  const record: UserRecord = {
    uid: authUser.uid,
    email,
    displayName,
    role,
    allowedConstituencies,
    createdAt: now,
    updatedAt: now,
    createdBy: guard.uid,
  };
  await adminDb().collection("users").doc(authUser.uid).set(record);

  // Generate a magic sign-in link the admin can hand to the invitee. The link
  // lands on /login which auto-completes the sign-in flow.
  const origin = new URL(request.url).origin;
  const inviteLink = await adminAuth().generateSignInWithEmailLink(email, {
    url: `${origin}/login`,
    handleCodeInApp: true,
  });

  return NextResponse.json({ user: record, inviteLink });
}
