"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { TrendingUp, Search, BarChart3 } from "lucide-react";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "./ui/PanelSkeleton";
import { SourceNote } from "./ui/PanelFooter";

// ── Types — match /api/trends-v2 response shape ─────────────────────────────

interface TrendingSearch {
  title: string;
  traffic: string;
  articleCount: number;
  relatedQueries: string[];
  newsTitle?: string;
  newsUrl?: string;
  newsSource?: string;
}

interface InterestOverTimePoint {
  date: string;
  formattedDate: string;
  values: Record<string, number>;
}

interface RegionalComparison {
  keyword: string;
  regionValue: number | null;
  eastOfEnglandValue?: number | null; // legacy field — still present in old cached docs
  nationalAverage: number;
  rank: number | null;
  totalRegions: number;
}

interface FreshnessReport {
  trendingSearches: "ok" | "failed";
  interestOverTime: "ok" | "failed";
  regionalVsNational: "ok" | "failed";
}

interface TrendsV2Data {
  trendingSearches: TrendingSearch[];
  regionalTrending?: TrendingSearch[];
  regionTrendingName?: string;
  interestOverTime: InterestOverTimePoint[];
  regionalVsNational: RegionalComparison[];
  fetched_at?: string;
  source?: string;
  sourceUrl?: string;
  note?: string;
  freshness?: FreshnessReport;
  keywordsUsed?: string[];
  mpName?: string;
  constituencyName?: string;
  cached?: boolean;
  error?: string;
}

const SERIES_COLORS = {
  mp: "#0087DC",
  constituency: "#10b981",
};

// ── SVG Sparkline now lives in ui/Sparkline ─────────────────────────────────

// ── Comparison chart: overlaid sparklines for the time-series ───────────────

interface ComparisonSeries {
  label: string;
  color: string;
  data: number[];
}

function formatTickDate(raw: string): string {
  // Google Trends formattedDate looks like "Jan 5, 2025" or "Week of Jan 5, 2025"
  const cleaned = raw.replace(/^Week of /i, "");
  try {
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return raw;
  }
}

function ComparisonChart({ series, dates }: { series: ComparisonSeries[]; dates: string[] }) {
  const WIDTH = 320;
  const HEIGHT = 100;
  const padY = 8;
  const padX = 4;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const allVals = series.flatMap((s) => s.data);
  const globalMax = Math.max(...allVals, 1);
  const globalMin = Math.min(...allVals, 0);
  const range = globalMax - globalMin || 1;
  const dataLen = series[0]?.data.length ?? 0;

  function toPoints(data: number[]) {
    return data.map((v, i) => ({
      x: padX + (i / Math.max(data.length - 1, 1)) * (WIDTH - padX * 2),
      y: padY + (1 - (v - globalMin) / range) * (HEIGHT - padY * 2),
    }));
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || dataLen < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const svgX = (relX / rect.width) * WIDTH;
    const i = Math.round(((svgX - padX) / (WIDTH - padX * 2)) * (dataLen - 1));
    setHoveredIndex(Math.max(0, Math.min(dataLen - 1, i)));
  }, [dataLen]);

  const tickIndices = dataLen > 1
    ? [0, Math.floor(dataLen / 4), Math.floor(dataLen / 2), Math.floor((3 * dataLen) / 4), dataLen - 1]
    : [];

  const hovX = hoveredIndex !== null && dataLen > 1
    ? padX + (hoveredIndex / (dataLen - 1)) * (WIDTH - padX * 2)
    : null;

  return (
    <div data-component="comparisonChart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 18}`}
        width="100%"
        height={HEIGHT + 18}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          {series.map((s, idx) => (
            <linearGradient key={idx} id={`comp-area-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={padX} y1={padY + frac * (HEIGHT - padY * 2)}
            x2={WIDTH - padX} y2={padY + frac * (HEIGHT - padY * 2)}
            stroke="#27272a" strokeWidth="0.5"
          />
        ))}

        {series.map((s, idx) => {
          const pts = toPoints(s.data);
          const area =
            pts.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(" ") +
            ` L ${pts[pts.length - 1].x},${HEIGHT} L ${pts[0].x},${HEIGHT} Z`;
          return <path key={`area-${idx}`} d={area} fill={`url(#comp-area-${idx})`} />;
        })}

        {series.map((s, idx) => {
          const pts = toPoints(s.data);
          const d = pts.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(" ");
          return (
            <path key={`line-${idx}`} d={d} fill="none" stroke={s.color}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          );
        })}

        {/* Hover cursor */}
        {hovX !== null && (
          <line x1={hovX} y1={padY} x2={hovX} y2={HEIGHT} stroke="#52525b" strokeWidth="1" strokeDasharray="3,2" />
        )}

        {/* Hover dots + tooltip */}
        {hoveredIndex !== null && hovX !== null && (() => {
          const tooltipLines = series.map((s) => ({
            label: s.label,
            value: s.data[hoveredIndex] ?? 0,
            color: s.color,
          }));
          const date = dates[hoveredIndex] ? formatTickDate(dates[hoveredIndex]) : "";
          const tipW = 110;
          const tipX = hovX + tipW > WIDTH ? hovX - tipW - 4 : hovX + 6;
          const maxVal = Math.max(...tooltipLines.map((l) => l.value));

          return (
            <g>
              {series.map((s, idx) => {
                const pts = toPoints(s.data);
                const pt = pts[hoveredIndex];
                return pt ? (
                  <g key={`hdot-${idx}`}>
                    <circle cx={pt.x} cy={pt.y} r="4" fill={s.color} />
                    <circle cx={pt.x} cy={pt.y} r="7" fill={s.color} opacity="0.2" />
                  </g>
                ) : null;
              })}
              <rect x={tipX} y={6} width={tipW} height={14 + tooltipLines.length * 13}
                rx="3" fill="#18181b" stroke="#3f3f46" strokeWidth="0.75" />
              {date && (
                <text x={tipX + 6} y={17} fill="#71717a" fontSize="8" fontFamily="system-ui">
                  {date}
                </text>
              )}
              {tooltipLines.map((l, i) => (
                <g key={i}>
                  <circle cx={tipX + 9} cy={26 + i * 13} r="3" fill={l.color} />
                  <text x={tipX + 16} y={30 + i * 13} fill="#d4d4d8" fontSize="9" fontFamily="system-ui">
                    {l.label.split(" ")[0]}: <tspan fontWeight="600" fill={l.value === maxVal && maxVal > 0 ? l.color : "#d4d4d8"}>{l.value}</tspan>
                  </text>
                </g>
              ))}
            </g>
          );
        })()}

        {/* End dots when not hovering */}
        {hoveredIndex === null && series.map((s, idx) => {
          const pts = toPoints(s.data);
          const last = pts[pts.length - 1];
          return last ? (
            <g key={`dot-${idx}`}>
              <circle cx={last.x} cy={last.y} r="3.5" fill={s.color} />
              <circle cx={last.x} cy={last.y} r="6" fill={s.color} opacity="0.2" />
            </g>
          ) : null;
        })}

        {/* X-axis date ticks */}
        {tickIndices.map((ti, i) => {
          if (dataLen <= 1) return null;
          const x = padX + (ti / (dataLen - 1)) * (WIDTH - padX * 2);
          const label = dates[ti] ? formatTickDate(dates[ti]) : "";
          return (
            <text key={i} x={x} y={HEIGHT + 14} textAnchor="middle"
              fill="#52525b" fontSize="8" fontFamily="system-ui, sans-serif">
              {label}
            </text>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 px-1">
        {series.map((s, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-zinc-400">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inline empty-state placeholder ──────────────────────────────────────────

function UnavailableSection({ height = "py-4" }: { height?: string }) {
  return (
    <div data-component="trendsUnavailable" className={`bg-muted/40 rounded-lg border border-border/50 px-3 ${height}`}>
      <p className="text-xs text-zinc-500 text-center">Currently unavailable</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

/** Trending list section — used for both the UK and regional feeds. Each
 * trend links to its top news story when the feed provides one. */
function TrendingSection({ title, items }: { title: string; items?: TrendingSearch[] }) {
  return (
    <div data-component="trendingSection">
      <div className="flex items-center gap-2 mb-2 px-3">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</span>
      </div>

      {items && items.length > 0 ? (
        <div className="bg-muted/30 rounded-lg mx-2 border border-border/40 divide-y divide-zinc-800/40">
          {items.slice(0, 6).map((t) => (
            <div key={t.title} className="px-3 py-2 hover:bg-muted/20 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-[0.667rem] text-zinc-300 capitalize">{t.title}</span>
                {t.traffic && (
                  <span className="text-[0.611rem] font-semibold text-emerald-400 tabular-nums">
                    {t.traffic}
                  </span>
                )}
              </div>
              {t.newsUrl && t.newsTitle ? (
                <a
                  href={t.newsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[0.556rem] text-zinc-600 hover:text-emerald-400 truncate transition-colors"
                >
                  {t.newsTitle}
                  {t.newsSource ? ` — ${t.newsSource}` : ""}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-2">
          <UnavailableSection />
        </div>
      )}
    </div>
  );
}

export default function TrendsPanel() {
  const { data, loading, error: errorMsg } = useConstituencyResource<TrendsV2Data>(
    "/api/trends-v2"
  );
  const error = !!errorMsg;

  const comparisonSeries = useMemo<ComparisonSeries[]>(() => {
    const points = data?.interestOverTime ?? [];
    const mpName = data?.mpName;
    const constituencyName = data?.constituencyName;
    if (!points.length || !mpName || !constituencyName) return [];

    return [
      { label: mpName, color: SERIES_COLORS.mp, data: points.map((p) => p.values?.[mpName] ?? 0) },
      { label: constituencyName, color: SERIES_COLORS.constituency, data: points.map((p) => p.values?.[constituencyName] ?? 0) },
    ];
  }, [data]);

  const chartDates = useMemo(
    () => (data?.interestOverTime ?? []).map((p) => p.formattedDate),
    [data]
  );

  const interestOk = comparisonSeries.length > 0;
  const regionalOk = (data?.regionalVsNational?.length ?? 0) > 0;
  const trendingOk = (data?.trendingSearches?.length ?? 0) > 0;

  const fetchedTime = useMemo(() => {
    if (!data?.fetched_at) return "";
    try {
      return new Date(data.fetched_at).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, [data?.fetched_at]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) return <PanelSkeleton variant="chart" rows={2} />;

  // ── Total-failure fallback (network error AND no data) ────────────────────
  if (error && !data) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted/60 mb-3">
          <Search className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-400">
          Search trends data unavailable
        </p>
        <p className="text-[0.611rem] text-zinc-600 mt-1.5 max-w-[15.556rem] mx-auto">
          Could not reach the trends route.
        </p>
      </div>
    );
  }

  // ── Rendered panel ────────────────────────────────────────────────────────

  return (
    <div data-component="trendsPanel" className="space-y-5 p-1">
      {/* Section: 90-day time-series chart */}
      <div data-component="interestOverTimeSection" className="px-3">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            England-wide Search Interest — 90 days
          </span>
        </div>

        {interestOk ? (
          <>
            <div className="bg-muted/40 rounded-lg p-3 border border-border/50">
              <ComparisonChart series={comparisonSeries} dates={chartDates} />
            </div>
            <p className="text-[0.556rem] text-zinc-600 mt-1.5 px-1">
              Party comparison data currently unavailable.
            </p>
          </>
        ) : (
          <UnavailableSection />
        )}
      </div>

      {/* Section: Regional vs national */}
      <div data-component="regionalComparisonSection" className="px-3">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-3 w-3 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-500">
            {data?.constituencyName ? `${data.constituencyName} region vs UK average` : "Region vs UK average"}
          </span>
        </div>

        {regionalOk && data?.regionalVsNational ? (
          <div className="bg-muted/40 rounded-lg border border-border/50 divide-y divide-zinc-800/40">
            {data.regionalVsNational.map((r) => {
              const regionVal = r.regionValue ?? r.eastOfEnglandValue ?? null;
              return (
                <div key={r.keyword} className="px-3 py-2">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[12px] text-zinc-300">{r.keyword}</span>
                    <span className="text-[11px] text-zinc-400 tabular-nums">
                      {regionVal ?? "—"} · avg {r.nationalAverage}
                    </span>
                  </div>
                  {r.rank != null && (
                    <p className="text-[10px] text-zinc-600">
                      Rank {r.rank} of {r.totalRegions} regions
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <UnavailableSection />
        )}
      </div>

      {/* Section: Trending in the UK */}
      <TrendingSection title="Trending in the UK" items={trendingOk ? data?.trendingSearches : undefined} />

      {/* Section: Trending in the constituency's nation */}
      <TrendingSection
        title={`Trending in ${data?.regionTrendingName || "the region"}`}
        items={(data?.regionalTrending?.length ?? 0) > 0 ? data?.regionalTrending : undefined}
      />

      {/* Footer */}
      <SourceNote className="px-3 pb-1">
        {fetchedTime ? `Updated ${fetchedTime} · ` : ""}Data via Google Trends
      </SourceNote>
    </div>
  );
}

