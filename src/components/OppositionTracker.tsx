"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Plus, RefreshCw, UserX, Users } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import { useMe } from "@/hooks/useMe";
import PanelEmpty from "./ui/PanelEmpty";
import PanelError from "./ui/PanelError";
import PanelSkeleton from "./ui/PanelSkeleton";
import { formatTimeAgo } from "@/lib/format";

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

interface OppositionData {
  opponents: Opponent[];
  configured: boolean;
  lastUpdated: string;
  source: "apify" | "cache" | "people_only" | "unconfigured";
  limitReached?: boolean;
}

// Mirrors src/app/api/opposition-people/route.ts.
interface OppositionPerson {
  id: string;
  name: string;
  party: string;
  handle: string;
  role: string;
}

const PARTY_OPTIONS = [
  "Reform UK",
  "Labour",
  "Conservative",
  "Liberal Democrats",
  "Green",
  "Restore Britain",
  "SNP",
  "Independent",
  "Other",
];

const ACTIVITY_INDICATORS: Record<string, { dot: string; label: string }> = {
  high: { dot: "🔴", label: "High" },
  medium: { dot: "🟡", label: "Medium" },
  low: { dot: "🟢", label: "Low" },
  unknown: { dot: "⚪", label: "Not monitored" },
};

export default function OppositionTracker() {
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const { data, loading, error, refetch } = useConstituencyResource<OppositionData>(
    "/api/opposition",
    { errorMessage: "Unable to load opposition data" }
  );
  const [expandedParty, setExpandedParty] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  if (loading) return <PanelSkeleton variant="cards" rows={4} />;
  if (error && !data) return <PanelError message={error} onRetry={refetch} />;
  if (!data) return null;

  const blank = data.opponents.length === 0;

  return (
    <div data-component="oppositionTrackerContainer">
      {isAdmin ? (
        <div className="px-4 py-2 border-b border-border/30 flex items-center justify-between">
          <span className="text-[0.5rem] uppercase tracking-wider text-zinc-500">
            Watch-list ({data.opponents.length}/5)
          </span>
          <button
            type="button"
            onClick={() => setManaging((v) => !v)}
            className="text-[0.611rem] uppercase tracking-wider text-emerald-500/80 hover:text-emerald-400 flex items-center gap-1"
          >
            <Users className="h-3 w-3" />
            {managing ? "Done" : "Manage"}
          </button>
        </div>
      ) : null}

      {managing && isAdmin ? <PeopleManager onChanged={refetch} /> : null}

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
        <div className="divide-y divide-zinc-800/50">
          {data.opponents.map((opponent) => (
            <OpponentRow
              key={opponent.candidate}
              opponent={opponent}
              expanded={expandedParty === opponent.candidate}
              onToggle={() =>
                setExpandedParty(expandedParty === opponent.candidate ? null : opponent.candidate)
              }
              emptyPostsMessage={
                opponent.handle
                  ? "No recent posts found"
                  : "No X handle set — add one to enable monitoring"
              }
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between text-[11px] text-zinc-600">
        <span>
          Updated {formatTimeAgo(data.lastUpdated)}
          {data.limitReached ? " · refresh budget reached" : ""}
        </span>
        <button
          type="button"
          onClick={refetch}
          className="text-emerald-500/70 hover:text-emerald-400 flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  );
}

/** Admin-only CRUD for the watch-list (writes are re-checked server-side). */
function PeopleManager({ onChanged }: { onChanged: () => void }) {
  const { slug } = useConstituency();
  const [people, setPeople] = useState<OppositionPerson[]>([]);
  const [name, setName] = useState("");
  const [party, setParty] = useState(PARTY_OPTIONS[0]);
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (required)"
            className="bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5 placeholder:text-zinc-600"
          />
          <select
            value={party}
            onChange={(e) => setParty(e.target.value)}
            aria-label="Party"
            className="bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5"
          >
            {PARTY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="X handle (optional)"
            className="bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5 placeholder:text-zinc-600"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role, e.g. PPC (optional)"
            className="bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5 placeholder:text-zinc-600"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="col-span-2 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[0.611rem] uppercase tracking-wider font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add person
          </button>
        </form>
      ) : (
        <p className="text-[0.611rem] text-zinc-600">Limit of 5 people reached.</p>
      )}

      {formError ? <p className="text-[0.611rem] text-red-400">{formError}</p> : null}
    </div>
  );
}

interface OpponentRowProps {
  opponent: Opponent;
  expanded: boolean;
  onToggle: () => void;
  emptyPostsMessage: string;
}

function OpponentRow({ opponent, expanded, onToggle, emptyPostsMessage }: OpponentRowProps) {
  const activity = ACTIVITY_INDICATORS[opponent.activityLevel];
  return (
    <div data-component="opponentRow">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-[0.611rem] font-bold text-white shrink-0"
            style={{ backgroundColor: opponent.color }}
          >
            {opponent.party
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200">{opponent.candidate}</span>
              <span className="text-[0.611rem]" title={`Activity: ${activity.label}`}>
                {activity.dot}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[0.611rem] text-zinc-500">
              <span>{opponent.party}</span>
              {opponent.handle ? (
                <>
                  <span>&middot;</span>
                  <span className="text-emerald-500/70">@{opponent.handle}</span>
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
            className={`h-4 w-4 text-zinc-600 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && opponent.recentPosts.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {opponent.recentPosts.map((post, i) => (
            <PostCard key={i} post={post} />
          ))}
        </div>
      )}

      {expanded && opponent.recentPosts.length === 0 && (
        <div className="ml-11 px-4 pb-3">
          <p className="text-xs text-zinc-600 italic">{emptyPostsMessage}</p>
        </div>
      )}
    </div>
  );
}

function PostCard({ post }: { post: OpponentPost }) {
  return (
    <div
      data-component="opponentPostCard"
      className="ml-11 p-2.5 bg-zinc-800/40 rounded-md border border-zinc-800/60"
    >
      <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">{post.text}</p>
      <div className="flex items-center gap-3 mt-1.5 text-[0.611rem] text-zinc-600">
        <span>{formatTimeAgo(post.date)}</span>
        <span>{post.likes} likes</span>
        <span>{post.retweets} RTs</span>
        {post.url && post.url !== "#" && (
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-500/70 hover:text-emerald-400 flex items-center gap-0.5"
          >
            <ExternalLink className="h-2.5 w-2.5" /> View
          </a>
        )}
      </div>
    </div>
  );
}
