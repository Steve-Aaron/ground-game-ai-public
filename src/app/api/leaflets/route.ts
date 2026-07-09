import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminBucket, adminDb } from "@/lib/firebase-admin";
import { requireConstituencyAccess } from "@/lib/guards";

export const dynamic = "force-dynamic";

// Campaign material uploads (leaflets, posters, social media screenshots) —
// same idea as electionleaflets.org, scoped per constituency.
//
// Storage: image binary in Firebase Storage under leaflets/<slug>/<id>,
// metadata in the `leaflets` Firestore collection. Images are served via
// short-lived signed URLs generated at list time, so the bucket never needs
// to be public.

const COLLECTION = "leaflets";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const KINDS = ["leaflet", "poster", "social"] as const;
type LeafletKind = (typeof KINDS)[number];

const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

interface LeafletDoc {
  constituencySlug: string;
  kind: LeafletKind;
  party: string;
  notes: string;
  uploadedBy: string;
  storagePath: string;
  contentType: string;
  createdAt: string;
}

export interface LeafletItem extends Omit<LeafletDoc, "storagePath"> {
  id: string;
  imageUrl: string;
}

export async function GET(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  // No orderBy: where + orderBy on different fields needs a Firestore
  // composite index. Sort in code instead — per-constituency volumes are
  // small (capped at 500 fetched, 100 returned).
  const snap = await adminDb()
    .collection(COLLECTION)
    .where("constituencySlug", "==", slug)
    .limit(500)
    .get();
  const docs = snap.docs
    .sort((a, b) =>
      String(b.data().createdAt).localeCompare(String(a.data().createdAt))
    )
    .slice(0, 100);

  const expires = Date.now() + SIGNED_URL_TTL_MS;
  const items: LeafletItem[] = await Promise.all(
    docs.map(async (doc) => {
      const data = doc.data() as LeafletDoc;
      const [imageUrl] = await adminBucket()
        .file(data.storagePath)
        .getSignedUrl({ action: "read", expires });
      return {
        id: doc.id,
        constituencySlug: data.constituencySlug,
        kind: data.kind,
        party: data.party,
        notes: data.notes,
        uploadedBy: data.uploadedBy,
        contentType: data.contentType,
        createdAt: data.createdAt,
        imageUrl,
      };
    })
  );

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { session, slug } = guard;

  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo attached" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Photo too large (max 8MB)" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported file type — use JPEG, PNG, WebP or HEIC" },
      { status: 400 }
    );
  }

  const kindRaw = String(form.get("kind") ?? "leaflet");
  const kind: LeafletKind = (KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as LeafletKind)
    : "leaflet";
  const party = String(form.get("party") ?? "Unknown").slice(0, 60);
  const notes = String(form.get("notes") ?? "").slice(0, 500);

  const id = randomUUID();
  const storagePath = `leaflets/${slug}/${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await adminBucket().file(storagePath).save(buffer, {
    contentType: file.type,
    resumable: false,
    metadata: { cacheControl: "private, max-age=3600" },
  });

  const doc: LeafletDoc = {
    constituencySlug: slug,
    kind,
    party,
    notes,
    uploadedBy: session.email,
    storagePath,
    contentType: file.type,
    createdAt: new Date().toISOString(),
  };
  await adminDb().collection(COLLECTION).doc(id).set(doc);

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
