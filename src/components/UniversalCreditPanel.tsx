"use client";

import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "./ui/PanelSkeleton";
import SectionLabel from "./ui/SectionLabel";
import Sparkline from "./ui/Sparkline";

// Match the actual API response shape from /api/universal-credit
interface UCData {
  current: {
    count: number | null;
    rate: number | null;
    date: string | null;
  };
  trend: { date: string; count: number }[];
  byAge: { label: string; count: number; percentage: number }[];
  source: string;
  sourceUrl: string;
  error?: string;
}

const AGE_COLORS = [
  "bg-emerald-500",
  "bg-emerald-400",
  "bg-teal-400",
  "bg-cyan-400",
  "bg-sky-400",
  "bg-blue-400",
  "bg-indigo-400",
  "bg-violet-400",
];

export default function UniversalCreditPanel() {
  const { data, loading } = useConstituencyResource<UCData>("/api/universal-credit");

  if (loading) return <PanelSkeleton variant="cards" rows={3} />;

  if (!data || data.error) {
    return <p className="text-zinc-500 text-xs">Universal Credit data unavailable</p>;
  }

  const trend = data.trend ?? [];

  // If current count is 0 or null, fall back to the most recent non-zero trend value
  let claimantCount = data.current?.count;
  const claimantRate = data.current?.rate;
  let period = data.current?.date ?? "";

  if (!claimantCount || claimantCount === 0) {
    const lastNonZero = [...trend].reverse().find((t) => t.count > 0);
    if (lastNonZero) {
      claimantCount = lastNonZero.count;
      period = lastNonZero.date;
    }
  }
  const ageBreakdown = data.byAge ?? [];

  // Sparkline gating — only render when we have at least 2 non-zero points.
  const trendValues = trend.map((t) => t.count).filter((v) => v > 0);

  return (
    <div data-component="universalCreditPanel" className="space-y-4">
      {/* Headline figures */}
      <div className="bg-muted rounded-xl p-3 flex items-center justify-between">
        <div>
          <SectionLabel>Claimant Count</SectionLabel>
          <div className="text-xl font-bold text-zinc-100 mt-0.5">
            {claimantCount != null && claimantCount > 0
              ? Number(claimantCount).toLocaleString()
              : "—"}
          </div>
        </div>
        <div className="text-right">
          {claimantRate != null && claimantRate > 0 && (
            <div>
              <SectionLabel>Rate</SectionLabel>
              <div className="text-lg font-bold text-zinc-100 mt-0.5">
                {Number(claimantRate).toFixed(1)}%
              </div>
            </div>
          )}
          {period && (
            <div className="text-[0.556rem] text-zinc-600 mt-1">{period}</div>
          )}
        </div>
      </div>

      {/* 12-month trend sparkline */}
      {trendValues.length > 1 && (
        <div>
          <SectionLabel className="mb-2">12-Month Trend</SectionLabel>
          <div className="bg-muted rounded-xl p-3">
            <Sparkline
              id="uc-trend"
              data={trend.filter((t) => t.count > 0).map((t) => t.count)}
              color="#34d399"
              height={40}
              showEndpoint={false}
            />
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>{trend[0]?.date}</span>
              <span>{trend[trend.length - 1]?.date}</span>
            </div>
          </div>
        </div>
      )}

      {/* Age breakdown stacked bar */}
      {ageBreakdown.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Age Breakdown</SectionLabel>
          <div className="bg-muted rounded-xl p-3">
            <div className="flex h-4 rounded-full overflow-hidden">
              {ageBreakdown.map((seg, i) => (
                <div
                  key={seg.label}
                  className={`${AGE_COLORS[i % AGE_COLORS.length]} transition-all`}
                  style={{ width: `${seg.percentage}%` }}
                  title={`${seg.label}: ${seg.percentage.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {ageBreakdown.map((seg, i) => (
                <div key={seg.label} className="flex items-center gap-1">
                  <div
                    className={`h-2 w-2 rounded-full ${AGE_COLORS[i % AGE_COLORS.length]}`}
                  />
                  <span className="text-[0.5rem] text-zinc-400">
                    {seg.label} ({seg.percentage.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
