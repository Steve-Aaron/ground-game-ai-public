"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  BadgeCheck,
  BarChart2,
  ExternalLink,
  Heart,
  MessageCircle,
  Plus,
  Repeat2,
  Play,
  X,
} from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "@/components/ui/PanelSkeleton";
import PanelEmpty from "@/components/ui/PanelEmpty";
import PanelError from "@/components/ui/PanelError";
import { formatCompactNumber, formatTimeAgoShort } from "@/lib/format";

// Mirrors src/lib/apify-twitter.ts shapes via the /api/social-feed response.
interface TweetMedia {
  type: "photo" | "video" | "gif";
  url: string;
}
interface Tweet {
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
interface SocialProfile {
  handle: string;
  name: string;
  avatar: string;
  followers: number | null;
  posts: Tweet[];
}
interface FeedResponse {
  profiles: SocialProfile[];
  updatedAt: string | null;
  limitReached?: boolean;
  limits?: { runsToday: number; maxRunsPerDay: number; runsThisMonth: number; maxRunsPerMonth: number } | null;
}
interface TrackedAccount {
  handle: string;
  addedBy: string;
  addedAt: string;
}

const engagement = (t: Tweet) => t.likes + t.retweets * 2 + t.replies;

/** Manage the tracked-handle list (max enforced server-side). */
function AccountManager({ onChanged }: { onChanged: () => void }) {
  const { slug } = useConstituency();
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [max, setMax] = useState(5);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(withConstituency("/api/social-accounts", slug))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { accounts: TrackedAccount[]; max: number }) => {
        setAccounts(d.accounts);
        setMax(d.max);
      })
      .catch(() => {});
  }, [slug]);

  async function mutate(method: "POST" | "DELETE", handle: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const path =
        method === "DELETE"
          ? `/api/social-accounts?handle=${encodeURIComponent(handle)}`
          : "/api/social-accounts";
      const res = await fetch(withConstituency(path, slug), {
        method,
        ...(method === "POST"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle }) }
          : {}),
      });
      const data = (await res.json().catch(() => null)) as
        | { accounts?: TrackedAccount[]; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setAccounts(data?.accounts ?? []);
      setInput("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-component="socialAccountManager" className="px-4 py-2.5 border-b border-border/50 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.5rem] uppercase tracking-wider text-zinc-500 mr-1">
          Tracked ({accounts.length}/{max})
        </span>
        {accounts.map((a) => (
          <span
            key={a.handle}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 border border-border text-[0.611rem] text-foreground"
          >
            @{a.handle}
            <button
              onClick={() => mutate("DELETE", a.handle)}
              aria-label={`Stop tracking @${a.handle}`}
              className="text-zinc-500 hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {accounts.length < max ? (
          <form
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) mutate("POST", input);
            }}
          >
            <span className="relative">
              <AtSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="username"
                className="w-32 rounded-full bg-muted/40 border border-border text-[0.611rem] text-foreground pl-6 pr-2 py-1 placeholder:text-zinc-600"
              />
            </span>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Track account"
              className="p-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          </form>
        ) : null}
      </div>
      {error ? <p className="text-[0.611rem] text-red-400">{error}</p> : null}
    </div>
  );
}

/** X-style account switcher — avatar tabs. */
function AccountTabs({
  profiles,
  active,
  onSelect,
}: {
  profiles: SocialProfile[];
  active: string;
  onSelect: (handle: string) => void;
}) {
  return (
    <div data-component="socialAccountTabs" className="flex items-center gap-1 px-3 py-2 border-b border-border/50 overflow-x-auto">
      {profiles.map((p) => {
        const selected = p.handle === active;
        return (
          <button
            key={p.handle}
            onClick={() => onSelect(p.handle)}
            className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full transition-colors shrink-0 ${
              selected ? "bg-muted text-foreground" : "text-zinc-500 hover:bg-muted/50"
            }`}
          >
            <Avatar profile={p} size="h-6 w-6" />
            <span className="text-[0.611rem] font-medium">@{p.handle}</span>
          </button>
        );
      })}
    </div>
  );
}

function Avatar({ profile, size }: { profile: SocialProfile; size: string }) {
  return profile.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatar} alt="" className={`${size} rounded-full object-cover`} />
  ) : (
    <span className={`${size} rounded-full bg-muted flex items-center justify-center text-[0.611rem] font-bold text-zinc-400`}>
      {profile.handle.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Analytics strip: profile header + averages for the selected account. */
function ProfileAnalytics({ profile }: { profile: SocialProfile }) {
  const stats = useMemo(() => {
    const n = profile.posts.length || 1;
    const totals = profile.posts.reduce(
      (acc, t) => ({
        likes: acc.likes + t.likes,
        rts: acc.rts + t.retweets,
        replies: acc.replies + t.replies,
        views: acc.views + (t.views ?? 0),
      }),
      { likes: 0, rts: 0, replies: 0, views: 0 }
    );
    return {
      avgLikes: Math.round(totals.likes / n),
      avgRts: Math.round(totals.rts / n),
      avgReplies: Math.round(totals.replies / n),
      totalViews: totals.views,
      posts: profile.posts.length,
    };
  }, [profile]);

  return (
    <div data-component="socialProfileAnalytics" className="px-4 py-3 border-b border-border/50">
      <div className="flex items-center gap-3">
        <Avatar profile={profile} size="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <a
            href={`https://x.com/${profile.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1"
          >
            <span className="text-sm font-bold text-foreground truncate group-hover:underline">
              {profile.name}
            </span>
            <BadgeCheck className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          </a>
          <p className="text-[0.611rem] text-zinc-500">
            @{profile.handle} · {formatCompactNumber(profile.followers)} followers
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3">
        {[
          { label: "Posts shown", value: String(stats.posts) },
          { label: "Avg likes", value: formatCompactNumber(stats.avgLikes) },
          { label: "Avg reposts", value: formatCompactNumber(stats.avgRts) },
          { label: "Views (total)", value: stats.totalViews > 0 ? formatCompactNumber(stats.totalViews) : "—" },
        ].map((s) => (
          <div key={s.label} className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
            <div className="text-xs font-bold text-foreground">{s.value}</div>
            <div className="text-[0.5rem] uppercase tracking-wider text-zinc-600">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Single tweet, X dark-mode style, with relative-performance bar. */
function TweetCard({
  tweet,
  profile,
  maxEngagement,
  avgEngagement,
}: {
  tweet: Tweet;
  profile: SocialProfile;
  maxEngagement: number;
  avgEngagement: number;
}) {
  const score = engagement(tweet);
  const relWidth = maxEngagement > 0 ? Math.max(2, Math.round((score / maxEngagement) * 100)) : 0;
  const multiple = avgEngagement > 0 ? score / avgEngagement : 0;

  return (
    <article data-component="tweetCard" className="px-4 py-3 hover:bg-muted/20 transition-colors">
      <div className="flex gap-2.5">
        <Avatar profile={profile} size="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-center gap-1 text-[0.667rem]">
            <span className="font-bold text-foreground truncate">{profile.name}</span>
            <span className="text-zinc-500 truncate">@{profile.handle}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500 shrink-0">{tweet.date ? formatTimeAgoShort(tweet.date) : ""}</span>
            <a
              href={tweet.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on X"
              className="ml-auto text-zinc-600 hover:text-sky-400 shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Body */}
          <a href={tweet.url} target="_blank" rel="noopener noreferrer" className="block group">
            <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line mt-0.5 group-hover:text-foreground">
              {tweet.text}
            </p>
          </a>

          {/* Media grid */}
          {tweet.media.length > 0 ? (
            <a
              href={tweet.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 grid gap-0.5 rounded-2xl overflow-hidden border border-border/60 ${
                tweet.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {tweet.media.map((m, i) => (
                <span key={i} className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt=""
                    loading="lazy"
                    className={`w-full object-cover ${tweet.media.length === 1 ? "max-h-64" : "h-28"}`}
                  />
                  {m.type !== "photo" ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-9 w-9 rounded-full bg-black/70 flex items-center justify-center">
                        <Play className="h-4 w-4 text-white fill-white" />
                      </span>
                    </span>
                  ) : null}
                </span>
              ))}
            </a>
          ) : null}

          {/* Metrics */}
          <div className="flex items-center gap-5 mt-2 text-[0.611rem] text-zinc-500">
            <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatCompactNumber(tweet.replies)}</span>
            <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" />{formatCompactNumber(tweet.retweets)}</span>
            <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{formatCompactNumber(tweet.likes)}</span>
            <span className="flex items-center gap-1"><BarChart2 className="h-3 w-3" />{formatCompactNumber(tweet.views)}</span>
          </div>

          {/* Relative performance vs this account's other tweets */}
          <div
            data-component="tweetPerformance"
            className="flex items-center gap-2 mt-1.5"
            title="Engagement (likes + 2×reposts + replies) relative to this account's best shown post"
          >
            <div className="flex-1 h-1 rounded-full bg-muted/60 overflow-hidden">
              <div
                className={`h-full rounded-full ${multiple >= 1 ? "bg-sky-500" : "bg-zinc-600"}`}
                style={{ width: `${relWidth}%` }}
              />
            </div>
            <span className={`text-[0.5rem] tabular-nums shrink-0 ${multiple >= 1 ? "text-sky-400" : "text-zinc-600"}`}>
              {multiple > 0 ? `${multiple.toFixed(1)}× avg` : "—"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Social media tracker — up to 5 X accounts per constituency, X-style feed.
 * Refreshes are hard-capped server-side (see /api/social-feed) to stay
 * inside the shared Apify budget.
 */
export default function SocialTrackerPanel() {
  const { data, loading, error, refetch } = useConstituencyResource<FeedResponse>("/api/social-feed");
  // Normalise pre-redesign cached posts (no media/replies/views/id fields).
  const profiles = useMemo(
    () =>
      (data?.profiles ?? []).map((p) => ({
        ...p,
        posts: (p.posts ?? []).map((t) => ({
          ...t,
          id: t.id ?? "",
          replies: t.replies ?? 0,
          views: t.views ?? null,
          media: t.media ?? [],
        })),
      })),
    [data]
  );
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  const active =
    profiles.find((p) => p.handle === activeHandle) ?? profiles[0] ?? null;

  const { maxEngagement, avgEngagement } = useMemo(() => {
    const posts = active?.posts ?? [];
    if (posts.length === 0) return { maxEngagement: 0, avgEngagement: 0 };
    const scores = posts.map(engagement);
    return {
      maxEngagement: Math.max(...scores),
      avgEngagement: scores.reduce((a, b) => a + b, 0) / scores.length,
    };
  }, [active]);

  return (
    <div data-component="socialTrackerPanel">
      <AccountManager onChanged={refetch} />

      {loading ? (
        <PanelSkeleton variant="avatarList" rows={4} />
      ) : error ? (
        <PanelError message="Unable to load social feed" onRetry={refetch} />
      ) : profiles.length === 0 ? (
        <PanelEmpty
          icon={AtSign}
          title="No accounts tracked"
          description="Track up to 5 X accounts to see their latest posts here."
        />
      ) : (
        <>
          {profiles.length > 1 ? (
            <AccountTabs
              profiles={profiles}
              active={active?.handle ?? ""}
              onSelect={setActiveHandle}
            />
          ) : null}
          {active ? (
            <>
              <ProfileAnalytics profile={active} />
              <div data-component="tweetFeed" className="divide-y divide-border/40 max-h-[34rem] overflow-y-auto">
                {active.posts.map((tweet) => (
                  <TweetCard
                    key={tweet.id || tweet.url}
                    tweet={tweet}
                    profile={active}
                    maxEngagement={maxEngagement}
                    avgEngagement={avgEngagement}
                  />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {/* Usage / freshness strip */}
      {data?.updatedAt ? (
        <div className="px-3 py-1.5 flex items-center justify-between border-t border-border/50">
          <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">
            Updated {formatTimeAgoShort(data.updatedAt)} ago
            {data.limitReached ? " · refresh budget reached — showing cached" : ""}
          </span>
          {data.limits ? (
            <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">
              {data.limits.runsToday}/{data.limits.maxRunsPerDay} today · {data.limits.runsThisMonth}/{data.limits.maxRunsPerMonth} this month
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
