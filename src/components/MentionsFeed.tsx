"use client";

import { ExternalLink, AlertCircle, Heart, Repeat2, CheckCircle2 } from "lucide-react";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import { UpdatedFooter } from "./ui/PanelFooter";
import PanelEmpty from "./ui/PanelEmpty";
import PanelError from "./ui/PanelError";
import PanelSkeleton from "./ui/PanelSkeleton";
import { formatTimeAgoShort, formatCompactNumber } from "@/lib/format";

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

interface MentionsData {
  mentions: SocialMention[];
  total: number;
  source: string;
  message?: string;
}

export default function MentionsFeed() {
  const { data, loading, error, refetch } = useConstituencyResource<MentionsData>(
    "/api/mentions",
    { errorMessage: "Unable to load social mentions" }
  );

  if (loading) return <PanelSkeleton variant="avatarList" rows={4} />;

  if (error && !data) {
    return <PanelError message={error} onRetry={refetch} />;
  }

  if (!data || data.mentions.length === 0) {
    return (
      <PanelEmpty
        icon={AlertCircle}
        title="Social monitoring not yet configured"
        description="Connect an X API bearer token or Apify API token to track social mentions of your MP."
      />
    );
  }

  return (
    <div data-component="mentionsFeedContainer">
      <div className="divide-y divide-zinc-800/30">
        {data.mentions.map((mention, i) => (
          <Mention key={i} mention={mention} />
        ))}
      </div>

      {/* Footer */}
      <UpdatedFooter label={`${data.total} mentions`} onRefresh={refetch} />
    </div>
  );
}

function Mention({ mention }: { mention: SocialMention }) {
  return (
    <a
      data-component="mentionRow"
      href={mention.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-3 py-3 hover:bg-zinc-800/30 transition-colors group"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-[0.556rem] font-bold text-zinc-400">
          {mention.author.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[0.667rem]">
            <span className="font-semibold text-zinc-200">{mention.author}</span>
            {mention.isVerified && (
              <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0" />
            )}
            <span className="text-zinc-600">@{mention.authorHandle}</span>
            <span className="text-zinc-700">&middot;</span>
            <span className="text-zinc-600">{formatTimeAgoShort(mention.date)}</span>
          </div>

          <p className="text-[0.667rem] text-zinc-300 mt-0.5 leading-relaxed line-clamp-3">
            {mention.text}
          </p>

          <div className="flex items-center gap-4 mt-1.5 text-[0.611rem] text-zinc-600">
            <span className="flex items-center gap-1 hover:text-red-400 transition-colors">
              <Heart className="h-3 w-3" />
              {formatCompactNumber(mention.likes)}
            </span>
            <span className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <Repeat2 className="h-3 w-3" />
              {formatCompactNumber(mention.retweets)}
            </span>
            <span className="ml-auto">
              <ExternalLink className="h-3 w-3 text-zinc-700 group-hover:text-emerald-400" />
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
