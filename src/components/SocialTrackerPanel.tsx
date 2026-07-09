"use client";

import { useEffect, useState } from "react";
import { AtSign, ExternalLink, Plus, X } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "@/components/ui/PanelSkeleton";
import PanelEmpty from "@/components/ui/PanelEmpty";
import PanelError from "@/components/ui/PanelError";
import { formatTimeAgo } from "@/lib/format";

// Mirrors the route types in src/app/api/social-feed/route.ts.
interface SocialPost {
  text: string;
  date: string;
  likes: number;
  retweets: number;
  url: string;
}
interface SocialProfile {
  handle: string;
  name: string;
  avatar: string;
  followers: number | null;
  posts: SocialPost[];
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

const POSTS_SHOWN = 3;

function formatFollowers(n: number | null): string | null {
  if (n === null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K followers`;
  return `${n} followers`;
}

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
    <div data-component="socialAccountManager" className="px-4 py-3 border-b border-border/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.5rem] uppercase tracking-wider text-zinc-500">
          Tracked accounts ({accounts.length}/{max})
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {accounts.map((a) => (
          <span
            key={a.handle}
            className="inline-flex items-center gap-1 px-2 py-1 bg-muted/50 border border-border text-[0.611rem] text-foreground"
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
        {accounts.length === 0 ? (
          <span className="text-[0.611rem] text-zinc-600">No accounts tracked yet</span>
        ) : null}
      </div>

      {accounts.length < max ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) mutate("POST", input);
          }}
        >
          <div className="relative flex-1">
            <AtSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="X username, e.g. Nigel_Farage"
              className="w-full bg-muted/40 border border-border text-xs text-foreground pl-6 pr-2 py-1.5 placeholder:text-zinc-600"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[0.611rem] uppercase tracking-wider font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Track
          </button>
        </form>
      ) : null}

      {error ? <p className="text-[0.611rem] text-red-400">{error}</p> : null}
    </div>
  );
}

function ProfileCard({ profile }: { profile: SocialProfile }) {
  const followers = formatFollowers(profile.followers);
  return (
    <article data-component="socialProfileCard" className="border border-border bg-muted/20 p-3 space-y-2">
      <a
        href={`https://x.com/${profile.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 group"
      >
        {profile.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-zinc-400">
            {profile.handle.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-xs font-medium text-foreground truncate group-hover:text-emerald-400 transition-colors">
            {profile.name}
          </span>
          <span className="block text-[0.611rem] text-zinc-500 truncate">
            @{profile.handle}
            {followers ? ` · ${followers}` : ""}
          </span>
        </span>
      </a>

      {profile.posts.length === 0 ? (
        <p className="text-[0.611rem] text-zinc-600">No recent posts found</p>
      ) : (
        <ul className="space-y-2">
          {profile.posts.slice(0, POSTS_SHOWN).map((post) => (
            <li key={post.url} className="border-t border-border/40 pt-2">
              <a href={post.url} target="_blank" rel="noopener noreferrer" className="block group">
                <p className="text-[0.667rem] text-zinc-300 line-clamp-3 group-hover:text-foreground transition-colors">
                  {post.text}
                </p>
                <p className="text-[0.5rem] text-zinc-600 uppercase tracking-wider mt-1">
                  {post.date ? formatTimeAgo(post.date) : ""} · {post.likes} likes · {post.retweets} RTs
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * Social media tracker — up to 5 X accounts per constituency. Feed refreshes
 * are hard-capped server-side (see /api/social-feed) to stay inside the
 * $5/month/constituency Apify budget.
 */
export default function SocialTrackerPanel() {
  const { data, loading, error, refetch } = useConstituencyResource<FeedResponse>("/api/social-feed");
  const profiles = data?.profiles ?? [];

  return (
    <div data-component="socialTrackerPanel">
      <AccountManager onChanged={refetch} />

      {loading ? (
        <PanelSkeleton variant="avatarList" rows={3} />
      ) : error ? (
        <PanelError message="Unable to load social feed" onRetry={refetch} />
      ) : profiles.length === 0 ? (
        <PanelEmpty
          icon={AtSign}
          title="No accounts tracked"
          description="Track up to 5 X accounts to see their latest posts here."
        />
      ) : (
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {profiles.map((p) => (
            <ProfileCard key={p.handle} profile={p} />
          ))}
        </div>
      )}

      {/* Usage / freshness strip */}
      {data?.updatedAt ? (
        <div className="px-3 py-1.5 flex items-center justify-between border-t border-border/50">
          <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">
            Updated {formatTimeAgo(data.updatedAt)}
            {data.limitReached ? " · refresh budget reached — showing cached" : ""}
          </span>
          {data.limits ? (
            <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider flex items-center gap-1">
              {data.limits.runsToday}/{data.limits.maxRunsPerDay} today ·{" "}
              {data.limits.runsThisMonth}/{data.limits.maxRunsPerMonth} this month
              <ExternalLink className="h-2.5 w-2.5 opacity-0" aria-hidden />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
