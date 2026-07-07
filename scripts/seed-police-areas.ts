#!/usr/bin/env tsx
/**
 * Seed Firestore with police-area data for every UK constituency.
 *
 * Usage:
 *   npm run seed-police-areas              # all 650 constituencies
 *   npm run seed-police-areas -- braintree clacton    # specific slugs
 *   npm run seed-police-areas -- --force   # bypass cache, regenerate from data.police.uk
 *   npm run seed-police-areas -- --dry-run # show what would be done, change nothing
 *
 * What it does:
 *   1. Iterates the requested slug list (default: all 650)
 *   2. For each slug, calls resolvePoliceAreas() using a firebase-admin-backed
 *      cache implementation
 *   3. Writes:
 *      - police_force_bundles/{forceId}    (once per force, reused thereafter)
 *      - police_areas_cache/{slug}         (per constituency)
 *
 * Polite to data.police.uk:
 *   - 250ms gap between constituencies
 *   - The bundle cache means the second seat in the same force costs ~5 calls
 *     instead of ~35
 *   - For UK-wide seed: ~43 forces × 30 boundaries = ~1,300 boundary calls
 *     spread across the run; rest is bbox/intersect work locally
 *
 * Resumable: re-running with the same slugs is safe. If a constituency was
 * already cached AND the force bundles it depends on are fresh, the API isn't
 * touched — only the local intersect + Firestore write is repeated.
 */

import { config as loadEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { CONSTITUENCIES } from "../src/data/constituencies";
import {
  decodeForceBundle,
  encodeForceBundle,
  encodePoliceAreas,
  resolvePoliceAreas,
  type ForceBundleDoc,
  type ForceBundleDocStored,
  type PoliceCache,
} from "../src/lib/police-areas";

loadEnv({ path: ".env.local" });

const FORCE_BUNDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// Per-seat pause. Most seats hit a cached bundle and only do Firestore
// reads/writes (no upstream API), so a long pause here is pure waste. The
// in-library politeFetch already paces individual calls.
const SEAT_PAUSE_MS = 100;

interface Args {
  slugs: string[];
  force: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { slugs: [], force: false, dryRun: false };
  for (const a of argv) {
    if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--")) {
      console.warn(`Unknown flag: ${a}`);
    } else {
      args.slugs.push(a);
    }
  }
  if (args.slugs.length === 0) {
    args.slugs = CONSTITUENCIES.map((c) => c.slug);
  }
  return args;
}

function makeCache(db: Firestore, force: boolean, dryRun: boolean): PoliceCache {
  // Memoise within a run so two consecutive Essex constituencies don't double-
  // fetch the bundle from Firestore.
  const inMemory = new Map<string, ForceBundleDoc>();

  return {
    async readForceBundle(forceId) {
      if (force) return null;
      if (inMemory.has(forceId)) return inMemory.get(forceId)!;
      try {
        const snap = await db.collection("police_force_bundles").doc(forceId).get();
        if (!snap.exists) return null;
        const env = snap.data() as { data: ForceBundleDocStored; updated_at: string };
        const ageMs = Date.now() - new Date(env.updated_at).getTime();
        if (ageMs > FORCE_BUNDLE_TTL_MS) return null;
        const decoded = decodeForceBundle(env.data);
        inMemory.set(forceId, decoded);
        return decoded;
      } catch (err) {
        console.warn(`  ! bundle read ${forceId}:`, (err as Error).message);
        return null;
      }
    },
    async writeForceBundle(bundle) {
      inMemory.set(bundle.forceId, bundle);
      if (dryRun) return;
      try {
        await db.collection("police_force_bundles").doc(bundle.forceId).set({
          data: encodeForceBundle(bundle),
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn(`  ! bundle write ${bundle.forceId}:`, (err as Error).message);
      }
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env.local");
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const db = getFirestore();

  console.log(`Seeding police areas for ${args.slugs.length} constituencies`);
  if (args.force) console.log("  --force: bypassing existing caches");
  if (args.dryRun) console.log("  --dry-run: no Firestore writes");

  const cache = makeCache(db, args.force, args.dryRun);

  const byForce: Record<string, number> = {};
  const failures: Array<{ slug: string; reason: string }> = [];
  const startedAt = Date.now();

  for (let i = 0; i < args.slugs.length; i++) {
    const slug = args.slugs[i];
    const meta = CONSTITUENCIES.find((c) => c.slug === slug);
    if (!meta) {
      failures.push({ slug, reason: "Unknown slug" });
      continue;
    }

    process.stdout.write(`[${i + 1}/${args.slugs.length}] ${slug.padEnd(45)} `);

    try {
      // Skip if seat cache is fresh AND we're not forcing AND we're not in a
      // dry-run. Dry-run is meant to show what the resolver actually returns
      // for a slug, so honouring an existing cache would defeat the purpose.
      if (!args.force && !args.dryRun) {
        const seatSnap = await db.collection("police_areas_cache").doc(slug).get();
        if (seatSnap.exists) {
          const env = seatSnap.data() as { updated_at: string };
          const ageMs = Date.now() - new Date(env.updated_at).getTime();
          if (ageMs < FORCE_BUNDLE_TTL_MS) {
            // Inspect what's cached and print useful info rather than 'cached'.
            const data = (env as unknown as { data: { forces: unknown[]; neighbourhoods: unknown[]; warnings?: string[] } }).data;
            const f = data.forces?.length ?? 0;
            const n = data.neighbourhoods?.length ?? 0;
            const w = data.warnings?.length ? ` [${data.warnings.length} warning]` : "";
            process.stdout.write(`cached (${f} force(s), ${n} nb${w})\n`);
            continue;
          }
        }
      }

      const fresh = await resolvePoliceAreas(meta.onsCode, cache);
      if (!fresh) {
        failures.push({ slug, reason: "resolvePoliceAreas returned null" });
        process.stdout.write("FAILED\n");
        continue;
      }

      for (const f of fresh.forces) {
        byForce[f.id] = (byForce[f.id] || 0) + 1;
      }

      if (!args.dryRun) {
        await db.collection("police_areas_cache").doc(slug).set({
          data: encodePoliceAreas(fresh),
          updated_at: new Date().toISOString(),
        });
      }

      const forces = fresh.forces.length;
      const nbs = fresh.neighbourhoods.length;
      const warn = fresh.warnings && fresh.warnings.length > 0 ? ` [${fresh.warnings.length} warning]` : "";
      process.stdout.write(`${forces} force(s), ${nbs} nb${warn}\n`);
      // Print warning messages inline so 0-force results are diagnosable
      // without having to dig into the Firestore doc.
      if (fresh.warnings && fresh.warnings.length > 0) {
        for (const w of fresh.warnings) {
          process.stdout.write(`     warning: ${w}\n`);
        }
      }
      // For zero-result outcomes, dump the bbox so we can sanity-check the
      // probe points were inside the polygon in the first place.
      if (forces === 0 && fresh.warnings && fresh.warnings.length === 0) {
        process.stdout.write(`     note: 0 forces resolved with no warning — likely upstream API hiccup\n`);
      }
    } catch (err) {
      failures.push({ slug, reason: (err as Error).message });
      process.stdout.write(`ERROR: ${(err as Error).message}\n`);
    }

    if (i + 1 < args.slugs.length) {
      await new Promise((r) => setTimeout(r, SEAT_PAUSE_MS));
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
  console.log(`Forces seen: ${Object.keys(byForce).length}`);
  for (const [forceId, count] of Object.entries(byForce).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${forceId.padEnd(30)} ${count} constituencies`);
  }
  if (failures.length > 0) {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures) console.log(`  ${f.slug}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
