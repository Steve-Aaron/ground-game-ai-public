import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireConstituencyAccess } from "@/lib/guards";
import { consumeApifyRun } from "@/lib/apify-budget";
import { partyColor } from "@/lib/palette";

// Force dynamic — needs runtime env vars (APIFY_API_TOKEN)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Opposition Tracker feed. The people watched are defined per constituency
// by admins via /api/opposition-people (blank by default — no hardcoded
// candidate lists). Recent X posts come from Apify, drawing on the SAME
// per-constituency budget as the Social Media Tracker (src/lib/apify-budget).

const PEOPLE_COLLECTION = "opposition_people";
const CACHE_COLLECTION = "opposition_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const POSTS_PER_PERSON = 5;

const APIFY_ACTOR = "apidojo~twitter-scraper-lite";
const APIFY_BASE = "https://api.apify.com/v2/acts";

interface OppositionPerson {
  id: string;
  name: string;
  party: string;
  handle: string;
  role: string;
}

interface OpponentPost {
  text: string;
  date: string;
  likes: number;
  retweets: number;
  url: string;
}

interface Opponent {
  party: string;
  candidate: string;
  handle: string;
  role: string;
  recentPosts: OpponentPost[];
  activityLevel: "high" | "medium" | "low" | "unknown";
  color: string;
}

interface CachePayload {
  opponents: Opponent[];
  updatedAt: string;
}

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
  url?: string;
  id_str?: string;
  id?: string;
  tweetUrl?: string;
}

function toOpponent(person: OppositionPerson, posts: OpponentPost[]): Opponent {
  return {
    party: person.party,
    candidate: person.name,
    handle: person.handle,
    role: person.role,
    recentPosts: posts.slice(0, 3),
    activityLevel:
      posts.length > 4 ? "high" : posts.length > 1 ? "medium" : posts.length > 0 ? "low" : person.handle ? "low" : "unknown",
    color: partyColor(person.party),
  };
}

async function fetchPersonPosts(person: OppositionPerson, token: string): Promise<OpponentPost[]> {
  if (!person.handle) return [];
  const res = await fetch(
    `${APIFY_BASE}/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: [`from:${person.handle}`],
        maxItems: POSTS_PER_PERSON,
        sort: "Latest",
      }),
    }
  );
  if (!res.ok) throw new Error(`Apify returned ${res.status} for @${person.handle}`);

  const tweets = (await res.json()) as ApifyTweet[];
  return tweets
    .filter((t) => (t.full_text || t.text || "").length > 0)
    .map((t) => ({
      text: (t.full_text || t.text || "").slice(0, 280),
      date: t.created_at || t.createdAt || "",
      likes: t.favorite_count ?? t.favoriteCount ?? t.likeCount ?? 0,
      retweets: t.retweet_count ?? t.retweetCount ?? 0,
      url: t.tweetUrl || t.url || (t.id_str || t.id ? `https://x.com/i/status/${t.id_str || t.id}` : `https://x.com/${person.handle}`),
    }));
}

export async function GET(request: Request) {
  const guard = await requireConstituencyAccess(request);
  if (guard instanceof NextResponse) return guard;
  const { slug } = guard;

  try {
    const db = adminDb();
    const peopleSnap = await db.collection(PEOPLE_COLLECTION).doc(slug).get();
    const people =
      ((peopleSnap.data() as { people?: OppositionPerson[] } | undefined)?.people ?? []);

    // Blank until an admin defines people for this constituency.
    if (people.length === 0) {
      return NextResponse.json({
        opponents: [],
        configured: false,
        lastUpdated: new Date().toISOString(),
        source: "unconfigured" as const,
      });
    }

    const cacheRef = db.collection(CACHE_COLLECTION).doc(slug);
    const cached = (await cacheRef.get()).data() as CachePayload | undefined;
    const cacheAge = cached ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
    const cachedNames = (cached?.opponents ?? []).map((o) => o.candidate.toLowerCase()).sort().join(",");
    const wantedNames = people.map((p) => p.name.toLowerCase()).sort().join(",");
    const listChanged = cachedNames !== wantedNames;

    const token = process.env.APIFY_API_TOKEN;
    const trackable = people.filter((p) => p.handle);
    const needsRefresh = listChanged || cacheAge > CACHE_TTL_MS;

    // No handles to monitor (or no token): people-only view, no Apify spend.
    if (trackable.length === 0 || !token) {
      return NextResponse.json({
        opponents: people.map((p) => toOpponent(p, [])),
        configured: true,
        lastUpdated: new Date().toISOString(),
        source: "people_only" as const,
      });
    }

    if (!needsRefresh && cached) {
      return NextResponse.json({
        opponents: cached.opponents,
        configured: true,
        lastUpdated: cached.updatedAt,
        source: "cache" as const,
      });
    }

    const budget = await consumeApifyRun(slug, trackable.length * POSTS_PER_PERSON);
    if (!budget.allowed) {
      return NextResponse.json({
        opponents: cached?.opponents ?? people.map((p) => toOpponent(p, [])),
        configured: true,
        lastUpdated: cached?.updatedAt ?? new Date().toISOString(),
        source: "cache" as const,
        limitReached: true,
      });
    }

    const settled = await Promise.allSettled(
      people.map((p) => fetchPersonPosts(p, token))
    );
    const opponents = people.map((p, i) =>
      toOpponent(p, settled[i].status === "fulfilled" ? (settled[i] as PromiseFulfilledResult<OpponentPost[]>).value : [])
    );

    const payload: CachePayload = { opponents, updatedAt: new Date().toISOString() };
    await cacheRef.set(payload);

    return NextResponse.json({
      opponents,
      configured: true,
      lastUpdated: payload.updatedAt,
      source: "apify" as const,
      limits: budget.limits,
    });
  } catch (err) {
    console.error("Opposition tracker failed:", err);
    return NextResponse.json(
      { error: `Opposition tracker failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
