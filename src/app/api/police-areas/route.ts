import { NextResponse, type NextRequest } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getFullData } from "@/data";
import { requireConstituencyAccess } from "@/lib/guards";
import {
  decodeForceBundle,
  decodePoliceAreas,
  encodeForceBundle,
  encodePoliceAreas,
  getConstituencyFeature,
  resolvePoliceAreas,
  type ForceBundleDocStored,
  type PoliceAreasResponse,
  type PoliceAreasResponseStored,
  type PoliceCache,
} from "@/lib/police-areas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 90 days — police boundaries change at most quarterly.
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const FORCE_BUNDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

interface ForceBundleCacheEnvelope {
  data: ForceBundleDocStored;
  updated_at: string;
}

// Client-Firestore implementation of the PoliceCache contract used by
// resolvePoliceAreas(). The seed script swaps in a firebase-admin-backed
// version; the algorithm itself is shared in src/lib/police-areas.ts.
//
// Note: Firestore disallows directly nested arrays, so polygon rings stored
// as `number[][]` are encoded to flat `number[]` on write and re-hydrated on
// read. See encode/decode helpers in src/lib/police-areas.ts.
const firestoreCache: PoliceCache = {
  async readForceBundle(forceId) {
    try {
      const ref = doc(db, "police_force_bundles", forceId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const env = snap.data() as ForceBundleCacheEnvelope;
      const ageMs = Date.now() - new Date(env.updated_at).getTime();
      if (ageMs > FORCE_BUNDLE_TTL_MS) return null;
      return decodeForceBundle(env.data);
    } catch (err) {
      console.warn(`police_force_bundles read failed for ${forceId}:`, err);
      return null;
    }
  },
  async writeForceBundle(bundle) {
    try {
      const ref = doc(db, "police_force_bundles", bundle.forceId);
      await setDoc(ref, {
        data: encodeForceBundle(bundle),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`police_force_bundles write failed for ${bundle.forceId}:`, err);
    }
  },
};

async function refreshInBackground(slug: string, onsCode: string) {
  try {
    const fresh = await resolvePoliceAreas(onsCode, firestoreCache);
    if (!fresh) return;
    const ref = doc(db, "police_areas_cache", slug);
    const encoded = encodePoliceAreas(fresh);
    const existing = await getDoc(ref);
    const existingData = existing.exists() ? existing.data().data : null;
    if (existingData && JSON.stringify(existingData) === JSON.stringify(encoded)) return;
    await setDoc(ref, { data: encoded, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error("Background police-areas refresh failed:", err);
  }
}

export async function GET(request: NextRequest) {
  // __AUTH_GUARD__
  const __guard = await requireConstituencyAccess(request);
  if (__guard instanceof NextResponse) return __guard;

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(slug);
  if (!constituencyData) {
    return NextResponse.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const feature = getConstituencyFeature(constituencyData.constituency.onsCode);
  if (!feature) {
    return NextResponse.json(
      { error: "Police areas not available", message: "No constituency polygon", constituency: slug },
      { status: 400 }
    );
  }

  const cacheDocRef = doc(db, "police_areas_cache", slug);

  type CacheShape = { data: PoliceAreasResponseStored; updated_at: string };
  let cached: CacheShape | null = null;
  try {
    const snap = await getDoc(cacheDocRef);
    if (snap.exists()) cached = snap.data() as CacheShape;
  } catch (err) {
    console.warn("police_areas_cache read failed:", err);
  }

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs > TTL_MS) {
      refreshInBackground(slug, constituencyData.constituency.onsCode);
    }
    const decoded: PoliceAreasResponse = decodePoliceAreas(cached.data);
    return NextResponse.json({ ...decoded, source: "cache" });
  }

  const fresh = await resolvePoliceAreas(constituencyData.constituency.onsCode, firestoreCache);
  if (!fresh) {
    return NextResponse.json(
      { forces: [], neighbourhoods: [], error: "Failed to generate police areas" },
      { status: 502 }
    );
  }

  try {
    await setDoc(cacheDocRef, {
      data: encodePoliceAreas(fresh),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("police_areas_cache write failed:", err);
  }

  return NextResponse.json(fresh);
}
