import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

// DESNZ Sub-Regional Fuel Poverty Statistics (England only)
// Uses Low Income Low Energy Efficiency (LILEE) definition
// Published annually — 30-day cache is appropriate
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

// England national average fuel poverty rate (LILEE, 2022)
const ENGLAND_AVERAGE_PCT = 13.1;

// gov.uk content API — returns attachment URLs for the statistics release
const GOV_CONTENT_API =
  "https://www.gov.uk/api/content/government/statistics/sub-regional-fuel-poverty-data-2022";

interface FuelPovertyData {
  fuelPoorHouseholds: number;
  totalHouseholds: number;
  fuelPovertyPct: number;
  nationalAveragePct: number;
  year: number;
  areaName: string;
  source: string;
}

async function findCsvUrl(): Promise<string | null> {
  try {
    const res = await fetch(GOV_CONTENT_API, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const attachments: Array<{ content_type?: string; url?: string; title?: string; filename?: string }> =
      json?.details?.attachments ?? [];
    // Find the parliamentary constituency CSV table
    const csv = attachments.find(
      (a) =>
        (a.content_type === "text/csv" || a.url?.endsWith(".csv")) &&
        (a.filename?.toLowerCase().includes("constituency") ||
          a.filename?.toLowerCase().includes("parliamentary") ||
          a.title?.toLowerCase().includes("constituency") ||
          a.title?.toLowerCase().includes("parliamentary"))
    );
    return csv?.url ?? null;
  } catch {
    return null;
  }
}

async function parseCsvForConstituency(
  csvUrl: string,
  onsCode: string
): Promise<Omit<FuelPovertyData, "nationalAveragePct"> | null> {
  const res = await fetch(csvUrl, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "text/csv,*/*" },
  });
  if (!res.ok) return null;

  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());

  // Flexible column detection
  const codeIdx   = header.findIndex((h) => h.includes("code") || h === "ons code" || h === "area code");
  const nameIdx   = header.findIndex((h) => h.includes("name") || h === "area name");
  const pctIdx    = header.findIndex((h) => h.includes("proportion") || h.includes("percentage") || h.includes("% fuel") || h.includes("fuel poor %"));
  const poorIdx   = header.findIndex((h) => (h.includes("fuel poor") && h.includes("household")) && !h.includes("%"));
  const totalIdx  = header.findIndex((h) => h.includes("total household"));
  const yearIdx   = header.findIndex((h) => h === "year");

  if (codeIdx === -1) return null;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.replace(/"/g, "").trim());
    if (!cols[codeIdx]) continue;
    if (cols[codeIdx].trim() !== onsCode) continue;

    const fuelPoorHouseholds = poorIdx !== -1 ? parseInt(cols[poorIdx], 10) : 0;
    const totalHouseholds    = totalIdx !== -1 ? parseInt(cols[totalIdx].replace(/,/g, ""), 10) : 0;
    const rawPct             = pctIdx !== -1 ? parseFloat(cols[pctIdx]) : 0;
    const fuelPovertyPct     = rawPct > 1 ? rawPct : rawPct * 100;
    const year               = yearIdx !== -1 ? parseInt(cols[yearIdx], 10) : 2022;
    const areaName           = nameIdx !== -1 ? cols[nameIdx] : "";

    if (fuelPovertyPct > 0) {
      return { fuelPoorHouseholds, totalHouseholds, fuelPovertyPct, year, areaName, source: "DESNZ" };
    }
  }
  return null;
}

async function fetchAndCache(
  onsCode: string,
  cacheDocRef: DocumentReference
): Promise<FuelPovertyData | null> {
  const csvUrl = await findCsvUrl();
  if (!csvUrl) return null;

  const parsed = await parseCsvForConstituency(csvUrl, onsCode);
  if (!parsed) return null;

  const data: FuelPovertyData = { ...parsed, nationalAveragePct: ENGLAND_AVERAGE_PCT };

  await cacheDocRef.set({
    data,
    updated_at: new Date().toISOString(),
  });
  return data;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const ladCode = constituencyData.areas?.lads?.[0]?.code ?? null;

  // Fuel poverty stats are England-only from DESNZ.
  // Scotland uses Scottish House Condition Survey (SHCS).
  // Wales uses Welsh Government fuel poverty statistics.
  // NI uses NI Housing Executive (NIHE).
  if (ladCode?.startsWith("S12")) {
    return NextResponse.json({
      source: "not-applicable",
      scotland: true,
      sourceUrl: "https://www.gov.scot/publications/scottish-house-condition-survey-2022-key-findings/",
      note: "Fuel poverty statistics for Scotland are published by the Scottish Government via the Scottish House Condition Survey.",
    });
  }
  if (ladCode?.startsWith("N09")) {
    return NextResponse.json({
      source: "not-applicable",
      northernIreland: true,
      sourceUrl: "https://www.nihe.gov.uk/Working-With-Us/Research/House-Condition-Survey",
      note: "Fuel poverty statistics for Northern Ireland are published by the NI Housing Executive.",
    });
  }
  if (ladCode?.startsWith("W06")) {
    return NextResponse.json({
      source: "not-applicable",
      wales: true,
      sourceUrl: "https://www.gov.wales/fuel-poverty",
      note: "Fuel poverty statistics for Wales are published by the Welsh Government.",
    });
  }

  const onsCode = constituencyData.constituency.onsCode;
  const cacheDocRef = adminDb.collection("fuel_poverty_cache").doc(constituencySlug);

  type CacheDoc = { data: FuelPovertyData; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) cached = snap.data() as CacheDoc;
  } catch {
    // continue without cache
  }

  if (cached && !force) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < TTL_MS) {
      return NextResponse.json({ ...cached.data, _cachedAt: new Date(cached.updated_at).getTime() });
    }
  }

  try {
    const fresh = await fetchAndCache(onsCode, cacheDocRef);
    if (!fresh) {
      // Return redirect to DESNZ stats page
      return NextResponse.json({
        source: "not-available",
        sourceUrl: "https://www.gov.uk/government/collections/fuel-poverty-sub-regional-statistics",
        note: "Constituency-level fuel poverty data could not be retrieved. View the full DESNZ statistics.",
      });
    }
    return NextResponse.json(fresh);
  } catch (err) {
    console.error("Fuel poverty fetch error:", err);
    if (cached) {
      return NextResponse.json({ ...cached.data, _cachedAt: new Date(cached.updated_at).getTime() });
    }
    return NextResponse.json(
      { error: "Failed to fetch fuel poverty data", source: "error" },
      { status: 500 }
    );
  }
}
