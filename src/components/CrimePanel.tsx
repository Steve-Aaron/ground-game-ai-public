"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency, SELECTABLE_CONSTITUENCIES } from "@/hooks/useConstituency";

function getRegion(slug: string): string {
  return SELECTABLE_CONSTITUENCIES.find((c) => c.slug === slug)?.region ?? "England";
}

interface CrimeSummaryItem {
  category: string;
  count: number;
}

interface CrimeData {
  crimes: Array<{
    category: string;
    lat: number;
    lng: number;
    street: string;
    month: string;
    outcome: string | null;
  }>;
  summary: CrimeSummaryItem[];
  total: number;
  month: string | null;
  source: string;
  sourceUrl: string;
  northernIreland?: boolean;
  scotland?: boolean;
  error?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Violence and Sexual Offences": "#ef4444",
  "Anti-Social Behaviour":        "#f97316",
  "Vehicle Crime":                "#3b82f6",
  "Burglary":                     "#f59e0b",
  "Shoplifting":                  "#eab308",
  "Criminal Damage and Arson":    "#a855f7",
  "Drugs":                        "#8b5cf6",
  "Other Theft":                  "#6b7280",
  "Public Order":                 "#ec4899",
  "Robbery":                      "#dc2626",
  "Possession of Weapons":        "#b91c1c",
  "Bicycle Theft":                "#10b981",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#71717a";
}

function formatMonth(month: string | null): string {
  if (!month) return "";
  const [year, mon] = month.split("-");
  const date = new Date(parseInt(year), parseInt(mon) - 1);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function CrimePanel() {
  const { slug } = useConstituency();
  const region = getRegion(slug);
  const [data, setData] = useState<CrimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);

    fetch(withConstituency("/api/crime", slug))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: CrimeData) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-zinc-500">Loading crime data...</div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (data?.northernIreland) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Crime statistics for Northern Ireland are published by the PSNI, not data.police.uk.
        </p>
        <a
          href="https://www.psni.police.uk/statistics-crime-data-information/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          View PSNI crime statistics ↗
        </a>
      </div>
    );
  }

  if (data?.scotland) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Crime statistics for Scotland are published by Police Scotland, not data.police.uk.
        </p>
        <a
          href="https://www.scotland.police.uk/about-us/how-we-do-it/our-statistics/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          View Police Scotland statistics ↗
        </a>
      </div>
    );
  }

  if (error || !data || data.total === 0) {
    if (region === "Wales") {
      return (
        <div className="p-4 space-y-2 text-center">
          <p className="text-xs text-zinc-500">Crime data loading. Wales is covered by data.police.uk.</p>
        </div>
      );
    }
    return (
      <div className="p-4">
        <p className="text-xs text-zinc-500">Crime data unavailable for this constituency.</p>
      </div>
    );
  }

  const top = data.summary.slice(0, 8);
  const maxCount = top[0]?.count ?? 1;

  const withOutcome = data.crimes.filter((c) => c.outcome !== null).length;
  const resolvedKeywords = ["charged", "caution", "penalty notice", "prosecution", "court"];
  const resolved = data.crimes.filter(
    (c) => c.outcome && resolvedKeywords.some((k) => c.outcome!.toLowerCase().includes(k))
  ).length;
  const resolvedPct = data.crimes.length > 0 ? Math.round((resolved / data.crimes.length) * 100) : 0;
  const outcomePct = data.crimes.length > 0 ? Math.round((withOutcome / data.crimes.length) * 100) : 0;

  return (
    <div className="p-4 space-y-4">
      {/* Headline */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-zinc-100">{data.total.toLocaleString()}</div>
          <div className="text-[11px] text-zinc-500">crimes recorded{data.month ? ` · ${formatMonth(data.month)}` : ""}</div>
        </div>
        <div className="text-right space-y-1">
          <div className="text-sm font-semibold text-zinc-300">{resolvedPct}%</div>
          <div className="text-[10px] text-zinc-600">charged / cautioned</div>
          <div className="text-sm font-semibold text-zinc-300">{outcomePct}%</div>
          <div className="text-[10px] text-zinc-600">outcome recorded</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="space-y-2">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">By category</div>
        {top.map(({ category, count }) => (
          <div key={category}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-zinc-400 truncate flex-1 mr-2">{category}</span>
              <span className="text-[11px] font-medium text-zinc-300 shrink-0">{count}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(count / maxCount) * 100}%`,
                  backgroundColor: categoryColor(category),
                  opacity: 0.75,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-zinc-600 text-center pt-1">
        Source:{" "}
        <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">
          data.police.uk
        </a>
      </div>
    </div>
  );
}
