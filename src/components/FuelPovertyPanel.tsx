"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface FuelPovertyData {
  fuelPoorHouseholds: number;
  totalHouseholds: number;
  fuelPovertyPct: number;
  nationalAveragePct: number;
  year: number;
  areaName: string;
  source: string;
  scotland?: boolean;
  northernIreland?: boolean;
  wales?: boolean;
  sourceUrl?: string;
  note?: string;
  error?: string;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-GB");
}

export default function FuelPovertyPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<FuelPovertyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(withConstituency("/api/fuel-poverty", slug))
      .then((r) => r.json())
      .then((d: FuelPovertyData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-zinc-500">Loading fuel poverty data...</div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // Nation redirects
  if (data?.scotland) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Fuel poverty in Scotland is measured by the Scottish House Condition Survey.
        </p>
        <a
          href={data.sourceUrl ?? "https://www.gov.scot/publications/scottish-house-condition-survey-2022-key-findings/"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          Scottish Government fuel poverty data ↗
        </a>
      </div>
    );
  }

  if (data?.northernIreland) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Fuel poverty in Northern Ireland is measured by the NI Housing Executive House Condition Survey.
        </p>
        <a
          href={data.sourceUrl ?? "https://www.nihe.gov.uk/Working-With-Us/Research/House-Condition-Survey"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          NIHE House Condition Survey ↗
        </a>
      </div>
    );
  }

  if (data?.wales) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Fuel poverty in Wales is reported by the Welsh Government.
        </p>
        <a
          href={data.sourceUrl ?? "https://www.gov.wales/fuel-poverty"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          Welsh Government fuel poverty statistics ↗
        </a>
      </div>
    );
  }

  if (!data || data.source === "not-available" || data.source === "error") {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Constituency-level fuel poverty data is not currently available.
        </p>
        <a
          href="https://www.gov.uk/government/collections/fuel-poverty-sub-regional-statistics"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          DESNZ sub-regional fuel poverty data ↗
        </a>
      </div>
    );
  }

  const vsNational = data.fuelPovertyPct - data.nationalAveragePct;
  const aboveAverage = vsNational > 0.5;
  const belowAverage = vsNational < -0.5;

  // Bar width: proportion of total households
  const barPct = Math.min((data.fuelPovertyPct / 30) * 100, 100);
  const natBarPct = Math.min((data.nationalAveragePct / 30) * 100, 100);

  return (
    <div className="p-4 space-y-4">
      {/* Headline */}
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-zinc-100">
            {data.fuelPovertyPct.toFixed(1)}%
          </span>
          <span className="text-sm text-zinc-400">of households</span>
        </div>
        <div className="text-[11px] text-zinc-500 mt-0.5">
          in fuel poverty · LILEE definition · {data.year}
        </div>
      </div>

      {/* vs national average */}
      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-400">This constituency</span>
            <span className="text-[11px] font-semibold text-zinc-200">{data.fuelPovertyPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${barPct}%`,
                backgroundColor: aboveAverage ? "#f87171" : belowAverage ? "#34d399" : "#fbbf24",
              }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-500">England average</span>
            <span className="text-[11px] text-zinc-500">{data.nationalAveragePct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-zinc-600"
              style={{ width: `${natBarPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Comparison badge */}
      <div className={`rounded-lg px-3 py-2 text-[11px] ${aboveAverage ? "bg-red-500/10 text-red-400" : belowAverage ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-500/10 text-zinc-400"}`}>
        {aboveAverage
          ? `${Math.abs(vsNational).toFixed(1)}pp above the England average`
          : belowAverage
          ? `${Math.abs(vsNational).toFixed(1)}pp below the England average`
          : "Broadly in line with the England average"}
      </div>

      {/* Household count */}
      {data.fuelPoorHouseholds > 0 && (
        <div className="flex items-center justify-between text-[11px] bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-zinc-500">Fuel poor households</span>
          <span className="font-semibold text-zinc-200">{formatNum(data.fuelPoorHouseholds)}</span>
        </div>
      )}
      {data.totalHouseholds > 0 && (
        <div className="flex items-center justify-between text-[11px] bg-muted/30 rounded-lg px-3 py-2">
          <span className="text-zinc-500">Total households</span>
          <span className="font-semibold text-zinc-200">{formatNum(data.totalHouseholds)}</span>
        </div>
      )}

      <div className="text-[10px] text-zinc-600 text-center pt-1">
        <a
          href="https://www.gov.uk/government/collections/fuel-poverty-sub-regional-statistics"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-400"
        >
          DESNZ sub-regional fuel poverty statistics
        </a>
      </div>
    </div>
  );
}
