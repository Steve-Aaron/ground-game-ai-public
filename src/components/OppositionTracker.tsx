"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
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
  followers: string;
  recentPosts: OpponentPost[];
  activityLevel: "high" | "medium" | "low" | "unknown";
  color: string;
}

interface OppositionData {
  opponents: Opponent[];
  lastUpdated: string;
  source: "apify" | "static" | "candidates_only";
  message?: string;
}

const ACTIVITY_INDICATORS: Record<string, { dot: string; label: string }> = {
  high: { dot: "🔴", label: "High" },
  medium: { dot: "🟡", label: "Medium" },
  low: { dot: "🟢", label: "Low" },
  unknown: { dot: "⚪", label: "Not monitored" },
};

export default function OppositionTracker() {
  const { data, loading, error, refetch } = useConstituencyResource<OppositionData>(
    "/api/opposition",
    { errorMessage: "Unable to load opposition data" }
  );
  const [expandedParty, setExpandedParty] = useState<string | null>(null);

  if (loading) return <PanelSkeleton variant="cards" rows={4} />;
  if (error && !data) return <PanelError message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div data-component="oppositionTrackerContainer">
      {data.source === "candidates_only" && (
        <div className="px-4 py-2 bg-zinc-800/40 border-b border-zinc-700/30 flex items-center justify-between">
          <span className="text-[0.611rem] text-zinc-500">
            Showing 2024 election candidates — social activity monitoring not yet configured
          </span>
        </div>
      )}

      <div className="divide-y divide-zinc-800/50">
        {data.opponents.map((opponent) => (
          <OpponentRow
            key={opponent.party}
            opponent={opponent}
            expanded={expandedParty === opponent.party}
            onToggle={() =>
              setExpandedParty(expandedParty === opponent.party ? null : opponent.party)
            }
            emptyPostsMessage={
              data.source === "candidates_only"
                ? "Social activity tracking requires Apify API configuration"
                : "No recent posts found"
            }
          />
        ))}
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/50 flex items-center justify-between text-[0.611rem] text-zinc-600">
        <span>Updated {formatTimeAgo(data.lastUpdated)}</span>
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
              <span className="text-sm font-medium text-zinc-200">{opponent.party}</span>
              <span className="text-[0.611rem]" title={`Activity: ${activity.label}`}>
                {activity.dot}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[0.611rem] text-zinc-500">
              <span>{opponent.candidate}</span>
              <span>&middot;</span>
              <span className="text-emerald-500/70">{opponent.handle}</span>
              <span>&middot;</span>
              <span>{opponent.followers}</span>
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
