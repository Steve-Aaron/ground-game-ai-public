// Reusable police-area resolution logic shared by:
//   - /api/police-areas/route.ts   (request-time, uses firebase/firestore client)
//   - scripts/seed-police-areas.ts (offline crawl, uses firebase-admin)
//
// The route and seed script differ only in WHICH Firestore client they wire
// in. To avoid duplicating the resolution algorithm we expose it here with a
// pluggable cache layer.

import { readFileSync } from "fs";
import { join } from "path";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";

const POLICE_API_BASE = "https://data.police.uk/api";

const FORCE_PROBE_POINTS = 5;
// data.police.uk's documented limit (https://data.police.uk/docs/api-call-limits/)
// is a leaky bucket at 15 req/s sustained with a 30-request burst. 70ms gap
// → ~14.3 req/s sustained, just under the ceiling. The retry layer below
// catches the rare cases where another caller drained the bucket.
const NEIGHBOURHOOD_FETCH_BATCH = 1;
const BATCH_DELAY_MS = 70;
// 429 retry policy. Sequential pacing above should make 429s rare; when one
// does sneak through, a 1-second sleep is enough for the leaky bucket to
// refill ~15 tokens — plenty for the next call. We cap at 1s for the same
// reason: long sleeps don't help, since the bucket refills at 15/s anyway.
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_DEFAULT_WAIT_S = 1;
const RATE_LIMIT_MAX_WAIT_S = 1;

export interface PoliceAreasResponse {
  forces: Array<{
    id: string;
    name: string;
    polygon: number[][];
    colour: string;
  }>;
  neighbourhoods: Array<{
    force: string;
    forceName: string;
    id: string;
    name: string;
    polygon: number[][];
  }>;
  generated: string;
  source: string;
  sourceUrl: string;
  warnings?: string[];
}

/** In-memory representation. Ring is the natural number[][] form. */
export interface ForceBundleDoc {
  forceId: string;
  forceName: string;
  neighbourhoods: Array<{ id: string; name: string; ring: number[][] }>;
}

/**
 * Firestore-friendly representation. Firestore rejects directly nested
 * arrays (number[][]), so each ring is flattened to number[] of alternating
 * lng,lat values. Re-hydrated to number[][] on read via decodeForceBundle().
 */
export interface ForceBundleDocStored {
  forceId: string;
  forceName: string;
  neighbourhoods: Array<{ id: string; name: string; ring: number[] }>;
}

export function encodeForceBundle(b: ForceBundleDoc): ForceBundleDocStored {
  return {
    forceId: b.forceId,
    forceName: b.forceName,
    neighbourhoods: b.neighbourhoods.map((n) => ({
      id: n.id,
      name: n.name,
      ring: flattenRing(n.ring),
    })),
  };
}

export function decodeForceBundle(b: ForceBundleDocStored): ForceBundleDoc {
  return {
    forceId: b.forceId,
    forceName: b.forceName,
    neighbourhoods: b.neighbourhoods.map((n) => ({
      id: n.id,
      name: n.name,
      ring: unflattenRing(n.ring),
    })),
  };
}

function flattenRing(ring: number[][]): number[] {
  const out: number[] = [];
  for (const pt of ring) {
    out.push(pt[0], pt[1]);
  }
  return out;
}

function unflattenRing(flat: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push([flat[i], flat[i + 1]]);
  }
  return out;
}

/**
 * Storage shape for the per-constituency response. Same flat-ring trick as
 * the force bundle: every `polygon: number[][]` becomes `polygon: number[]`
 * to satisfy Firestore's no-nested-arrays rule.
 */
export interface PoliceAreasResponseStored {
  forces: Array<{ id: string; name: string; polygon: number[]; colour: string }>;
  neighbourhoods: Array<{
    force: string;
    forceName: string;
    id: string;
    name: string;
    polygon: number[];
  }>;
  generated: string;
  source: string;
  sourceUrl: string;
  warnings?: string[];
}

export function encodePoliceAreas(r: PoliceAreasResponse): PoliceAreasResponseStored {
  // Firestore rejects fields set to `undefined`. Only include `warnings` if
  // the source response has them — otherwise omit the key entirely.
  const out: PoliceAreasResponseStored = {
    forces: r.forces.map((f) => ({
      id: f.id,
      name: f.name,
      polygon: flattenRing(f.polygon),
      colour: f.colour,
    })),
    neighbourhoods: r.neighbourhoods.map((n) => ({
      force: n.force,
      forceName: n.forceName,
      id: n.id,
      name: n.name,
      polygon: flattenRing(n.polygon),
    })),
    generated: r.generated,
    source: r.source,
    sourceUrl: r.sourceUrl,
  };
  if (r.warnings && r.warnings.length > 0) {
    out.warnings = r.warnings;
  }
  return out;
}

export function decodePoliceAreas(r: PoliceAreasResponseStored): PoliceAreasResponse {
  const out: PoliceAreasResponse = {
    forces: r.forces.map((f) => ({
      id: f.id,
      name: f.name,
      polygon: unflattenRing(f.polygon),
      colour: f.colour,
    })),
    neighbourhoods: r.neighbourhoods.map((n) => ({
      force: n.force,
      forceName: n.forceName,
      id: n.id,
      name: n.name,
      polygon: unflattenRing(n.polygon),
    })),
    generated: r.generated,
    source: r.source,
    sourceUrl: r.sourceUrl,
  };
  if (r.warnings && r.warnings.length > 0) out.warnings = r.warnings;
  return out;
}

/** Pluggable cache interface — implemented over either Firestore client. */
export interface PoliceCache {
  readForceBundle(forceId: string): Promise<ForceBundleDoc | null>;
  writeForceBundle(bundle: ForceBundleDoc): Promise<void>;
}

interface LngLatPoint {
  lng: number;
  lat: number;
}

interface LocateResp {
  force: string;
  neighbourhood: string;
}

interface BoundaryPoint {
  latitude: string;
  longitude: string;
}

interface NeighbourhoodListItem {
  id: string;
  name: string;
}

interface ForceDetail {
  id: string;
  name: string;
}

interface GeoFeature {
  properties: { PCON24CD: string; PCON24NM: string };
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

let _allGeo: { features: GeoFeature[] } | null = null;

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

export function getConstituencyFeature(onsCode: string): Feature<Polygon | MultiPolygon> | null {
  const f = loadAllGeo().features.find((x) => x.properties.PCON24CD === onsCode);
  if (!f) return null;
  return {
    type: "Feature",
    properties: f.properties,
    geometry: f.geometry as Polygon | MultiPolygon,
  };
}

function probePoints(feature: Feature<Polygon | MultiPolygon>, n: number): LngLatPoint[] {
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(feature);
  const centroid = turf.centroid(feature).geometry.coordinates;
  const candidates: LngLatPoint[] = [
    { lng: centroid[0], lat: centroid[1] },
    { lng: minLng + (maxLng - minLng) * 0.25, lat: minLat + (maxLat - minLat) * 0.75 },
    { lng: minLng + (maxLng - minLng) * 0.75, lat: minLat + (maxLat - minLat) * 0.75 },
    { lng: minLng + (maxLng - minLng) * 0.25, lat: minLat + (maxLat - minLat) * 0.25 },
    { lng: minLng + (maxLng - minLng) * 0.75, lat: minLat + (maxLat - minLat) * 0.25 },
  ].slice(0, n);
  return candidates.filter((p) => turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), feature));
}

/**
 * Wrapper around fetch() that automatically retries on HTTP 429, honouring
 * the `retry_after` header (or a sensible default). Returns null after
 * exhausting retries.
 */
async function politeFetch(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "GroundGameAI/1.0 (constituency intelligence dashboard)",
        },
      });
    } catch (err) {
      if (process.env.POLICE_DEBUG) console.warn(`[police-areas] ${url} → threw: ${(err as Error).message}`);
      return null;
    }
    if (res.status !== 429) return res;

    // Try the JSON body first ({"error":"too_many_requests","retry_after":30}),
    // then the Retry-After header, then fall back to a sane default. The
    // resulting wait is capped at RATE_LIMIT_MAX_WAIT_S to keep the seed
    // script's worst-case duration predictable.
    let waitS = RATE_LIMIT_DEFAULT_WAIT_S;
    try {
      const body = await res.clone().json();
      if (typeof body?.retry_after === "number") waitS = body.retry_after;
    } catch {
      const header = res.headers.get("retry-after");
      if (header) {
        const n = parseInt(header, 10);
        if (!Number.isNaN(n)) waitS = n;
      }
    }
    waitS = Math.min(waitS, RATE_LIMIT_MAX_WAIT_S);

    if (attempt === RATE_LIMIT_MAX_RETRIES) {
      if (process.env.POLICE_DEBUG) {
        console.warn(`[police-areas] ${url} → 429 (giving up after ${attempt + 1} attempts)`);
      }
      return res; // surface the 429 so the caller logs it
    }

    // Re-add 1s padding to whatever waitS resolved to (capped above), so the
    // log message reflects what we'll actually sleep for — including the
    // cap.
    const sleepS = waitS + 1;
    if (process.env.POLICE_DEBUG) {
      console.warn(`[police-areas] ${url} → 429, sleeping ${sleepS}s (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`);
    }
    await new Promise((r) => setTimeout(r, sleepS * 1000));
  }
  return null;
}

async function locateNeighbourhood(pt: LngLatPoint): Promise<LocateResp | null> {
  const url = `${POLICE_API_BASE}/locate-neighbourhood?q=${pt.lat},${pt.lng}`;
  const res = await politeFetch(url);
  if (!res || !res.ok) {
    if (res && process.env.POLICE_DEBUG) console.warn(`[police-areas] ${url} → HTTP ${res.status}`);
    return null;
  }
  try {
    return (await res.json()) as LocateResp;
  } catch {
    return null;
  }
}

async function discoverForces(feature: Feature<Polygon | MultiPolygon>): Promise<string[]> {
  const points = probePoints(feature, FORCE_PROBE_POINTS);
  if (points.length === 0) return [];
  // Probes are sequential, not parallel, so we don't burst into a 429.
  const forces = new Set<string>();
  for (const pt of points) {
    const r = await locateNeighbourhood(pt);
    if (r?.force) forces.add(r.force);
    // Small breath between probes.
    await new Promise((res) => setTimeout(res, 250));
  }
  return Array.from(forces);
}

async function listForceNeighbourhoods(force: string): Promise<NeighbourhoodListItem[]> {
  const url = `${POLICE_API_BASE}/${encodeURIComponent(force)}/neighbourhoods`;
  const res = await politeFetch(url);
  if (!res || !res.ok) {
    if (res && process.env.POLICE_DEBUG) {
      const body = await res.text().catch(() => "");
      console.warn(`[police-areas] ${url} → HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return [];
  }
  try {
    return (await res.json()) as NeighbourhoodListItem[];
  } catch {
    return [];
  }
}

async function fetchBoundary(force: string, neighbourhood: string): Promise<BoundaryPoint[] | null> {
  const url = `${POLICE_API_BASE}/${encodeURIComponent(force)}/${encodeURIComponent(neighbourhood)}/boundary`;
  const res = await politeFetch(url);
  if (!res || !res.ok) {
    if (res && process.env.POLICE_DEBUG) console.warn(`[police-areas] ${url} → HTTP ${res.status}`);
    return null;
  }
  try {
    return (await res.json()) as BoundaryPoint[];
  } catch {
    return null;
  }
}

let _forcesCache: Map<string, string> | null = null;

async function loadForceNames(): Promise<Map<string, string>> {
  if (_forcesCache) return _forcesCache;
  const res = await politeFetch(`${POLICE_API_BASE}/forces`);
  if (!res || !res.ok) {
    _forcesCache = new Map();
    return _forcesCache;
  }
  try {
    const list = (await res.json()) as ForceDetail[];
    _forcesCache = new Map(list.map((f) => [f.id, f.name]));
  } catch {
    _forcesCache = new Map();
  }
  return _forcesCache;
}

export function colourForForce(forceId: string): string {
  const palette = [
    "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7",
    "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#8b5cf6",
  ];
  let hash = 0;
  for (let i = 0; i < forceId.length; i++) hash = (hash * 31 + forceId.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function boundaryToFeature(points: BoundaryPoint[]): Feature<Polygon> | null {
  if (!Array.isArray(points) || points.length < 3) return null;
  const ring: number[][] = points
    .map((p) => [parseFloat(p.longitude), parseFloat(p.latitude)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (ring.length < 3) return null;
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  try {
    return turf.polygon([ring]);
  } catch {
    return null;
  }
}

function outerRing(feature: Feature<Polygon | MultiPolygon>): number[][] {
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates[0];
  return feature.geometry.coordinates
    .map((poly) => poly[0])
    .reduce((a, b) => (a.length > b.length ? a : b));
}

function bboxIntersects(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

async function fetchBoundariesBatched(
  pairs: Array<{ force: string; id: string; name: string }>
): Promise<Array<{ force: string; id: string; name: string; feature: Feature<Polygon> }>> {
  const out: Array<{ force: string; id: string; name: string; feature: Feature<Polygon> }> = [];
  for (let i = 0; i < pairs.length; i += NEIGHBOURHOOD_FETCH_BATCH) {
    const batch = pairs.slice(i, i + NEIGHBOURHOOD_FETCH_BATCH);
    const results = await Promise.allSettled(batch.map((p) => fetchBoundary(p.force, p.id)));
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value) {
        const feature = boundaryToFeature(r.value);
        if (feature) out.push({ ...batch[idx], feature });
      }
    });
    if (i + NEIGHBOURHOOD_FETCH_BATCH < pairs.length) {
      await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
    }
  }
  return out;
}

/**
 * Return the bundle for a force, using the cache where possible. Pulled from
 * data.police.uk and written back to cache on miss.
 */
export async function getForceBundle(
  forceId: string,
  forceName: string,
  cache: PoliceCache
): Promise<ForceBundleDoc | null> {
  const cached = await cache.readForceBundle(forceId);
  if (cached) return cached;

  const list = await listForceNeighbourhoods(forceId);
  if (list.length === 0) return null;

  const pairs = list.map((n) => ({ force: forceId, id: n.id, name: n.name }));
  const withBoundaries = await fetchBoundariesBatched(pairs);

  const bundle: ForceBundleDoc = {
    forceId,
    forceName,
    neighbourhoods: withBoundaries.map((n) => ({
      id: n.id,
      name: n.name,
      ring: n.feature.geometry.coordinates[0],
    })),
  };

  await cache.writeForceBundle(bundle);
  return bundle;
}

/**
 * Resolve the police areas covering a single constituency. Pulls bundles for
 * every force that touches the seat, clips each neighbourhood to the
 * constituency, and unions per force.
 */
export async function resolvePoliceAreas(
  onsCode: string,
  cache: PoliceCache
): Promise<PoliceAreasResponse | null> {
  const feature = getConstituencyFeature(onsCode);
  if (!feature) return null;

  const constituencyBbox = turf.bbox(feature) as [number, number, number, number];

  const forceIds = await discoverForces(feature);
  if (forceIds.length === 0) {
    return {
      forces: [],
      neighbourhoods: [],
      generated: new Date().toISOString(),
      source: "data.police.uk",
      sourceUrl: "https://data.police.uk/",
      warnings: ["No police forces resolved. Seat may be outside data.police.uk coverage (Scotland, NI)."],
    };
  }

  const forceNames = await loadForceNames();
  const bundles = await Promise.all(
    forceIds.map((id) => getForceBundle(id, forceNames.get(id) ?? id, cache))
  );

  const withBoundaries: Array<{ force: string; id: string; name: string; feature: Feature<Polygon> }> = [];
  for (const bundle of bundles) {
    if (!bundle) continue;
    for (const nb of bundle.neighbourhoods) {
      try {
        withBoundaries.push({
          force: bundle.forceId,
          id: nb.id,
          name: nb.name,
          feature: turf.polygon([nb.ring]),
        });
      } catch {
        // skip
      }
    }
  }

  if (withBoundaries.length === 0) {
    return {
      forces: [],
      neighbourhoods: [],
      generated: new Date().toISOString(),
      source: "data.police.uk",
      sourceUrl: "https://data.police.uk/",
      warnings: [`Forces resolved (${forceIds.join(", ")}) but no neighbourhood data available`],
    };
  }

  const kept: Array<{
    force: string;
    forceName: string;
    id: string;
    name: string;
    clipped: Feature<Polygon | MultiPolygon>;
  }> = [];

  for (const nb of withBoundaries) {
    try {
      const nbBbox = turf.bbox(nb.feature) as [number, number, number, number];
      if (!bboxIntersects(constituencyBbox, nbBbox)) continue;
      const clipped = turf.intersect(
        turf.featureCollection([nb.feature, feature as Feature<Polygon | MultiPolygon>])
      );
      if (!clipped) continue;
      kept.push({
        force: nb.force,
        forceName: forceNames.get(nb.force) ?? nb.force,
        id: nb.id,
        name: nb.name,
        clipped: clipped as Feature<Polygon | MultiPolygon>,
      });
    } catch {
      // skip
    }
  }

  const byForce = new Map<string, Feature<Polygon | MultiPolygon>[]>();
  for (const nb of kept) {
    if (!byForce.has(nb.force)) byForce.set(nb.force, []);
    byForce.get(nb.force)!.push(nb.clipped);
  }

  const forces: PoliceAreasResponse["forces"] = [];
  for (const [forceId, features] of Array.from(byForce.entries())) {
    try {
      let unioned: Feature<Polygon | MultiPolygon> = features[0];
      for (let i = 1; i < features.length; i++) {
        const next = turf.union(turf.featureCollection([unioned, features[i]]));
        if (next) unioned = next as Feature<Polygon | MultiPolygon>;
      }
      forces.push({
        id: forceId,
        name: forceNames.get(forceId) ?? forceId,
        polygon: outerRing(unioned),
        colour: colourForForce(forceId),
      });
    } catch {
      // skip
    }
  }

  return {
    forces,
    neighbourhoods: kept.map((nb) => ({
      force: nb.force,
      forceName: nb.forceName,
      id: nb.id,
      name: nb.name,
      polygon: outerRing(nb.clipped),
    })),
    generated: new Date().toISOString(),
    source: "data.police.uk",
    sourceUrl: "https://data.police.uk/",
  };
}
