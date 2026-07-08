import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";
import { requireConstituencyAccess } from "@/lib/guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// UK Police API — free, no auth required
// Docs: https://data.police.uk/docs/
//
// Strategy:
//  - Use the polygon endpoint (`?poly=...`) so a single request covers the
//    entire constituency shape rather than approximating via a grid of
//    1-mile point queries (the previous approach missed gaps in rural seats
//    and over-counted in dense urban ones).
//  - data.police.uk limits poly query strings to ~4096 chars, so we simplify
//    the boundary to <= MAX_POLY_POINTS by even-interval sampling.
//  - Some crimes are published with `location: null` (force-anonymised). We
//    still count them toward totals and category summaries — only the map
//    markers need lat/lng.
//  - Auto-walk months from 2 → 6 back to find the most recent month that
//    actually returned crimes. Publication lag varies between forces.

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_POLY_POINTS = 50; // Keeps URL well under the 4096-char ceiling.
const POLICE_API_BASE = "https://data.police.uk/api";
// Rolling window — the AI Brief and dashboard summarise across this many
// months ending at the most recent month with published data.
const MONTHS_WINDOW = 3;

interface PoliceCrime {
  category: string;
  location: {
    latitude: string;
    longitude: string;
    street: { id: number; name: string };
  } | null;
  month: string;
  outcome_status: { category: string } | null;
  persistent_id?: string;
  id?: number;
}

interface CrimeData {
  crimes: Array<{
    category: string;
    lat: number;
    lng: number;
    street: string;
    month: string;
    outcome: string | null;
  }>;
  summary: Array<{ category: string; count: number }>;
  total: number;
  mappable: number;
  anonymised: number;
  // Most recent month in the window — preserved for backward compat with
  // any consumer that read `month` (e.g. map popup label).
  month: string;
  // The full rolling window, oldest → newest. Length is up to MONTHS_WINDOW;
  // shorter if the API returned no data for older months.
  months: string[];
  // Per-month totals across the window, oldest → newest. Lets the AI Brief
  // describe trend (rising / falling) without re-counting.
  monthlyTotals: Array<{ month: string; count: number }>;
  source: string;
  sourceUrl: string;
}

// ── Polygon helpers ─────────────────────────────────────────────────────

type LngLat = [number, number];
type Ring = LngLat[];

interface GeoFeature {
  properties: { PCON24CD: string; PCON24NM: string };
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
}

let _allGeo: { features: GeoFeature[] } | null = null;
const _polyCache = new Map<string, Ring | null>();

function loadAllGeo(): { features: GeoFeature[] } {
  if (_allGeo) return _allGeo;
  try {
    const p = join(process.cwd(), "public", "geojson", "constituencies-all.geojson");
    _allGeo = JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    _allGeo = { features: [] };
  }
  return _allGeo!;
}

function getRingForSlug(slug: string): Ring | null {
  if (_polyCache.has(slug)) return _polyCache.get(slug) ?? null;
  const data = getFullData(slug);
  if (!data) {
    _polyCache.set(slug, null);
    return null;
  }
  const code = data.constituency.onsCode;
  const feature = loadAllGeo().features.find((f) => f.properties.PCON24CD === code);
  if (!feature) {
    _polyCache.set(slug, null);
    return null;
  }
  // Pick the largest outer ring — for MultiPolygon (coastal seats with
  // islands etc) this gets the mainland, which is what users care about.
  let ring: Ring;
  if (feature.geometry.type === "Polygon") {
    ring = feature.geometry.coordinates[0];
  } else {
    ring = feature.geometry.coordinates
      .map((poly) => poly[0])
      .reduce((a, b) => (a.length > b.length ? a : b));
  }
  _polyCache.set(slug, ring);
  return ring;
}

/**
 * Even-interval sample of a ring down to at most `maxPoints` vertices.
 * Preserves the start point and closes the loop with it. data.police.uk
 * requires the polygon NOT to be closed in the query string (no repeated
 * start point), so we return an open list.
 */
function simplifyRing(ring: Ring, maxPoints: number): Ring {
  // Drop the closing duplicate if present (most GeoJSON rings close themselves).
  const open: Ring =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  if (open.length <= maxPoints) return open;
  const step = open.length / maxPoints;
  const out: Ring = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.floor(i * step);
    out.push(open[idx]);
  }
  return out;
}

function ringToPolyParam(ring: Ring): string {
  // data.police.uk format: `lat,lng:lat,lng:lat,lng`
  // (Note: lat first, not lng — common gotcha.)
  return ring.map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(":");
}

// ── Police API ──────────────────────────────────────────────────────────

async function fetchCrimesForMonth(polyParam: string, dateStr: string): Promise<PoliceCrime[] | null> {
  try {
    const url = `${POLICE_API_BASE}/crimes-street/all-crime?poly=${encodeURIComponent(polyParam)}&date=${dateStr}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      // The API uses POST for very long polygons. If we get 414/400 try POST.
      if (res.status === 414 || res.status === 400) {
        const postRes = await fetch(`${POLICE_API_BASE}/crimes-street/all-crime`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `poly=${encodeURIComponent(polyParam)}&date=${dateStr}`,
        });
        if (!postRes.ok) return null;
        return await postRes.json();
      }
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/** Shift a YYYY-MM string back by N months. */
function monthMinus(dateStr: string, n: number): string {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Today-relative rolling window. Always fetches the MONTHS_WINDOW most recent
 * months ending at today's month — e.g. on 2 June 2026 the window is
 * 2026-04 → 2026-06. Months with no published data (data.police.uk has a
 * 1–2 month publication lag) come back as 0 rather than the route walking
 * further back, which previously produced misleading 'Jan–Mar' windows when
 * today was June.
 *
 * Returns the months oldest → newest alongside per-month crime arrays.
 * Returns null only if every month errored at the network/API level (an empty
 * month is valid data, a null response is not).
 */
async function resolveLatestData(
  polyParam: string
): Promise<{ months: string[]; crimesByMonth: Record<string, PoliceCrime[]> } | null> {
  const anchor = currentMonth();
  const monthList: string[] = [];
  for (let i = MONTHS_WINDOW - 1; i >= 0; i--) {
    monthList.push(monthMinus(anchor, i));
  }

  // Fetch all months in parallel. fetchCrimesForMonth returns null on
  // network/API failure and [] on a valid-but-empty month.
  const results = await Promise.all(
    monthList.map(async (m) => ({ month: m, crimes: await fetchCrimesForMonth(polyParam, m) }))
  );

  // If every month errored upstream (all nulls), treat as a real failure so
  // the route can 502. If at least one returned an array (even empty), we
  // have a valid window — empty months stay as 0.
  if (results.every((r) => r.crimes === null)) return null;

  const crimesByMonth: Record<string, PoliceCrime[]> = {};
  for (const r of results) crimesByMonth[r.month] = r.crimes ?? [];

  return { months: monthList, crimesByMonth };
}

function formatCategory(cat: string): string {
  return cat.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function buildCrimeData(
  months: string[],
  crimesByMonth: Record<string, PoliceCrime[]>
): CrimeData {
  const categoryCounts: Record<string, number> = {};
  const mapped: CrimeData["crimes"] = [];
  const monthlyTotals: CrimeData["monthlyTotals"] = [];

  let total = 0;

  // Iterate newest → oldest so the most recent months populate the capped
  // marker list first (the map shows the most recent activity preferentially).
  const monthsNewestFirst = [...months].reverse();
  for (const month of monthsNewestFirst) {
    const monthCrimes = crimesByMonth[month] ?? [];
    total += monthCrimes.length;

    for (const c of monthCrimes) {
      const cat = formatCategory(c.category);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      // Only add to the mappable list if the API gave us coordinates.
      if (c.location && c.location.latitude && c.location.longitude) {
        const lat = parseFloat(c.location.latitude);
        const lng = parseFloat(c.location.longitude);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          mapped.push({
            category: cat,
            lat,
            lng,
            street: c.location.street?.name ?? "",
            month: c.month,
            outcome: c.outcome_status?.category || null,
          });
        }
      }
    }
  }

  // monthlyTotals are emitted oldest → newest so consumers can render a trend.
  for (const month of months) {
    monthlyTotals.push({ month, count: (crimesByMonth[month] ?? []).length });
  }

  // Cap the markers payload — beyond ~500 the map gets unreadable anyway.
  const cappedMapped = mapped.slice(0, 500);

  const summary = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  // `month` (singular) stays as the latest month for backward compat.
  const latestMonth = months[months.length - 1];

  return {
    crimes: cappedMapped,
    summary,
    total,
    mappable: mapped.length,
    anonymised: total - mapped.length,
    month: latestMonth,
    months,
    monthlyTotals,
    source: "data.police.uk",
    sourceUrl: "https://data.police.uk/",
  };
}

async function generateFreshData(constituencySlug: string): Promise<CrimeData | null> {
  const ring = getRingForSlug(constituencySlug);
  if (!ring) return null;

  const simplified = simplifyRing(ring, MAX_POLY_POINTS);
  const polyParam = ringToPolyParam(simplified);

  const resolved = await resolveLatestData(polyParam);
  if (!resolved) return null;

  return buildCrimeData(resolved.months, resolved.crimesByMonth);
}

async function fetchAndUpdateCache(
  constituencySlug: string,
  cacheDocRef: DocumentReference
) {
  try {
    const fresh = await generateFreshData(constituencySlug);
    if (!fresh) return;

    const existing = await cacheDocRef.get();
    const existingData = existing.data()?.data ?? null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(fresh)) {
      return;
    }

    await cacheDocRef.set({
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Background crime cache update failed:", err);
  }
}

export async function GET(request: Request) {
  // __AUTH_GUARD__
  const __guard = await requireConstituencyAccess(request);
  if (__guard instanceof NextResponse) return __guard;
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const force = searchParams.get("force") === "1";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  // Ensure we have a polygon for this seat. Scottish/Welsh/NI seats and any
  // future English seats missing from the GeoJSON return 400.
  const ring = getRingForSlug(constituencySlug);
  if (!ring) {
    return Response.json(
      {
        error: "Crime data not available",
        message: "No constituency polygon available for this slug",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  // crime_cache_v3: bumped from v2 when the window switched from
  // "walk back to find data" (which gave Jan–Mar when today was June) to a
  // today-relative window (most recent 3 months ending at today's month).
  // Old rows are ignored, not migrated.
  const cacheDocRef = adminDb().collection("crime_cache_v3").doc(constituencySlug);

  // Cache read is best-effort. If Firestore rules deny or it's unreachable,
  // we skip the cache rather than failing the route.
  let cached: { data: CrimeData; updated_at: string } | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) {
      cached = snap.data() as { data: CrimeData; updated_at: string };
    }
  } catch (err) {
    console.warn("Crime cache read failed (continuing without cache):", err);
  }

  if (cached && !force) {
    const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
    if (cacheAge > TTL_MS) {
      fetchAndUpdateCache(constituencySlug, cacheDocRef)
        .catch(err => console.warn("Crime background refresh failed:", err));
    }
    return NextResponse.json({ ...cached.data, source: "cache", _cachedAt: new Date(cached.updated_at).getTime() });
  }

  const fresh = await generateFreshData(constituencySlug);
  if (!fresh) {
    return NextResponse.json(
      { crimes: [], summary: [], total: 0, error: "Failed to fetch crime data" },
      { status: 502 }
    );
  }

  // Cache write is also best-effort — return the fresh data regardless.
  const cachedAt = Date.now();
  try {
    await cacheDocRef.set({
      data: fresh,
      updated_at: new Date(cachedAt).toISOString(),
    });
  } catch (err) {
    console.warn("Crime cache write failed (returning fresh anyway):", err);
  }

  return NextResponse.json({ ...fresh, _cachedAt: cachedAt });
}
