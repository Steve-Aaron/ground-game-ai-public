import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminBucket, adminDb } from "@/lib/firebase-admin";
import { requireConstituencyAccess } from "@/lib/guards";
import { saveImage, signedImageUrl, validateImage } from "@/lib/image-upload";
import { SESSION_TYPES, type SessionType } from "@/lib/canvassing-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Canvassing sessions — activity happening on the ground, pinned to a map.
// Any user with constituency access can add sessions; the creator or an
// admin can delete. Session records live in Firestore, photos (up to 4) in
// Firebase Storage, served via signed URLs.

const COLLECTION = "canvassing_sessions";
const MAX_IMAGES = 4;

interface SessionDoc {
  constituencySlug: string;
  /** Session date, YYYY-MM-DD. */
  date: string;
  name: string;
  lat: number;
  lng: number;
  /** Duration in minutes. */
  durationMins: number;
  type: SessionType;
  notes: string;
  storagePaths: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface CanvassingSession extends Omit<SessionDoc, "storagePaths"> {
  id: string;
  imageUrls: string[];
}

export async function GET(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  try {
    const snap = await adminDb()
      .collection(COLLECTION)
      .where("constituencySlug", "==", slug)
      .limit(500)
      .get();

    const docs = snap.docs
      .sort((a, b) => String(b.data().date).localeCompare(String(a.data().date)))
      .slice(0, 200);

    const sessions: CanvassingSession[] = await Promise.all(
      docs.map(async (doc) => {
        const data = doc.data() as SessionDoc;
        const imageUrls = await Promise.all(
          (data.storagePaths ?? []).map(signedImageUrl)
        );
        const { storagePaths: _paths, ...rest } = { ...data };
        void _paths;
        return { id: doc.id, ...rest, imageUrls };
      })
    );

    return NextResponse.json({ sessions, types: SESSION_TYPES });
  } catch (err) {
    console.error("Canvassing list failed:", err);
    return NextResponse.json(
      { error: `Listing failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { session, slug } = guard;

  try {
    const form = await request.formData();

    const name = String(form.get("name") ?? "").trim().slice(0, 100);
    const date = String(form.get("date") ?? "");
    const lat = Number(form.get("lat"));
    const lng = Number(form.get("lng"));
    const durationMins = Math.round(Number(form.get("durationMins")));
    const typeRaw = String(form.get("type") ?? "other");
    const notes = String(form.get("notes") ?? "").slice(0, 1000);

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return NextResponse.json({ error: "Valid date is required" }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: "Drop a pin on the map to set the location" }, { status: 400 });
    }
    if (!Number.isFinite(durationMins) || durationMins <= 0 || durationMins > 24 * 60) {
      return NextResponse.json({ error: "Valid duration is required" }, { status: 400 });
    }
    const type: SessionType = (SESSION_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as SessionType)
      : "other";

    const photos = form.getAll("photos").filter((f): f is File => f instanceof File);
    if (photos.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Up to ${MAX_IMAGES} images allowed` }, { status: 400 });
    }
    const validated: Array<{ file: File; ext: string }> = [];
    for (const photo of photos) {
      const result = validateImage(photo);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
      validated.push({ file: photo, ext: result.ext });
    }

    const id = randomUUID();
    const storagePaths = await Promise.all(
      validated.map(({ file, ext }) => saveImage(file, `canvassing/${slug}/${id}`, ext))
    );

    const doc: SessionDoc = {
      constituencySlug: slug,
      date,
      name,
      lat,
      lng,
      durationMins,
      type,
      notes,
      storagePaths,
      createdBy: session.email,
      createdByName: session.displayName,
      createdAt: new Date().toISOString(),
    };
    await adminDb().collection(COLLECTION).doc(id).set(doc);

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    console.error("Canvassing create failed:", err);
    return NextResponse.json(
      { error: `Create failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const ref = adminDb().collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const doc = snap.data() as SessionDoc;

    if (doc.createdBy !== session.email && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await Promise.all(
      (doc.storagePaths ?? []).map((path) =>
        adminBucket().file(path).delete({ ignoreNotFound: true })
      )
    );
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Canvassing delete failed:", err);
    return NextResponse.json(
      { error: `Delete failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
