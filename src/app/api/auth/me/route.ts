// GET /api/auth/me
// Returns the current user's AuthContext (uid, email, role,
// allowedConstituencies) or 401 if not signed in. The client uses this to
// hydrate UI state and to filter the constituency picker.

import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(session);
}
