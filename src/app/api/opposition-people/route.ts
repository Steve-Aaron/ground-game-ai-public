import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { requireConstituencyAccess } from "@/lib/guards";

export const dynamic = "force-dynamic";

// Opposition people per constituency — the watch-list driving the
// Opposition Tracker. Starts blank; ADMINS define up to 5 people per
// constituency from the frontend. All constituency users may read.

const COLLECTION = "opposition_people";
const MAX_PEOPLE = 5;

export interface OppositionPerson {
  id: string;
  name: string;
  party: string;
  /** X handle without @ — optional; enables social monitoring. */
  handle: string;
  /** Free-text context, e.g. 'PPC', 'Cllr — Tendring DC'. */
  role: string;
  addedBy: string;
  addedAt: string;
}

interface PeopleDoc {
  people: OppositionPerson[];
}

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

export async function GET(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  const snap = await adminDb().collection(COLLECTION).doc(slug).get();
  const doc = (snap.data() as PeopleDoc | undefined) ?? { people: [] };
  return NextResponse.json({ people: doc.people, max: MAX_PEOPLE });
}

export async function POST(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { session, slug } = guard;
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can manage opposition people" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    party?: string;
    handle?: string;
    role?: string;
  } | null;

  const name = (body?.name ?? "").trim().slice(0, 80);
  const party = (body?.party ?? "").trim().slice(0, 60);
  const role = (body?.role ?? "").trim().slice(0, 80);
  const handleRaw = (body?.handle ?? "").trim().replace(/^@/, "");
  if (!name || !party) {
    return NextResponse.json({ error: "Name and party are required" }, { status: 400 });
  }
  if (handleRaw && !HANDLE_PATTERN.test(handleRaw)) {
    return NextResponse.json({ error: "Invalid X handle" }, { status: 400 });
  }

  const ref = adminDb().collection(COLLECTION).doc(slug);
  const snap = await ref.get();
  const doc = (snap.data() as PeopleDoc | undefined) ?? { people: [] };

  if (doc.people.length >= MAX_PEOPLE) {
    return NextResponse.json(
      { error: `Limit of ${MAX_PEOPLE} people per constituency — remove one first` },
      { status: 409 }
    );
  }
  if (doc.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "Already listed" }, { status: 409 });
  }

  doc.people.push({
    id: randomUUID(),
    name,
    party,
    handle: handleRaw,
    role,
    addedBy: session.email,
    addedAt: new Date().toISOString(),
  });
  await ref.set(doc);
  return NextResponse.json({ people: doc.people, max: MAX_PEOPLE }, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { session, slug } = guard;
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can manage opposition people" },
      { status: 403 }
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const ref = adminDb().collection(COLLECTION).doc(slug);
  const snap = await ref.get();
  const doc = (snap.data() as PeopleDoc | undefined) ?? { people: [] };
  doc.people = doc.people.filter((p) => p.id !== id);
  await ref.set(doc);
  return NextResponse.json({ people: doc.people, max: MAX_PEOPLE });
}
