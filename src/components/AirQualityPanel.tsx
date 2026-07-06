"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface AQParameter {
  parameter: string;
  lastValue: number;
  unit: string;
}

interface AQStation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  parameters: AQParameter[];
}

interface AirQualityData {
  stations: AQStation[];
  source: "live" | "fallback" | string;
  note?: string;
}

// UK DAQI-aligned thresholds for common pollutants (WHO / UK guidelines)
const THRESHOLDS: Record<string, { good: number; moderate: number; unit: string; label: string }> = {
  pm25:  { good: 10,  moderate: 25,  unit: "µg/m³", label: "PM2.5" },
  pm10:  { good: 20,  moderate: 50,  unit: "µg/m³", label: "PM10" },
  no2:   { good: 40,  moderate: 100, unit: "µg/m³", label: "NO₂" },
  o3:    { good: 60,  moderate: 100, unit: "µg/m³", label: "O₃" },
  so2:   { good: 20,  moderate: 80,  unit: "µg/m³", label: "SO₂" },
  co:    { good: 4,   moderate: 10,  unit: "mg/m³",  label: "CO" },
};

function normKey(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]/g, "").replace(".", "");
}

function aqBand(paramKey: string, value: number): { label: string; color: string; bg: string } {
  const t = THRESHOLDS[paramKey];
  if (!t) return { label: "—", color: "text-zinc-500", bg: "bg-zinc-500/10" };
  if (value <= t.good)    return { label: "Good",     color: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (value <= t.moderate)return { label: "Moderate", color: "text-amber-400",   bg: "bg-amber-500/10" };
  return                         { label: "Poor",      color: "text-red-400",     bg: "bg-red-500/10" };
}

function displayParam(raw: string): { key: string; label: string } {
  const k = normKey(raw);
  const t = Object.entries(THRESHOLDS).find(([key]) => k.includes(key));
  if (t) return { key: t[0], label: t[1].label };
  return { key: raw, label: raw.toUpperCase() };
}

export default function AirQualityPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<AirQualityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(withConstituency("/api/air-quality", slug))
      .then((r) => r.json())
      .then((d: AirQualityData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-zinc-500">Loading air quality data...</div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.source === "fallback" || data.stations.length === 0) {
    return (
      <div className="p-4 space-y-3 text-center">
        <p className="text-xs text-zinc-500">
          Live air quality data requires an OpenAQ API key.
        </p>
        <a
          href="https://openaq.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          Register free at openaq.org ↗
        </a>
        <p className="text-[10px] text-zinc-600 mt-1">
          Set <code className="text-zinc-500">OPENAQ_API_KEY</code> in your environment.
        </p>
      </div>
    );
  }

  // Aggregate readings across stations — pick the nearest / best reading per pollutant
  const aggregated: Record<string, { value: number; unit: string; stationName: string }> = {};
  for (const station of data.stations) {
    for (const p of station.parameters) {
      const { key, label } = displayParam(p.parameter);
      if (!(key in aggregated)) {
        aggregated[key] = { value: p.lastValue, unit: p.unit || THRESHOLDS[key]?.unit || "", stationName: station.name };
      }
    }
  }

  const pollutants = Object.entries(aggregated).filter(([key]) => key in THRESHOLDS);
  const others = Object.entries(aggregated).filter(([key]) => !(key in THRESHOLDS));

  // Overall air quality = worst band across known pollutants
  const bands = pollutants.map(([key, { value }]) => aqBand(key, value));
  const overallBand = bands.some(b => b.label === "Poor") ? "Poor"
    : bands.some(b => b.label === "Moderate") ? "Moderate"
    : bands.length > 0 ? "Good" : null;

  const overallColor = overallBand === "Poor" ? "text-red-400"
    : overallBand === "Moderate" ? "text-amber-400"
    : "text-emerald-400";

  return (
    <div className="p-4 space-y-4">
      {/* Headline */}
      <div className="flex items-center justify-between">
        <div>
          {overallBand && (
            <div className={`text-2xl font-bold ${overallColor}`}>{overallBand}</div>
          )}
          <div className="text-[11px] text-zinc-500">
            {data.stations.length} monitoring station{data.stations.length !== 1 ? "s" : ""} nearby
          </div>
        </div>
        <div className="text-right text-[10px] text-zinc-600">OpenAQ</div>
      </div>

      {/* Known pollutants */}
      {pollutants.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Pollutants</div>
          {pollutants.map(([key, { value, unit }]) => {
            const band = aqBand(key, value);
            const t = THRESHOLDS[key];
            const pct = Math.min((value / (t.moderate * 1.5)) * 100, 100);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] text-zinc-400">{t.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-zinc-300">
                      {value.toFixed(1)} {unit}
                    </span>
                    <span className={`text-[10px] font-medium ${band.color}`}>{band.label}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: band.label === "Good" ? "#34d399" : band.label === "Moderate" ? "#fbbf24" : "#f87171" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stations list */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Stations</div>
        <div className="space-y-1">
          {data.stations.slice(0, 5).map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-muted/30 rounded px-2.5 py-1.5">
              <span className="text-[11px] text-zinc-400 truncate">{s.name}</span>
              <span className="text-[10px] text-zinc-600 shrink-0 ml-2">{s.parameters.length} param{s.parameters.length !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 text-center pt-1">
        <a href="https://openaq.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">
          OpenAQ
        </a>
        {" · live readings"}
      </div>
    </div>
  );
}
