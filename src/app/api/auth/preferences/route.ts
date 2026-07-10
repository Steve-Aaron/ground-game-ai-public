import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser } from "@/lib/guards";

export const dynamic = "force-dynamic";

// POST { theme: "light" | "dark" } — persists the signed-in user's UI theme
// preference on their user record so it follows them across devices.
export async function POST(request: Request) {
  const guard = await requireUser(request);
  if (guard instanceof NextResponse) return guard;

  const body = (await request.json().catch(() => null)) as { theme?: string } | null;
  if (body?.theme !== "light" && body?.theme !== "dark") {
    return NextResponse.json({ error: "theme must be 'light' or 'dark'" }, { status: 400 });
  }

  await adminDb().collection("users").doc(guard.uid).set(
    { themePreference: body.theme, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return NextResponse.json({ ok: true });
}
