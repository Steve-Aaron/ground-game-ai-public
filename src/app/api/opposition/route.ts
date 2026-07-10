import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireConstituencyAccess } from "@/lib/guards";
import { partyColor } from "@/lib/palette";

export const dynamic = "force-dynamic";

// Opposition Tracker people feed. Returns the admin-managed watch-list
// (people + party colours) only — their posts come from /api/social-feed,
// which owns the Apify calls, cache and budget. Keeping a single posts
// pipeline means one Apify spend per constituency, not two.

const PEOPLE_COLLECTION = "opposition_people";

interface OppositionPerson {
  id: string;
  name: string;
  party: string;
  handle: string;
  role: string;
}

export interface Opponent {
  party: string;
  candidate: string;
  handle: string;
  role: string;
  color: string;
}

export async function GET(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  try {
    const snap = await adminDb().collection(PEOPLE_COLLECTION).doc(slug).get();
    const people =
      ((snap.data() as { people?: OppositionPerson[] } | undefined)?.people ?? []);

    const opponents: Opponent[] = people.map((p) => ({
      party: p.party,
      candidate: p.name,
      handle: p.handle,
      role: p.role,
      color: partyColor(p.party),
    }));

    return NextResponse.json({
      opponents,
      configured: opponents.length > 0,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Opposition tracker failed:", err);
    return NextResponse.json(
      { error: `Opposition tracker failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
