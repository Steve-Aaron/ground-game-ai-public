import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";
import googleTrends from "google-trends-api";
import Parser from "rss-parser";
import { requireUser } from "@/lib/guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// google-trends-api scrapes Google's private Trends endpoints and was last
// published 2020-12-28, so any of the three section calls below can break
// without notice if Google rotates their internal API. Each section is
// wrapped to fail independently — a partial result still updates the cache;
// total failure preserves the previous cache. The `freshness` field on the
// response shows which sections succeeded on the most recent attempt.

const TTL_MS = 12 * 60 * 60 * 1000;

const GEO_GB = "GB";
const GEO_ENGLAND = "GB-ENG";
const INTEREST_BY_REGION_DELAY_MS = 600;

// Strip peerage/knighthood honorifics so trends queries match how people
// actually search. Most people Google "James Cleverly," not "Sir James Cleverly."
const HONORIFICS = ["Sir ", "Dame ", "Lord ", "Lady ", "Baroness ", "Baron "];
function stripHonorific(name: string): string {
  for (const h of HONORIFICS) {
    if (name.startsWith(h)) return name.slice(h.length);
  }
  return name;
}

interface TrendingSearch {
  title: string;
  traffic: string;
  articleCount: number;
  relatedQueries: string[];
  /** Top linked news story for the trend (from the RSS feed). */
  newsTitle?: string;
  newsUrl?: string;
  newsSource?: string;
}

interface InterestOverTimePoint {
  date: string;
  formattedDate: string;
  values: Record<string, number>;
}

interface RegionalComparison {
  keyword: string;
  regionValue: number | null;
  nationalAverage: number;
  rank: number | null;
  totalRegions: number;
}

type SectionStatus = "ok" | "failed";

interface FreshnessReport {
  trendingSearches: SectionStatus;
  regionalTrending: SectionStatus;
  interestOverTime: SectionStatus;
  regionalVsNational: SectionStatus;
}

interface TrendsData {
  trendingSearches: TrendingSearch[];
  /** Trending in the constituency's UK nation (England/Scotland/Wales/NI). */
  regionalTrending: TrendingSearch[];
  regionTrendingName: string;
  interestOverTime: InterestOverTimePoint[];
  regionalVsNational: RegionalComparison[];
  fetched_at: string;
  source: string;
  sourceUrl: string;
  note: string;
  freshness: FreshnessReport;
  keywordsUsed: string[];
  mpName: string;
  constituencyName: string;
}

// Google killed the private dailyTrends API that google-trends-api used —
// the public Trending Now RSS feed is the supported replacement and carries
// linked news stories per trend. Verified July 2026 for GB and GB-ENG.
const rssParser = new Parser({
  customFields: {
    item: [
      ["ht:approx_traffic", "traffic"],
      ["ht:news_item", "newsItems", { keepArray: true }],
    ],
  },
});

interface RssNewsItem {
  "ht:news_item_title"?: string;
  "ht:news_item_url"?: string;
  "ht:news_item_source"?: string;
}

async function fetchTrendingRss(geo: string): Promise<TrendingSearch[]> {
  try {
    const res = await fetch(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error(`Trends RSS returned ${res.status} for ${geo}`);
    const feed = await rssParser.parseString(await res.text());
    return (feed.items ?? [])
      .slice(0, 20)
      .map((item) => {
        const typed = item as typeof item & { traffic?: string; newsItems?: RssNewsItem[] };
        const news = typed.newsItems ?? [];
        const top = news[0];
        return {
          title: item.title ?? "",
          traffic: typed.traffic ?? "",
          articleCount: news.length,
          relatedQueries: [],
          newsTitle: top?.["ht:news_item_title"] ?? "",
          newsUrl: top?.["ht:news_item_url"] ?? "",
          newsSource: top?.["ht:news_item_source"] ?? "",
        };
      })
      .filter((t) => t.title);
  } catch (err) {
    console.error(`Trends: RSS fetch failed for ${geo}:`, err);
    return [];
  }
}

// The Trending RSS supports UK nations, not English regions — map the
// constituency's region string to the closest nation feed.
function regionTrendingGeo(region: string): { geo: string; label: string } {
  if (/scotland/i.test(region)) return { geo: "GB-SCT", label: "Scotland" };
  if (/wales/i.test(region)) return { geo: "GB-WLS", label: "Wales" };
  if (/northern ireland/i.test(region)) return { geo: "GB-NIR", label: "Northern Ireland" };
  return { geo: GEO_ENGLAND, label: "England" };
}

async function safeInterestOverTime(
  mpName: string,
  constituencyName: string
): Promise<InterestOverTimePoint[]> {
  try {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 90);
    const raw = await googleTrends.interestOverTime({
      keyword: [mpName, constituencyName],
      startTime,
      geo: GEO_ENGLAND,
    });
    const parsed = JSON.parse(raw);
    const timeline = (parsed?.default?.timelineData ?? []) as Array<{
      time?: string;
      formattedTime?: string;
      value?: number[];
    }>;
    return timeline.map((point) => ({
      date: point?.time ?? "",
      formattedDate: point?.formattedTime ?? "",
      values: {
        [mpName]: point?.value?.[0] ?? 0,
        [constituencyName]: point?.value?.[1] ?? 0,
      },
    }));
  } catch (err) {
    console.error("Trends: interestOverTime failed:", err);
    return [];
  }
}

async function safeInterestByRegion(
  keywords: string[],
  regionName: string
): Promise<RegionalComparison[]> {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - 90);
  const results: RegionalComparison[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    try {
      const raw = await googleTrends.interestByRegion({
        keyword,
        startTime,
        geo: GEO_ENGLAND,
        resolution: "REGION",
      });
      const parsed = JSON.parse(raw);
      const regions = (parsed?.default?.geoMapData ?? []) as Array<{
        geoName?: string;
        value?: number[];
        hasData?: boolean[];
      }>;

      const withData = regions.filter((r) => r.hasData?.[0]);
      const values = withData.map((r) => r.value?.[0] ?? 0);
      const nationalAverage = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;

      const regionEntry = withData.find(
        (r) => r.geoName?.toLowerCase() === regionName.toLowerCase()
      );
      const regionValue = regionEntry?.value?.[0] ?? null;

      let rank: number | null = null;
      if (regionValue !== null && withData.length > 0) {
        const sorted = [...withData].sort(
          (a, b) => (b.value?.[0] ?? 0) - (a.value?.[0] ?? 0)
        );
        const idx = sorted.findIndex(
          (r) => r.geoName?.toLowerCase() === regionName.toLowerCase()
        );
        rank = idx >= 0 ? idx + 1 : null;
      }

      results.push({
        keyword,
        regionValue,
        nationalAverage: Math.round(nationalAverage * 10) / 10,
        rank,
        totalRegions: withData.length,
      });
    } catch (err) {
      console.error(`Trends: interestByRegion failed for "${keyword}":`, err);
    }

    if (i < keywords.length - 1) {
      await new Promise((r) => setTimeout(r, INTEREST_BY_REGION_DELAY_MS));
    }
  }

  return results;
}

async function generateFreshData(
  mpName: string,
  constituencyName: string,
  region: string,
  keywords: string[]
): Promise<TrendsData | null> {
  const regionFeed = regionTrendingGeo(region);
  const [trending, regionalTrending, interest, regional] = await Promise.all([
    fetchTrendingRss(GEO_GB),
    fetchTrendingRss(regionFeed.geo),
    safeInterestOverTime(mpName, constituencyName),
    safeInterestByRegion(keywords, region),
  ]);

  if (!trending.length && !regionalTrending.length && !interest.length && !regional.length) return null;

  return {
    trendingSearches: trending,
    regionalTrending,
    regionTrendingName: regionFeed.label,
    interestOverTime: interest,
    regionalVsNational: regional,
    fetched_at: new Date().toISOString(),
    source: "Google Trends (Trending Now RSS + google-trends-api for interest data)",
    sourceUrl: "https://trends.google.com",
    note: "Data may be stale if upstream scrape fails. Check fetched_at and the freshness object to see which sections succeeded on the most recent fetch.",
    freshness: {
      trendingSearches: trending.length ? "ok" : "failed",
      regionalTrending: regionalTrending.length ? "ok" : "failed",
      interestOverTime: interest.length ? "ok" : "failed",
      regionalVsNational: regional.length ? "ok" : "failed",
    },
    keywordsUsed: keywords,
    mpName,
    constituencyName,
  };
}

export async function GET(request: Request) {
  // __AUTH_GUARD__
  const __guard = await requireUser(request);
  if (__guard instanceof NextResponse) return __guard;
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") ?? "";
  const force = searchParams.get("force") === "1";

  const fullData = getFullData(constituencySlug);
  if (!fullData) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }

  const constituencyName = fullData.constituency.name;
  const mpNameRaw = fullData.mp?.name ?? fullData.constituency.mp;
  const mpName = stripHonorific(mpNameRaw);
  const region = fullData.constituency.region;

  const keywords = [
    mpName,
    constituencyName,
    "cost of living",
    "NHS",
    "immigration",
    "council tax",
    "Reform UK",
  ];

  const cacheDocRef = adminDb().collection("trends_v2_cache").doc(constituencySlug);

  type CacheDoc = { data: Record<string, unknown>; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) cached = snap.data() as CacheDoc;
  } catch (err) {
    console.warn("Trends cache read failed (continuing without cache):", err);
  }

  if (cached && !force) {
    const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
    if (cacheAge > TTL_MS) {
      (async () => {
        try {
          const fresh = await generateFreshData(mpName, constituencyName, region, keywords);
          if (fresh) await cacheDocRef.set({ data: fresh, updated_at: new Date().toISOString() });
        } catch (err) {
          console.warn("Trends v2 background refresh failed:", err);
        }
      })();
    }
    return NextResponse.json({ ...cached.data, cached: true, _cachedAt: new Date(cached.updated_at).getTime() });
  }

  const fresh = await generateFreshData(mpName, constituencyName, region, keywords);
  if (!fresh) {
    return NextResponse.json(
      {
        trendingSearches: [],
        interestOverTime: [],
        regionalVsNational: [],
        source: "Google Trends (via google-trends-api, last published 2020-12-28)",
        sourceUrl: "https://trends.google.com",
        note: "No cached data available and upstream fetch failed.",
        keywordsUsed: keywords,
        mpName,
        constituencyName,
        error: "Failed to fetch",
      },
      { status: 500 }
    );
  }

  const cachedAt = Date.now();
  try {
    await cacheDocRef.set({ data: fresh, updated_at: new Date(cachedAt).toISOString() });
  } catch (err) {
    console.warn("Trends cache write failed (returning fresh anyway):", err);
  }

  return NextResponse.json({ ...fresh, _cachedAt: cachedAt });
}
