// Shared per-constituency Firestore cache.
//
// Every external-API route in src/app/api/* repeats the same pattern:
//   1. Build a Firestore doc ref under `cache/<route>/<slug>`
//   2. Read it; if fresh, return cached payload
//   3. Otherwise build fresh, write, return
//
// This helper collapses that pattern into one call. Routes become:
//
//   const data = await cached(
//     { route: 'macro', key: 'gb' },        // cache key
//     6 * 60 * 60 * 1000,                   // TTL ms
//     () => buildFreshMacroData(),          // builder
//   );
//
// The cache document shape is:
//   { fetchedAt: number, payload: T }

import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface CacheKey {
  /** Route slug, e.g. 'macro', 'companies'. Matches src/app/api/<route> */
  route: string;
  /** Per-constituency key — usually a constituency slug. Use 'gb' / 'uk' for national series */
  key: string;
}

interface CacheDoc<T> {
  fetchedAt: number;
  payload: T;
}

/**
 * Read the cached payload if it is fresher than `ttlMs`, otherwise build a
 * new one with `build()`, persist it, and return that. `build` may return
 * `null` to indicate 'no data, but do not cache' — handy for upstreams that
 * 500 intermittently.
 */
export async function cached<T>(
  { route, key }: CacheKey,
  ttlMs: number,
  build: () => Promise<T | null>,
): Promise<T | null> {
  const ref = doc(db, "cache", route, "entries", key) as DocumentReference<CacheDoc<T>>;
  const snap = await getDoc(ref);
  const now = Date.now();

  if (snap.exists()) {
    const data = snap.data();
    if (data.fetchedAt && now - data.fetchedAt < ttlMs) {
      return data.payload;
    }
  }

  const fresh = await build();
  if (fresh === null) {
    // Fall back to stale cache if we have one — better stale than blank
    return snap.exists() ? snap.data().payload : null;
  }

  await setDoc(ref, { fetchedAt: now, payload: fresh });
  return fresh;
}
