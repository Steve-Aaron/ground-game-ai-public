"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Users, UserX } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import { useMe } from "@/hooks/useMe";
import PanelEmpty from "./ui/PanelEmpty";
import PanelError from "./ui/PanelError";
import PanelSkeleton from "./ui/PanelSkeleton";
import { Select, TextInput, FormError } from "./ui/FormField";
import { ActionButton, TextButton } from "./ui/ActionButton";
import { UpdatedFooter } from "./ui/PanelFooter";
import { Avatar, TweetCard, tweetEngagement } from "./ui/TweetCard";
import { formatCompactNumber, formatTimeAgo } from "@/lib/format";
import { PARTY_OPTIONS } from "@/lib/palette";
import type { Tweet, TwitterProfile } from "@/lib/apify-twitter";
import type { Opponent } from "@/app/api/opposition/route";

// The ONE tracker: watch-list people (admin-managed, max 5) with their
// X activity rendered in the shared X-style TweetCard treatment. Posts come
// from /api/social-feed (single Apify pipeline, budget-capped).

interface OppositionData {
  opponents: Opponent[];
  configured: boolean;
  lastUpdated: string;
}

interface FeedResponse {
  profiles: TwitterProfile[];
  updatedAt: string | null;
  limitReached?: boolean;
  limits?: { runsToday: number; maxRunsPerDay: number; runsThisMonth: number; maxRunsPerMonth: number } | null;
}

// Mirrors src/app/api/opposition-people/route.ts.
interface OppositionPerson {
  id: string;
  name: string;
  party: string;
  handle: string;
  role: string;
}

const POSTS_SHOWN = 5;

function activityFor(posts: Tweet[] | undefined): { dot: string; label: string } {
  if (!posts) return { dot: "⚪", label: "Not monitored" };
  if (posts.length > 10) return { dot: "🔴", label: "High" };
  if (posts.length > 3) return { dot: "🟡", label: "Medium" };
  return { dot: "🟢", label: "Low" };
}

/** Admin-only CRUD for the watch-list (writes are re-checked server-side). */
function PeopleManager({ onChanged }: { onChanged: () => void }) {
  const { slug } = useConstituency();
  const [people, setPeople] = useState<OppositionPerson[]>([]);
  const [name, setName] = useState("");
  const [party, setParty] = useState<string>(PARTY_OPTIONS[0]);
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(withConstituency("/api/opposition-people", slug))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { people: OppositionPerson[] }) => setPeople(d.people))
      .catch(() => {});
  }, [slug]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(withConstituency("/api/opposition-people", slug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, party, handle, role }),
      });
      const data = (await res.json().catch(() => null)) as
        | { people?: OppositionPerson[]; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setPeople(data?.people ?? []);
      setName("");
      setHandle("");
      setRole("");
      onChanged();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(
      withConstituency(`/api/opposition-people?id=${encodeURIComponent(id)}`, slug),
      { method: "DELETE" }
    );
    if (res.ok) {
      const data = (await res.json()) as { people: OppositionPerson[] };
      setPeople(data.people);
      onChanged();
    }
  }

  return (
    <div data-component="oppositionPeopleManager" className="px-4 py-3 border-b border-border/50 space-y-2 bg-muted/20">
      {people.map((p) => (
        <div key={p.id} className="flex items-center justify-between text-[0.611rem]">
          <span className="text-zinc-300 truncate">
            {p.name} <span className="text-zinc-600">· {p.party}{p.handle ? ` · @${p.handle}` : ""}{p.role ? ` · ${p.role}` : ""}</span>
          </span>
          <button
            type="button"
            onClick={() => remove(p.id)}
            aria-label={`Remove ${p.name}`}
            className="text-zinc-500 hover:text-red-400 shrink-0 ml-2"
          >
            <UserX className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {people.length < 5 ? (
        <form onSubmit={add} className="grid grid-cols-2 gap-2 pt-1">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (required)" />
          <Select value={party} onChange={(e) => setParty(e.target.value)} aria-label="Party">
            {PARTY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </Select>
          <TextInput value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="X handle (optional)" />
          <TextInput value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role, e.g. PPC (optional)" />
          <ActionButton type="submit" disabled={busy || !name.trim()} icon={Plus} size="sm" className="col-span-2 py-1.5">
            Add person
          </ActionButton>
        </form>
      ) : (
        <p className="text-[0.611rem] text-zinc-600">Limit of 5 people reached.</p>
      )}

      <FormError message={formError} />
    </div>
  );
}

/** Watch-list person row; expands into their X-style feed. */
function OpponentRow({
  opponent,
  profile,
  expanded,
  onToggle,
}: {
  opponent: Opponent;
  profile: TwitterProfile | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const activity = activityFor(profile?.posts);
  const { maxEngagement, avgEngagement } = useMemo(() => {
    const posts = profile?.posts ?? [];
    if (posts.length === 0) return { maxEngagement: 0, avgEngagement: 0 };
    const scores = posts.map(tweetEngagement);
    return {
      maxEngagement: Math.max(...scores),
      avgEngagement: scores.reduce((a, b) => a + b, 0) / scores.length,
    };
  }, [profile]);

  return (
    <div data-component="opponentRow">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {profile?.avatar ? (
            <Avatar profile={profile} size="h-8 w-8 shrink-0" />
          ) : (
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-[0.611rem] font-bold text-white shrink-0"
              style={{ backgroundColor: opponent.color }}
            >
              {opponent.party.split(" ").map((w) => w[0]).join("").slice(0, 2)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{opponent.candidate}</span>
              <span className="text-[0.611rem]" title={`Activity: ${activity.label}`}>
                {activity.dot}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[0.611rem] text-zinc-500">
              <span style={{ color: opponent.color }}>{opponent.party}</span>
              {opponent.handle ? (
                <>
                  <span>&middot;</span>
                  <span className="text-emerald-500/70">@{opponent.handle}</span>
                </>
              ) : null}
              {profile?.followers != null ? (
                <>
                  <span>&middot;</span>
                  <span>{formatCompactNumber(profile.followers)} followers</span>
                </>
              ) : null}
              {opponent.role ? (
                <>
                  <span>&middot;</span>
                  <span>{opponent.role}</span>
                </>
              ) : null}
            </div>
          </div>

          <svg
            className={`h-4 w-4 text-zinc-600 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded ? (
        profile && profile.posts.length > 0 ? (
          <div data-component="opponentFeed" className="divide-y divide-border/40 border-t border-border/40">
            {profile.posts.slice(0, POSTS_SHOWN).map((tweet) => (
              <TweetCard
                key={tweet.id || tweet.url}
                tweet={tweet}
                profile={profile}
                maxEngagement={maxEngagement}
                avgEngagement={avgEngagement}
              />
            ))}
          </div>
        ) : (
          <div className="ml-11 px-4 pb-3">
            <p className="text-xs text-zinc-600 italic">
              {opponent.handle
                ? "No recent posts found"
                : "No X handle set — add one to enable monitoring"}
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}

export default function OppositionTracker() {
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const { data, loading, error, refetch } = useConstituencyResource<OppositionData>(
    "/api/opposition",
    { errorMessage: "Unable to load opposition data" }
  );
  const feed = useConstituencyResource<FeedResponse>("/api/social-feed");
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  const profileByHandle = useMemo(() => {
    const map = new Map<string, TwitterProfile>();
    for (const p of feed.data?.profiles ?? []) {
      map.set(p.handle.toLowerCase(), {
        ...p,
        posts: (p.posts ?? []).map((t) => ({
          ...t,
          id: t.id ?? "",
          replies: t.replies ?? 0,
          views: t.views ?? null,
          media: t.media ?? [],
        })),
      });
    }
    return map;
  }, [feed.data]);

  function refetchAll() {
    refetch();
    feed.refetch();
  }

  if (loading) return <PanelSkeleton variant="avatarList" rows={4} />;
  if (error && !data) return <PanelError message={error} onRetry={refetchAll} />;
  if (!data) return null;

  const blank = data.opponents.length === 0;

  return (
    <div data-component="oppositionTrackerContainer">
      {isAdmin ? (
        <div data-component="oppositionManageStrip" className="px-4 py-2 border-b border-border/30 flex items-center justify-between">
          <span className="text-[0.5rem] uppercase tracking-wider text-zinc-500">
            Watch-list ({data.opponents.length}/5)
          </span>
          <TextButton
            onClick={() => setManaging((v) => !v)}
            icon={Users}
            className="text-[0.611rem] uppercase tracking-wider text-emerald-500/80"
          >
            {managing ? "Done" : "Manage"}
          </TextButton>
        </div>
      ) : null}

      {managing && isAdmin ? <PeopleManager onChanged={refetchAll} /> : null}

      {blank ? (
        <PanelEmpty
          icon={Users}
          title="No opposition people defined"
          description={
            isAdmin
              ? "Use Manage to add up to 5 people to watch for this constituency."
              : "An admin can define up to 5 people to watch for this constituency."
          }
        />
      ) : (
        <div className="divide-y divide-border/50">
          {data.opponents.map((opponent) => (
            <OpponentRow
              key={opponent.candidate}
              opponent={opponent}
              profile={opponent.handle ? profileByHandle.get(opponent.handle.toLowerCase()) : undefined}
              expanded={expandedName === opponent.candidate}
              onToggle={() =>
                setExpandedName(expandedName === opponent.candidate ? null : opponent.candidate)
              }
            />
          ))}
        </div>
      )}

      <UpdatedFooter
        label={
          <>
            Updated {formatTimeAgo(feed.data?.updatedAt ?? data.lastUpdated)}
            {feed.data?.limitReached ? " · refresh budget reached — showing cached" : ""}
            {feed.data?.limits
              ? ` · ${feed.data.limits.runsToday}/${feed.data.limits.maxRunsPerDay} runs today`
              : ""}
          </>
        }
        onRefresh={refetchAll}
      />
    </div>
  );
}
