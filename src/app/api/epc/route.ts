import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // EPC aggregate stats change quarterly — weekly refresh is enough

// Energy Performance Certificate (EPC) Open Data
// Requires free API key from get-energy-performance-data.communities.gov.uk
// Auth: Bearer token
// Falls back to national average data if no key is configured

const EPC_BASE = "https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search";

interface EPCRecord {
  certificateNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  postcode: string;
  currentEnergyEfficiencyBand: string;
  registrationDate: string;
}

type BandCounts = Record<string, number>;

// National average EPC distribution (England & Wales, 2023/24 data)
// Used as fallback when no API key is configured
const NATIONAL_FALLBACK: BandCounts = {
  A: 2,
  B: 15,
  C: 32,
  D: 30,
  E: 15,
  F: 5,
  G: 1,
};

async function generateFreshEPCData(
  constituencyName: string,
  apiKey: string
): Promise<{ ratings: BandCounts; totalAssessed: number; poorlyRated: number; recentAssessments: object[]; sourceUrl: string } | null> {
  try {
    const allRecords = await fetchEPCPage(constituencyName, apiKey);
    const ratings: BandCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
    for (const record of allRecords) {
      const band = record.currentEnergyEfficiencyBand?.toUpperCase();
      if (band && band in ratings) ratings[band]++;
    }
    const totalAssessed = Object.values(ratings).reduce((a, b) => a + b, 0);
    const poorlyRatedCount = ratings.D + ratings.E + ratings.F + ratings.G;
    const poorlyRated = totalAssessed > 0 ? Math.round((poorlyRatedCount / totalAssessed) * 1000) / 10 : 0;
    const recentAssessments = allRecords
      .filter((r) => r.registrationDate)
      .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate))
      .slice(0, 10)
      .map((r) => ({
        address: [r.addressLine1, r.addressLine2].filter(Boolean).join(", "),
        postcode: r.postcode,
        rating: r.currentEnergyEfficiencyBand,
        date: r.registrationDate,
      }));
    return { ratings, totalAssessed, poorlyRated, recentAssessments, sourceUrl: "https://get-energy-performance-data.communities.gov.uk/" };
  } catch {
    return null;
  }
}

async function fetchEPCPage(constituencyName: string, apiKey: string): Promise<EPCRecord[]> {
  const url = `${EPC_BASE}?constituency[]=${encodeURIComponent(constituencyName)}&page=500&current_page=1`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const force = searchParams.get("force") === "1";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  const ladCode = constituencyData.areas?.lads?.[0]?.code ?? null;

  if (ladCode?.startsWith("S12")) {
    return NextResponse.json({
      ratings: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 },
      totalAssessed: 0,
      poorlyRated: 0,
      recentAssessments: [],
      source: "not-applicable",
      sourceUrl: "https://www.scottishepcregister.org.uk/",
      scotland: true,
      note: "Energy Performance Certificates in Scotland are held on the Scottish EPC Register, not the England & Wales register.",
    });
  }

  if (ladCode?.startsWith("N09")) {
    return NextResponse.json({
      ratings: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 },
      totalAssessed: 0,
      poorlyRated: 0,
      recentAssessments: [],
      source: "not-applicable",
      sourceUrl: "https://www.epcni.info/",
      northernIreland: true,
      note: "Energy Performance Certificates in Northern Ireland are held on the NI EPC Register, not the England & Wales register.",
    });
  }

  const constituencyName = constituencyData.constituency.name;
  const cacheDocRef = adminDb.collection("epc_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) cached = snap.data() as CacheDoc;
  } catch (err) {
    console.warn("EPC cache read failed (continuing without cache):", err);
  }

  const apiKey = process.env.EPC_API_KEY;

  const cachedTotalAssessed = cached?.data?.totalAssessed as number | undefined;
  const cacheIsEmpty = cachedTotalAssessed === 0 || cachedTotalAssessed === undefined;

  if (cached && !force && !cacheIsEmpty) {
    const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
    if (cacheAge > TTL_MS && apiKey) {
      (async () => {
        try {
          const fresh = await generateFreshEPCData(constituencyName, apiKey);
          if (fresh) await cacheDocRef.set({ data: fresh, updated_at: new Date().toISOString() });
        } catch (err) {
          console.warn("EPC background refresh failed:", err);
        }
      })();
    }
    return NextResponse.json({ ...cached.data, source: "cache", _cachedAt: new Date(cached.updated_at).getTime() });
  }

  // If no API key, return a reasonable fallback
  if (!apiKey) {
    const totalFallback = Object.values(NATIONAL_FALLBACK).reduce((a, b) => a + b, 0);
    const poorlyRated =
      ((NATIONAL_FALLBACK.D + NATIONAL_FALLBACK.E + NATIONAL_FALLBACK.F + NATIONAL_FALLBACK.G) /
        totalFallback) *
      100;

    return NextResponse.json({
      ratings: NATIONAL_FALLBACK,
      totalAssessed: totalFallback,
      poorlyRated: Math.round(poorlyRated * 10) / 10,
      recentAssessments: [],
      source: "fallback",
      note: "No EPC API key configured. Showing national average distribution. Set EPC_API_KEY env var to fetch live data.",
    });
  }

  try {
    const fresh = await generateFreshEPCData(constituencyName, apiKey);
    if (!fresh) throw new Error("EPC fetch returned null");

    const cachedAt = Date.now();
    try {
      await cacheDocRef.set({ data: fresh, updated_at: new Date(cachedAt).toISOString() });
    } catch (err) {
      console.warn("EPC cache write failed (returning fresh anyway):", err);
    }

    return NextResponse.json({ ...fresh, source: "live", _cachedAt: cachedAt });
  } catch {
    return NextResponse.json(
      {
        ratings: NATIONAL_FALLBACK,
        totalAssessed: 0,
        poorlyRated: 0,
        recentAssessments: [],
        error: "Failed to fetch EPC data",
        source: "fallback",
      },
      { status: 500 }
    );
  }
}
