// Shared Apify X/Twitter scraping client — the ONLY place that talks to the
// twitter-scraper-lite actor or knows its response shape. Used by
// /api/social-feed and /api/opposition.
//
// NOTE: the Apify REST path needs `user~actor` (a slash 404s silently).

const APIFY_ACTOR = "apidojo~twitter-scraper-lite";
const APIFY_BASE = "https://api.apify.com/v2/acts";

export interface TweetMedia {
  type: "photo" | "video" | "gif";
  /** Image URL — for videos/gifs this is the thumbnail. */
  url: string;
}

export interface Tweet {
  id: string;
  text: string;
  date: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number | null;
  url: string;
  media: TweetMedia[];
}

export interface TwitterProfile {
  handle: string;
  name: string;
  avatar: string;
  followers: number | null;
  posts: Tweet[];
}

// Actor item shape — field names vary between actor versions, so every read
// is defensive across snake_case (v1 API style) and camelCase variants.
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
  reply_count?: number;
  replyCount?: number;
  viewCount?: number;
  view_count?: number;
  url?: string;
  tweetUrl?: string;
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
  extendedEntities?: { media?: ApifyMedia[] };
  extended_entities?: { media?: ApifyMedia[] };
  entities?: { media?: ApifyMedia[] };
}

interface ApifyMedia {
  type?: string; // photo | video | animated_gif
  media_url_https?: string;
  mediaUrlHttps?: string;
  media_url?: string;
  /** Some variants put the preview image here for videos. */
  preview_image_url?: string;
  thumbnailUrl?: string;
}

function mapMedia(t: ApifyTweet): TweetMedia[] {
  const raw =
    t.extendedEntities?.media ?? t.extended_entities?.media ?? t.entities?.media ?? [];
  return raw
    .map((m): TweetMedia | null => {
      const url =
        m.media_url_https ?? m.mediaUrlHttps ?? m.preview_image_url ?? m.thumbnailUrl ?? m.media_url ?? "";
      if (!url) return null;
      const type =
        m.type === "video" ? "video" : m.type === "animated_gif" ? "gif" : "photo";
      return { type, url };
    })
    .filter((m): m is TweetMedia => m !== null)
    .slice(0, 4);
}

function mapTweet(t: ApifyTweet, handle: string): Tweet {
  const id = t.id_str ?? t.id ?? "";
  return {
    id,
    text: (t.full_text || t.text || "").slice(0, 1000),
    date: t.created_at || t.createdAt || "",
    likes: t.favorite_count ?? t.favoriteCount ?? t.likeCount ?? 0,
    retweets: t.retweet_count ?? t.retweetCount ?? 0,
    replies: t.reply_count ?? t.replyCount ?? 0,
    views: t.viewCount ?? t.view_count ?? null,
    url: t.tweetUrl || t.url || (id ? `https://x.com/i/status/${id}` : `https://x.com/${handle}`),
    media: mapMedia(t),
  };
}

/**
 * Fetch an account's latest tweets (profile info comes from the tweets'
 * author object). Throws on non-200 so callers can degrade per account.
 */
export async function fetchTwitterProfile(
  handle: string,
  maxItems: number,
  token: string
): Promise<TwitterProfile> {
  const res = await fetch(
    `${APIFY_BASE}/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: [`from:${handle}`],
        maxItems,
        sort: "Latest",
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify returned ${res.status} for @${handle}: ${body.slice(0, 200)}`);
  }

  const items = (await res.json()) as ApifyTweet[];
  const valid = items.filter((t) => (t.full_text || t.text || "").length > 0);
  const author = valid[0]?.author;

  return {
    handle,
    name: author?.name || handle,
    avatar: author?.profilePicture || author?.profile_image_url_https || "",
    followers: author?.followers ?? author?.followersCount ?? null,
    posts: valid.slice(0, maxItems).map((t) => mapTweet(t, handle)),
  };
}
