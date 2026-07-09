import { cn } from "@/lib/utils";

export type PanelSkeletonVariant = "list" | "cards" | "chart" | "avatarList" | "grid";

interface PanelSkeletonProps {
  /**
   * Visual shape of the skeleton. Choose the one that most closely matches
   * the final rendered content so the layout doesn't jump on load.
   */
  variant?: PanelSkeletonVariant;
  /** Number of placeholder rows (or grid cells) to render (default 5). */
  rows?: number;
  className?: string;
}

/**
 * Loading placeholder for panel content.
 *
 * Replaces hand-rolled animate-pulse blocks scattered across feed components.
 * All variants render the same outer padded container so panels stay the
 * right size on load. Colours use the `muted` theme token so skeletons work
 * in both light and dark themes.
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
      className={cn(
        variant === "grid" ? "p-4 grid grid-cols-1 md:grid-cols-2 gap-3" : "p-4 space-y-3",
        className
      )}
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
          <div className="h-7 w-7 rounded-full bg-muted" />
          <div className="h-3 bg-muted rounded w-28" />
        </div>
        <div className="h-3 bg-muted/50 rounded w-full ml-9" />
        <div className="h-3 bg-muted/50 rounded w-2/3 ml-9" />
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className="animate-pulse">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 bg-muted rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-muted rounded w-1/3" />
            <div className="h-2.5 bg-muted/50 rounded w-1/4" />
          </div>
        </div>
        <div className="h-2.5 bg-muted/30 rounded w-full mt-2" />
      </div>
    );
  }

  if (variant === "chart") {
    return (
      <div className="animate-pulse">
        <div className="h-32 bg-muted/40 rounded w-full" />
      </div>
    );
  }

  if (variant === "grid") {
    return <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />;
  }

  // Default list row — matches Headlines/NewsFeed/Hansard layouts.
  return (
    <div className="animate-pulse space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-4 w-14 bg-muted rounded" />
        <div className="h-3.5 bg-muted rounded w-3/4" />
      </div>
    </div>
  );
}
