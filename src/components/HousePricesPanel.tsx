"use client";

import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "./ui/PanelSkeleton";
import SectionLabel from "./ui/SectionLabel";
import { formatGbDate } from "@/lib/format";

interface IndexItem {
  period: string;
  averagePrice: number;
  annualChange: number | null;
  salesVolume: number | null;
}

interface Sale {
  date: string;
  price: number;
  address: string;
  postcode: string | null;
  type: string | null;
  newBuild: boolean;
}

interface HousePriceData {
  index: { items: IndexItem[] };
  recentSales: Sale[];
  source: string;
  sourceUrl: string;
  error?: string;
}

const TYPE_LABELS: Record<string, string> = {
  "http://landregistry.data.gov.uk/def/common/terraced": "Terraced",
  "http://landregistry.data.gov.uk/def/common/semi-detached": "Semi-detached",
  "http://landregistry.data.gov.uk/def/common/detached": "Detached",
  "http://landregistry.data.gov.uk/def/common/flat-maisonette": "Flat",
  terraced: "Terraced",
  "semi-detached": "Semi-detached",
  detached: "Detached",
  "flat-maisonette": "Flat",
};

function formatPrice(p: number): string {
  if (p >= 1_000_000) return `£${(p / 1_000_000).toFixed(2)}m`;
  if (p >= 1_000) return `£${(p / 1_000).toFixed(0)}k`;
  return `£${p.toLocaleString()}`;
}

export default function HousePricesPanel() {
  const { data, loading } = useConstituencyResource<HousePriceData>("/api/house-prices");

  if (loading) return <PanelSkeleton variant="cards" rows={4} />;

  if (!data || data.error) {
    return (
      <div className="bg-background border border-border rounded-2xl p-4">
        <p className="text-zinc-500 text-xs">House price data unavailable</p>
      </div>
    );
  }

  // Get the latest index item for headline figures
  const latest = data.index.items.length > 0
    ? data.index.items.reduce((a, b) =>
        (a.period ?? "") > (b.period ?? "") ? a : b
      )
    : null;

  const annualChange = latest?.annualChange != null ? Number(latest.annualChange) : null;
  const isPositive = annualChange != null && annualChange >= 0;

  // Property type distribution from recent sales
  const typeStats: Record<string, { count: number; totalPrice: number; min: number; max: number }> = {};
  for (const sale of data.recentSales) {
    const typeKey = sale.type ?? "";
    const typeLabel =
      TYPE_LABELS[typeKey] ?? (typeKey.includes("/") ? typeKey.split("/").pop() ?? "" : typeKey);
    const label = typeLabel || "Unknown";
    if (!typeStats[label]) {
      typeStats[label] = { count: 0, totalPrice: 0, min: Infinity, max: -Infinity };
    }
    typeStats[label].count++;
    typeStats[label].totalPrice += sale.price;
    typeStats[label].min = Math.min(typeStats[label].min, sale.price);
    typeStats[label].max = Math.max(typeStats[label].max, sale.price);
  }
  const typeEntries = Object.entries(typeStats)
    .filter(([key]) => key !== "Unknown")
    .sort(([, a], [, b]) => b.count - a.count);

  // Overall price range
  const allPrices = data.recentSales.map((s) => s.price).filter((p) => p > 0);
  const priceMin = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const priceMax = allPrices.length > 0 ? Math.max(...allPrices) : 0;

  return (
    <div data-component="housePricesPanel" className="bg-background border border-border rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">House Prices</h3>
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.556rem] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          HM Land Registry
        </a>
      </div>

      {/* Headline — average price */}
      {latest && (
        <div className="bg-muted rounded-xl p-3 flex items-center justify-between">
          <div>
            <SectionLabel>Average Price</SectionLabel>
            <div className="text-xl font-bold text-zinc-100 mt-0.5">
              {latest.averagePrice != null
                ? `£${Number(latest.averagePrice).toLocaleString()}`
                : "—"}
              {annualChange != null && (
                <span
                  className={`text-xs ml-2 ${
                    isPositive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {isPositive ? "▲" : "▼"} {Math.abs(annualChange).toFixed(1)}%
                </span>
              )}
            </div>
            {latest.salesVolume != null && (
              <div className="text-[0.556rem] text-zinc-500 mt-0.5">
                {Number(latest.salesVolume).toLocaleString()} sales
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[0.556rem] text-zinc-600">
              {latest.period ?? ""}
            </div>
            {annualChange != null && (
              <div className="text-[0.556rem] text-zinc-600 mt-0.5">Annual change</div>
            )}
          </div>
        </div>
      )}

      {/* Property type breakdown + price range */}
      {typeEntries.length > 0 && (
        <div>
          <SectionLabel className="mb-2">By Property Type</SectionLabel>
          <div className="bg-muted rounded-xl p-3 space-y-2">
            {typeEntries.map(([label, stats]) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-zinc-200 font-medium">{label}</span>
                  <span className="text-zinc-600">({stats.count})</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-zinc-100 font-semibold">
                    {formatPrice(Math.round(stats.totalPrice / stats.count))}
                  </span>
                  <span className="text-zinc-600 text-[0.556rem] ml-1.5">
                    avg
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allPrices.length > 0 && (
        <div className="bg-muted rounded-xl p-3 flex items-center justify-between">
          <div>
            <SectionLabel>Price Range</SectionLabel>
            <div className="text-xs text-zinc-200 mt-0.5">
              {formatPrice(priceMin)} &mdash; {formatPrice(priceMax)}
            </div>
          </div>
          <div className="text-right">
            <SectionLabel>Sales</SectionLabel>
            <div className="text-xs text-zinc-200 mt-0.5">{allPrices.length}</div>
          </div>
        </div>
      )}

      {/* Recent sales */}
      {data.recentSales.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Recent Sales</SectionLabel>
          <div className="space-y-1.5 max-h-[15.556rem] overflow-y-auto pr-1">
            {data.recentSales.slice(0, 10).map((sale, i) => {
              const typeKey = sale.type ?? "";
              const typeLabel =
                TYPE_LABELS[typeKey] ?? (typeKey.includes("/") ? typeKey.split("/").pop() ?? "" : typeKey);
              return (
                <div
                  key={i}
                  className="bg-muted rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-200 truncate">
                      {sale.address || "Address unavailable"}
                    </div>
                    <div className="text-[0.556rem] text-zinc-500 flex items-center gap-2 mt-0.5">
                      <span>{formatGbDate(sale.date)}</span>
                      {typeLabel && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span>{typeLabel}</span>
                        </>
                      )}
                      {sale.newBuild && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="text-emerald-500">New</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-zinc-100 shrink-0">
                    {formatPrice(sale.price)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
