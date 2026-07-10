"use client";

import { BarChart2, ExternalLink, Heart, MessageCircle, Play, Repeat2 } from "lucide-react";
import type { Tweet, TwitterProfile } from "@/lib/apify-twitter";
import { formatCompactNumber, formatTimeAgoShort } from "@/lib/format";
import { cn } from "@/lib/utils";

// X-style tweet rendering, shared wherever tracked accounts' posts appear.

export const tweetEngagement = (t: Tweet) => t.likes + t.retweets * 2 + t.replies;

export function Avatar({ profile, size }: { profile: Pick<TwitterProfile, "handle" | "avatar">; size: string }) {
  return profile.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-component="avatar" src={profile.avatar} alt="" className={cn(size, "rounded-full object-cover")} />
  ) : (
    <span
      data-component="avatar"
      className={cn(size, "rounded-full bg-muted flex items-center justify-center text-[0.611rem] font-bold text-zinc-400")}
    >
      {profile.handle.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Single tweet, X dark-mode style, with relative-performance bar. */
export function TweetCard({
  tweet,
  profile,
  maxEngagement,
  avgEngagement,
}: {
  tweet: Tweet;
  profile: Pick<TwitterProfile, "handle" | "name" | "avatar">;
  maxEngagement: number;
  avgEngagement: number;
}) {
  const score = tweetEngagement(tweet);
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
              className={cn(
                "mt-2 grid gap-0.5 rounded-2xl overflow-hidden border border-border/60",
                tweet.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
              )}
            >
              {tweet.media.map((m, i) => (
                <span key={i} className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt=""
                    loading="lazy"
                    className={cn("w-full object-cover", tweet.media.length === 1 ? "max-h-64" : "h-28")}
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
                className={cn("h-full rounded-full", multiple >= 1 ? "bg-sky-500" : "bg-zinc-600")}
                style={{ width: `${relWidth}%` }}
              />
            </div>
            <span className={cn("text-[0.5rem] tabular-nums shrink-0", multiple >= 1 ? "text-sky-400" : "text-zinc-600")}>
              {multiple > 0 ? `${multiple.toFixed(1)}× avg` : "—"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
