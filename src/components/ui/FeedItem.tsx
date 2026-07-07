import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceStyle } from "@/lib/palette";
import { formatTimeAgo } from "@/lib/format";

interface FeedItemSource {
  /** Source name (e.g. 'BBC', 'Guardian'). */
  label: string;
  /** Optional palette override — defaults to lib/palette.sourceStyle(label). */
  bg?: string;
  text?: string;
}

interface FeedItemProps {
  /** Destination URL — opens in a new tab. */
  href: string;
  /** Headline / row title. */
  title: string;
  /** Optional one- or two-line summary. */
  snippet?: string;
  /** Optional chip-style source label. */
  source?: FeedItemSource;
  /** Optional ISO date string — rendered as "5m ago" etc. */
  date?: string;
  /** Optional leading visual (icon container) shown left of the body. */
  leading?: React.ReactNode;
  /** Optional inline element shown after source / date (e.g. status badge). */
  meta?: React.ReactNode;
  /** Visual density. Compact reduces padding + font sizes. */
  density?: "default" | "compact";
  /** Hide the trailing external link icon. */
  hideExternalIcon?: boolean;
  className?: string;
}

/**
 * Repeating 'external link card' used across feed components (Headlines,
 * NewsFeed, MentionsFeed, HansardFeed). Wraps content in an <a> with the
 * standard target/rel attributes and the platform's hover/group styling.
 */
export default function FeedItem({
  href,
  title,
  snippet,
  source,
  date,
  leading,
  meta,
  density = "default",
  hideExternalIcon = false,
  className,
}: FeedItemProps) {
  const compact = density === "compact";
  const style = source
    ? source.bg && source.text
      ? { bg: source.bg, text: source.text }
      : sourceStyle(source.label)
    : null;

  return (
    <a
      data-component="feedItem"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block hover:bg-zinc-800/30 transition-colors group",
        compact ? "px-3 py-2.5" : "px-4 py-2.5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="flex-1 min-w-0">
          {(source || date) && (
            <div className="flex items-center gap-2 mb-1">
              {source && style ? (
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[0.556rem] font-semibold uppercase tracking-wide",
                    style.bg,
                    style.text
                  )}
                >
                  {source.label}
                </span>
              ) : null}
              {date ? (
                <span className="text-[0.556rem] text-zinc-600">
                  {formatTimeAgo(date)}
                </span>
              ) : null}
              {meta}
            </div>
          )}
          <h3
            className={cn(
              "text-zinc-200 font-medium leading-snug group-hover:text-emerald-400 transition-colors line-clamp-2",
              compact ? "text-[0.667rem]" : "text-sm"
            )}
          >
            {title}
          </h3>
          {snippet ? (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{snippet}</p>
          ) : null}
          {!source && !date && meta ? (
            <div className="flex items-center gap-2 mt-1.5 text-[0.611rem] text-zinc-600">
              {meta}
            </div>
          ) : null}
        </div>
        {!hideExternalIcon ? (
          <ExternalLink className="h-3.5 w-3.5 text-zinc-600 group-hover:text-emerald-400 mt-1 flex-shrink-0" />
        ) : null}
      </div>
    </a>
  );
}
