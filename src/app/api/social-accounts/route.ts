import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireConstituencyAccess } from "@/lib/guards";

export const dynamic = "force-dynamic";

// Tracked social accounts per constituency (X/Twitter handles, max 5).
// Any user with access to the constituency may manage its list — same
// permission model as campaign-material uploads.

const COLLECTION = "social_tracking";
const MAX_TRACKED_ACCOUNTS = 5;

export interface TrackedAccount {
  handle: string;
  addedBy: string;
  addedAt: string;
}

interface TrackingDoc {
  accounts: TrackedAccount[];
}

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

function normaliseHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "");
  return HANDLE_PATTERN.test(handle) ? handle : null;
}

export async function GET(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  const snap = await adminDb().collection(COLLECTION).doc(slug).get();
  const doc = (snap.data() as TrackingDoc | undefined) ?? { accounts: [] };
  return NextResponse.json({ accounts: doc.accounts, max: MAX_TRACKED_ACCOUNTS });
}

export async function POST(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { session, slug } = guard;

  const body = (await request.json().catch(() => null)) as { handle?: string } | null;
  const handle = normaliseHandle(body?.handle ?? "");
  if (!handle) {
    return NextResponse.json(
      { error: "Invalid handle — use the X username, e.g. @Nigel_Farage" },
      { status: 400 }
    );
  }

  const ref = adminDb().collection(COLLECTION).doc(slug);
  const snap = await ref.get();
  const doc = (snap.data() as TrackingDoc | undefined) ?? { accounts: [] };

  if (doc.accounts.some((a) => a.handle.toLowerCase() === handle.toLowerCase())) {
    return NextResponse.json({ error: "Already tracked" }, { status: 409 });
  }
  if (doc.accounts.length >= MAX_TRACKED_ACCOUNTS) {
    return NextResponse.json(
      { error: `Limit of ${MAX_TRACKED_ACCOUNTS} accounts per constituency — remove one first` },
      { status: 409 }
    );
  }

  doc.accounts.push({ handle, addedBy: session.email, addedAt: new Date().toISOString() });
  await ref.set(doc);
  return NextResponse.json({ accounts: doc.accounts, max: MAX_TRACKED_ACCOUNTS }, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  const { searchParams } = new URL(request.url);
  const handle = normaliseHandle(searchParams.get("handle") ?? "");
  if (!handle) {
    return NextResponse.json({ error: "Invalid handle" }, { status: 400 });
  }

  const ref = adminDb().collection(COLLECTION).doc(slug);
  const snap = await ref.get();
  const doc = (snap.data() as TrackingDoc | undefined) ?? { accounts: [] };
  doc.accounts = doc.accounts.filter((a) => a.handle.toLowerCase() !== handle.toLowerCase());
  await ref.set(doc);
  return NextResponse.json({ accounts: doc.accounts, max: MAX_TRACKED_ACCOUNTS });
}
