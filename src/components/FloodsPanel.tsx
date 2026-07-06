"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface FloodWarning {
  id: string;
  description: string;
  severity: string;
  severityLevel: number;
  message: string;
  timeRaised: string;
  area: string;
}

interface MonitoringStation {
  id: string;
  label: string;
  lat: number;
  lng: number;
  river: string;
  type: string;
  latestValue: number | null;
  latestDate: string | null;
  unit: string;
}

interface FloodData {
  warnings: FloodWarning[];
  stations: MonitoringStation[];
  activeWarnings: number;
  source: string;
  sourceUrl?: string;
  northernIreland?: boolean;
  scotland?: boolean;
  error?: string;
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  Severe:         { label: "Severe",       color: "text-red-400",    bg: "bg-red-500/15 border-red-500/30" },
  Warning:        { label: "Warning",      color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  Alert:          { label: "Alert",        color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/30" },
  "No Longer":    { label: "No Longer",    color: "text-zinc-500",   bg: "bg-zinc-500/10 border-zinc-500/20" },
};

function severityConfig(severity: string) {
  return SEVERITY_CONFIG[severity] ?? { label: severity, color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function FloodsPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<FloodData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(withConstituency("/api/floods", slug))
      .then((r) => r.json())
      .then((d: FloodData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-zinc-500">Loading flood data...</div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (data?.northernIreland) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Flood monitoring in Northern Ireland is managed by the Department for Infrastructure Rivers.
        </p>
        <a
          href="https://www.infrastructure-ni.gov.uk/topics/rivers"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          View NI Rivers data ↗
        </a>
      </div>
    );
  }

  if (data?.scotland) {
    return (
      <div className="p-4 space-y-2 text-center">
        <p className="text-xs text-zinc-500">
          Flood monitoring in Scotland is managed by SEPA (Scottish Environment Protection Agency).
        </p>
        <a
          href="https://www.sepa.org.uk/environment/water/flooding/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          View SEPA flood data ↗
        </a>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <p className="text-xs text-zinc-500">Flood data unavailable for this constituency.</p>
      </div>
    );
  }

  const activeWarnings = data.warnings.filter((w) => w.severityLevel >= 1 && w.severityLevel <= 3);
  const stations = data.stations.slice(0, 6);

  return (
    <div className="p-4 space-y-4">
      {/* Status headline */}
      <div className="flex items-center gap-3">
        <div
          className={`h-3 w-3 rounded-full shrink-0 ${
            activeWarnings.some((w) => w.severityLevel === 1)
              ? "bg-red-500 animate-pulse"
              : activeWarnings.some((w) => w.severityLevel === 2)
              ? "bg-orange-500"
              : activeWarnings.length > 0
              ? "bg-amber-500"
              : "bg-emerald-500"
          }`}
        />
        <div>
          <div className="text-sm font-semibold text-zinc-200">
            {activeWarnings.length === 0
              ? "No active flood warnings"
              : `${activeWarnings.length} active warning${activeWarnings.length !== 1 ? "s" : ""}`}
          </div>
          <div className="text-[10px] text-zinc-500">Environment Agency · England &amp; Wales</div>
        </div>
      </div>

      {/* Active warnings */}
      {activeWarnings.length > 0 && (
        <div className="space-y-2">
          {activeWarnings.map((w) => {
            const cfg = severityConfig(w.severity);
            return (
              <div key={w.id} className={`border rounded-lg p-3 ${cfg.bg}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-[10px] text-zinc-500">{formatDate(w.timeRaised)}</span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-snug">{w.description || w.area}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* River monitoring stations */}
      {stations.length > 0 && (
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
            Nearby monitoring stations
          </div>
          <div className="space-y-1.5">
            {stations.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-300 truncate">{s.label}</div>
                  {s.river && <div className="text-[10px] text-zinc-600">{s.river}</div>}
                </div>
                {s.latestValue !== null && (
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-[12px] font-semibold text-zinc-200">
                      {s.latestValue.toFixed(2)}{s.unit}
                    </div>
                    <div className="text-[10px] text-zinc-600">{formatDate(s.latestDate)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeWarnings.length === 0 && stations.length === 0 && (
        <p className="text-xs text-zinc-500 text-center py-2">
          No flood warnings or monitoring stations found in this area.
        </p>
      )}

      <div className="text-[10px] text-zinc-600 text-center pt-1">
        <a
          href="https://check-for-flooding.service.gov.uk/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-400"
        >
          Check for Flooding (gov.uk)
        </a>
      </div>
    </div>
  );
}
