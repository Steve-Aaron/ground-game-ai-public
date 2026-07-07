// PATCH  /api/admin/users/[uid]  → update role + allowedConstituencies
// DELETE /api/admin/users/[uid]  → revoke access (delete Auth user + Firestore doc)
//
// Admin-only. A safety check prevents an admin from demoting or deleting
// themselves to avoid locking everyone out.

import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/guards";
import type { UserRecord, UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { uid: string };
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const { uid } = params;

  let body: { role?: UserRole; allowedConstituencies?: string[]; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ref = adminDb().collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const existing = snap.data() as UserRecord;

  // Self-demote guard.
  if (uid === guard.uid && body.role && body.role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin role." },
      { status: 400 }
    );
  }

  const updates: Partial<UserRecord> = { updatedAt: new Date().toISOString() };
  if (body.role === "user" || body.role === "admin") updates.role = body.role;
  if (Array.isArray(body.allowedConstituencies)) {
    updates.allowedConstituencies = body.allowedConstituencies.filter(
      (s) => typeof s === "string"
    );
  }
  if (typeof body.displayName === "string") updates.displayName = body.displayName.trim();

  await ref.update(updates);

  if (updates.role && updates.role !== existing.role) {
    await adminAuth().setCustomUserClaims(uid, { role: updates.role });
    // Force the next request to re-fetch a fresh ID token.
    await adminAuth().revokeRefreshTokens(uid);
  }

  const updated = await ref.get();
  return NextResponse.json({ user: { ...(updated.data() as UserRecord), uid } });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const { uid } = params;

  if (uid === guard.uid) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  await adminDb().collection("users").doc(uid).delete();
  try {
    await adminAuth().deleteUser(uid);
  } catch {
    // User may have been deleted from Auth already; Firestore doc is gone.
  }
  return NextResponse.json({ ok: true });
}
