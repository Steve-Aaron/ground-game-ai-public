import { cn } from "@/lib/utils";

export type PanelSkeletonVariant = "list" | "cards" | "chart" | "avatarList";

interface PanelSkeletonProps {
  /**
   * Visual shape of the skeleton. Choose the one that most closely matches
   * the final rendered content so the layout doesn't jump on load.
   */
  variant?: PanelSkeletonVariant;
  /** Number of placeholder rows to render (default 5). */
  rows?: number;
  className?: string;
}

/**
 * Loading placeholder for panel content.
 *
 * Replaces hand-rolled animate-pulse blocks scattered across feed components.
 * All variants render the same outer padded container so panels stay the
 * right size on load.
 */
export default function PanelSkeleton({
  variant = "list",
  rows = 5,
  className,
}: PanelSkeletonProps) {
  return (
    <div
      data-component="panelSkeleton"
      data-variant={variant}
      className={cn("p-4 space-y-3", className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} variant={variant} />
      ))}
    </div>
  );
}

function SkeletonRow({ variant }: { variant: PanelSkeletonVariant }) {
  if (variant === "avatarList") {
    return (
      <div className="animate-pulse space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-zinc-800" />
          <div className="h-3 bg-zinc-800 rounded w-28" />
        </div>
        <div className="h-3 bg-zinc-800/50 rounded w-full ml-9" />
        <div className="h-3 bg-zinc-800/50 rounded w-2/3 ml-9" />
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className="animate-pulse">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 bg-zinc-800 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-zinc-800 rounded w-1/3" />
            <div className="h-2.5 bg-zinc-800/50 rounded w-1/4" />
          </div>
        </div>
        <div className="h-2.5 bg-zinc-800/30 rounded w-full mt-2" />
      </div>
    );
  }

  if (variant === "chart") {
    return (
      <div className="animate-pulse">
        <div className="h-32 bg-zinc-800/40 rounded w-full" />
      </div>
    );
  }

  // Default list row — matches Headlines/NewsFeed/Hansard layouts.
  return (
    <div className="animate-pulse space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-4 w-14 bg-zinc-800 rounded" />
        <div className="h-3.5 bg-zinc-800 rounded w-3/4" />
      </div>
    </div>
  );
}
