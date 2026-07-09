import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireConstituencyAccess } from "@/lib/guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Social feed for a constituency's tracked X accounts, via Apify.
//
// ── HARD BUDGET LIMITS ──────────────────────────────────────────────────
// Budget: max $5/month/constituency. apidojo/twitter-scraper-lite bills
// ~$0.40 per 1,000 posts. Worst case with the limits below:
//   120 runs/month × 5 accounts × 10 posts = 6,000 posts ≈ $2.40/month
// (less than half the budget, leaving headroom for pricing changes).
// Limits are enforced server-side per constituency via a Firestore usage
// doc; when a limit is hit the cached feed is served instead — Apify is
// never called past the cap.
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // min gap between refreshes: 4h
const MAX_RUNS_PER_DAY = 6;
const MAX_RUNS_PER_MONTH = 120;
const POSTS_PER_ACCOUNT = 10;

const APIFY_ACTOR = "apidojo~twitter-scraper-lite";
const APIFY_BASE = "https://api.apify.com/v2/acts";

const TRACKING_COLLECTION = "social_tracking";
const CACHE_COLLECTION = "social_feed_cache";
const USAGE_COLLECTION = "social_usage";

interface TrackedAccount {
  handle: string;
  addedBy: string;
  addedAt: string;
}

export interface SocialPost {
  text: string;
  date: string;
  likes: number;
  retweets: number;
  url: string;
}

export interface SocialProfile {
  handle: string;
  name: string;
  avatar: string;
  followers: number | null;
  posts: SocialPost[];
}

interface FeedPayload {
  profiles: SocialProfile[];
  updatedAt: string;
}

interface UsageDoc {
  month: string; // YYYY-MM — doc resets when the month rolls over
  runs: number;
  posts: number;
  days: Record<string, number>; // YYYY-MM-DD → runs that day
}

// Apify tweet shape — field names vary between actor versions, read
// defensively (same approach as /api/opposition).
interface ApifyTweet {
  full_text?: string;
  text?: string;
  created_at?: string;
  createdAt?: string;
  favorite_count?: number;
  favoriteCount?: number;
  likeCount?: number;
  retweet_count?: number;
  retweetCount?: number;
  tweetUrl?: string;
  url?: string;
  id?: string;
  id_str?: string;
  author?: {
    name?: string;
    userName?: string;
    screen_name?: string;
    profilePicture?: string;
    profile_image_url_https?: string;
    followers?: number;
    followersCount?: number;
  };
}

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}
function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function fetchAccountPosts(handle: string, token: string): Promise<SocialProfile> {
  const res = await fetch(
    `${APIFY_BASE}/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: [`from:${handle}`],
        maxItems: POSTS_PER_ACCOUNT,
        sort: "Latest",
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify returned ${res.status} for @${handle}: ${body.slice(0, 300)}`);
  }

  const tweets = (await res.json()) as ApifyTweet[];
  const valid = tweets.filter((t) => (t.full_text || t.text || "").length > 0);
  const author = valid[0]?.author;

  return {
    handle,
    name: author?.name || handle,
    avatar: author?.profilePicture || author?.profile_image_url_https || "",
    followers: author?.followers ?? author?.followersCount ?? null,
    posts: valid.slice(0, POSTS_PER_ACCOUNT).map((t) => ({
      text: (t.full_text || t.text || "").slice(0, 500),
      date: t.created_at || t.createdAt || "",
      likes: t.favorite_count ?? t.favoriteCount ?? t.likeCount ?? 0,
      retweets: t.retweet_count ?? t.retweetCount ?? 0,
      url: t.tweetUrl || t.url || (t.id_str || t.id ? `https://x.com/i/status/${t.id_str || t.id}` : `https://x.com/${handle}`),
    })),
  };
}

export async function GET(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  try {
    const db = adminDb();
    const trackingSnap = await db.collection(TRACKING_COLLECTION).doc(slug).get();
    const accounts = ((trackingSnap.data() as { accounts?: TrackedAccount[] } | undefined)?.accounts ?? []);
    if (accounts.length === 0) {
      return NextResponse.json({ profiles: [], updatedAt: null, limits: null });
    }

    const cacheRef = db.collection(CACHE_COLLECTION).doc(slug);
    const usageRef = db.collection(USAGE_COLLECTION).doc(slug);
    const [cacheSnap, usageSnap] = await Promise.all([cacheRef.get(), usageRef.get()]);

    const cached = cacheSnap.data() as FeedPayload | undefined;
    const cacheAge = cached ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
    // Stale cache is fine when the tracked list hasn't changed; a changed
    // list invalidates so newly added accounts appear without waiting 4h.
    const cachedHandles = (cached?.profiles ?? []).map((p) => p.handle.toLowerCase()).sort().join(",");
    const wantedHandles = accounts.map((a) => a.handle.toLowerCase()).sort().join(",");
    const listChanged = cachedHandles !== wantedHandles;

    let usage = (usageSnap.data() as UsageDoc | undefined) ?? { month: monthKey(), runs: 0, posts: 0, days: {} };
    if (usage.month !== monthKey()) {
      usage = { month: monthKey(), runs: 0, posts: 0, days: {} };
    }
    const runsToday = usage.days[dayKey()] ?? 0;

    const limits = {
      runsToday,
      maxRunsPerDay: MAX_RUNS_PER_DAY,
      runsThisMonth: usage.runs,
      maxRunsPerMonth: MAX_RUNS_PER_MONTH,
      cacheTtlHours: CACHE_TTL_MS / 3600000,
    };

    const debug = new URL(request.url).searchParams.get("debug") === "1";
    const withinBudget = runsToday < MAX_RUNS_PER_DAY && usage.runs < MAX_RUNS_PER_MONTH;
    const needsRefresh = debug || listChanged || cacheAge > CACHE_TTL_MS;
    const token = process.env.APIFY_API_TOKEN;

    if (!needsRefresh || !withinBudget || !token) {
      return NextResponse.json({
        ...(cached ?? { profiles: [], updatedAt: null }),
        limits,
        limitReached: needsRefresh && !withinBudget,
        source: "cache",
      });
    }

    // Count the run BEFORE calling Apify — a crash mid-run still consumes
    // budget, which is the safe direction for a hard spend cap.
    usage.runs += 1;
    usage.days[dayKey()] = runsToday + 1;
    usage.posts += accounts.length * POSTS_PER_ACCOUNT;
    await usageRef.set(usage);

    const settled = await Promise.allSettled(
      accounts.map((a) => fetchAccountPosts(a.handle, token))
    );
    const profiles: SocialProfile[] = settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { handle: accounts[i].handle, name: accounts[i].handle, avatar: "", followers: null, posts: [] }
    );
    const failures = debug
      ? settled
          .map((r, i) => (r.status === "rejected" ? { handle: accounts[i].handle, reason: String(r.reason).slice(0, 400) } : null))
          .filter(Boolean)
      : undefined;

    const payload: FeedPayload = { profiles, updatedAt: new Date().toISOString() };
    await cacheRef.set(payload);

    return NextResponse.json({
      ...payload,
      limits: { ...limits, runsToday: runsToday + 1, runsThisMonth: usage.runs },
      limitReached: false,
      source: "live",
      ...(failures ? { failures } : {}),
    });
  } catch (err) {
    console.error("Social feed failed:", err);
    return NextResponse.json(
      { error: `Social feed failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
