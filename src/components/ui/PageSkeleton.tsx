import PanelSkeleton from "./PanelSkeleton";

/**
 * Full-page loading skeleton — header strip plus a grid of panel
 * placeholders. Used for the dashboard while auth/constituency data
 * resolves, and as a Suspense fallback.
 */
export default function PageSkeleton() {
  return (
    <div data-component="pageSkeleton" className="min-h-screen bg-background flex flex-col">
      {/* Header strip */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="h-4 w-44 bg-muted rounded animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-4 bg-muted/60 rounded animate-pulse" />
        </div>
      </div>
      {/* Tab strip */}
      <div className="border-b border-border px-4 py-2 flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-3 w-20 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>
      {/* Panel grid */}
      <main className="flex-1 p-2 lg:p-3">
        <div className="max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-border bg-card rounded">
              <div className="border-b border-border/50 px-4 py-2">
                <div className="h-3 w-32 bg-muted rounded animate-pulse" />
              </div>
              <PanelSkeleton variant={i % 2 === 0 ? "list" : "chart"} rows={i % 2 === 0 ? 5 : 2} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
