import { NextResponse } from "next/server";
import { searchTweets } from "@/lib/apify-twitter";
import { getFullData } from "@/data";
import { requireConstituencyAccess } from "@/lib/guards";

// Force dynamic — needs runtime env vars (APIFY_API_TOKEN)
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Apify sync calls can take up to 25s

// Social media mentions feed for the MP
// Primary: X/Twitter API (when X_BEARER_TOKEN is configured)
// Fallback: Apify Twitter scraper (when APIFY_API_TOKEN is configured)
// Final fallback: static sample data

interface SocialMention {
  text: string;
  author: string;
  authorHandle: string;
  url: string;
  date: string;
  platform: "x" | "bluesky" | "other";
  likes: number;
  retweets: number;
  isVerified: boolean;
}

export async function GET(request: Request) {
  // __AUTH_GUARD__
  const __guard = await requireConstituencyAccess(request);
  if (__guard instanceof NextResponse) return __guard;
  const { searchParams } = new URL(request.url);
  const constituencySlug = searchParams.get("constituency") ?? "";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  if (!constituencyData.mp) {
    return Response.json(
      { error: "MP data not available for this constituency" },
      { status: 400 }
    );
  }

  const MP_NAME = constituencyData.mp.name;
  const MP_HANDLE = constituencyData.mp.twitter; // null for ~50% of MPs — search degrades to name-only

  const hasXToken = !!process.env.X_BEARER_TOKEN;
  const hasApifyToken = !!process.env.APIFY_API_TOKEN;
  const apifyTokenPrefix = process.env.APIFY_API_TOKEN?.substring(0, 8) || "none";

  console.log(`[mentions] env check: X_BEARER_TOKEN=${hasXToken}, APIFY_API_TOKEN=${hasApifyToken} (prefix: ${apifyTokenPrefix}...), constituency=${constituencySlug}, mp=${MP_NAME}, handle=${MP_HANDLE ?? "(none)"}`);

  // Try X API first
  if (process.env.X_BEARER_TOKEN) {
    try {
      const mentions = await fetchFromXApi(MP_NAME, MP_HANDLE);
      if (mentions.length > 0) {
        return NextResponse.json({
          mentions,
          total: mentions.length,
          source: "x_api",
        });
      }
    } catch (err) {
      console.error("X API error:", err);
    }
  }

  // Try Apify Twitter scraper
  if (process.env.APIFY_API_TOKEN) {
    try {
      console.log("[mentions] Attempting Apify fetch...");
      const mentions = await fetchFromApify(MP_NAME, MP_HANDLE);
      console.log(`[mentions] Apify returned ${mentions.length} mentions`);
      if (mentions.length > 0) {
        return NextResponse.json({
          mentions,
          total: mentions.length,
          source: "apify",
        });
      }
      // Apify returned 0 results — still report it tried
      return NextResponse.json({
        mentions: [],
        total: 0,
        source: "apify_empty",
        message: "Apify connected but no recent mentions found",
      });
    } catch (err) {
      console.error("Apify error:", err);
      return NextResponse.json({
        mentions: [],
        total: 0,
        source: "apify_error",
        message: `Apify error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // No API keys configured — return unavailable state (no fake data)
  return NextResponse.json({
    mentions: [],
    total: 0,
    source: "unavailable",
    message: `Social monitoring requires API configuration. X=${hasXToken}, Apify=${hasApifyToken}`,
  });
}

async function fetchFromXApi(mpName: string, mpHandle: string | null): Promise<SocialMention[]> {
  // If MP has no Twitter handle, fall back to name-only search.
  const queryString = mpHandle
    ? `@${mpHandle} OR "${mpName}" -is:retweet`
    : `"${mpName}" -is:retweet`;
  const query = encodeURIComponent(queryString);
  const url = `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=20&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=name,username,verified`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
    },
    next: { revalidate: 900 },
  });

  if (!res.ok) throw new Error(`X API: ${res.status}`);

  const data = await res.json();
  const users = new Map<string, { name: string; username: string; verified: boolean }>();

  for (const user of data.includes?.users || []) {
    users.set(user.id, {
      name: user.name,
      username: user.username,
      verified: user.verified || false,
    });
  }

  return (data.data || []).map((tweet: {
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    public_metrics: { like_count: number; retweet_count: number };
  }) => {
    const author = users.get(tweet.author_id);
    return {
      text: tweet.text,
      author: author?.name || "Unknown",
      authorHandle: author?.username || "",
      url: `https://x.com/${author?.username || "i"}/status/${tweet.id}`,
      date: tweet.created_at,
      platform: "x" as const,
      likes: tweet.public_metrics?.like_count || 0,
      retweets: tweet.public_metrics?.retweet_count || 0,
      isVerified: author?.verified || false,
    };
  });
}

async function fetchFromApify(mpName: string, mpHandle: string | null): Promise<SocialMention[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  // Handle + name search when the MP has a handle, name-only otherwise.
  const query = mpHandle ? `@${mpHandle} OR "${mpName}"` : `"${mpName}"`;

  try {
    const tweets = await searchTweets(query, 20, token);
    return tweets.map((t) => ({
      text: t.text,
      author: t.author.name,
      authorHandle: t.author.handle,
      url: t.url,
      date: t.date || new Date().toISOString(),
      platform: "x" as const,
      likes: t.likes,
      retweets: t.retweets,
      isVerified: t.author.verified,
    }));
  } catch (err) {
    console.error("[mentions] Apify search failed:", err);
    return [];
  }
}

