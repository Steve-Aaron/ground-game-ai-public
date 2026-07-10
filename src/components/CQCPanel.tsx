"use client";

import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "./ui/PanelSkeleton";
import SectionLabel from "./ui/SectionLabel";
import StatGrid from "./ui/StatGrid";
import RatingBadge, { type RatingStyle } from "./ui/RatingBadge";
import { formatGbDate } from "@/lib/format";

// Match the actual API response from /api/cqc
interface LocationResult {
  name: string;
  type: string;
  rating: string;
  lastInspection: string;
  beds?: number;
  reportUrl?: string;
  cqcUrl?: string;
}

interface RatingSummary {
  outstanding: number;
  good: number;
  requiresImprovement: number;
  inadequate: number;
}

interface CQCData {
  summary: RatingSummary;
  locations: LocationResult[];
  totalFound: number;
  detailsFetched?: number;
  source: string;
  sourceUrl: string;
  error?: string;
}

const RATING_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; badgeBg: string; badgeText: string }
> = {
  Outstanding: {
    label: "Outstanding",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10",
    badgeBg: "bg-teal-500/20",
    badgeText: "text-teal-400",
  },
  Good: {
    label: "Good",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    badgeBg: "bg-green-500/20",
    badgeText: "text-green-400",
  },
  "Requires improvement": {
    label: "Req. Improvement",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-400",
  },
  Inadequate: {
    label: "Inadequate",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    badgeBg: "bg-red-500/20",
    badgeText: "text-red-400",
  },
};

// Adapt the legacy RATING_CONFIG shape (badgeBg/badgeText) to the shared
// RatingBadge config shape (bg/text/label).
const RATING_BADGE_CONFIG: Record<string, RatingStyle> = Object.fromEntries(
  Object.entries(RATING_CONFIG).map(([k, v]) => [
    k,
    { bg: v.badgeBg, text: v.badgeText, label: v.label },
  ])
);

function formatDate(d: string): string {
  if (!d) return "—";
  return formatGbDate(d);
}

export default function CQCPanel() {
  const { data, loading } = useConstituencyResource<CQCData>("/api/cqc");

  if (loading) return <PanelSkeleton variant="cards" rows={4} />;

  if (!data || data.error) {
    return <p className="text-zinc-500 text-xs">CQC data unavailable</p>;
  }

  const summary = data.summary ?? { outstanding: 0, good: 0, requiresImprovement: 0, inadequate: 0 };
  const locations = data.locations ?? [];
  const total = data.totalFound ?? locations.length;

  // API returns 403 — show a clean empty state rather than four zeros
  if (total === 0) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          CQC provider data not currently available for this constituency.
        </p>
        <a
          href={`https://www.cqc.org.uk/search/services`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          Search care providers on cqc.org.uk ↗
        </a>
      </div>
    );
  }

  const summaryCards = [
    {
      key: "outstanding",
      ...RATING_CONFIG["Outstanding"],
      count: summary.outstanding,
    },
    {
      key: "good",
      ...RATING_CONFIG["Good"],
      count: summary.good,
    },
    {
      key: "requiresImprovement",
      ...RATING_CONFIG["Requires improvement"],
      count: summary.requiresImprovement,
    },
    {
      key: "inadequate",
      ...RATING_CONFIG["Inadequate"],
      count: summary.inadequate,
    },
  ];

  return (
    <div data-component="cqcPanel" className="space-y-4">
      {/* Summary cards */}
      <StatGrid
        cols={4}
        items={summaryCards.map((card) => ({
          label: card.label,
          value: card.count,
          color: card.color.startsWith("text-") ? undefined : card.color,
          valueClassName: `text-2xl font-bold ${card.color}`,
        }))}
      />

      {/* Total */}
      <div className="text-[0.556rem] text-zinc-500 text-center">
        {total} registered locations
      </div>

      {/* Locations list */}
      {locations.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Inspected Locations</SectionLabel>
          <div className="space-y-1.5 max-h-[22.222rem] overflow-y-auto pr-1">
            {locations.map((loc, i) => (
              <div
                key={i}
                className="bg-muted rounded-xl px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-foreground truncate">
                    {loc.cqcUrl ? (
                      <a
                        href={loc.cqcUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
                      >
                        {loc.name}
                        <svg
                          className="w-3 h-3 shrink-0 text-zinc-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
                          />
                        </svg>
                      </a>
                    ) : (
                      loc.name
                    )}
                  </div>
                  <div className="text-[0.556rem] text-zinc-500 flex items-center gap-2 mt-0.5">
                    <span>{loc.type}</span>
                    {loc.lastInspection && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span>Inspected {formatDate(loc.lastInspection)}</span>
                      </>
                    )}
                  </div>
                </div>
                <RatingBadge rating={loc.rating} config={RATING_BADGE_CONFIG} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
