"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { getFullData } from "@/data";
import PanelSkeleton from "@/components/ui/PanelSkeleton";
import PanelError from "@/components/ui/PanelError";
import { ecIndicatorStyle, partyColor, partyLabel } from "@/lib/palette";
import type { ConstituencyPrediction as ECConstituencyData } from "@/app/api/electoral-calculus/route";

type View = "results" | "prediction" | "wards";

// Wrapper for the data layer's long-form party names (e.g. "Conservative and
// Unionist Party"). Returns the short label + canonical colour from the
// shared palette.
interface PartyMeta { label: string; color: string; }
function partyMeta(longName: string): PartyMeta {
  return { label: partyLabel(longName), color: partyColor(longName) };
}

interface ResultRow {
  party: string;        // short display name
  candidate: string;    // real candidate name from data layer, or "<Party> Candidate" fallback
  votes: number;
  percentage: number;
  color: string;
}

interface DerivedResults {
  year: number;
  turnout: number;      // percentage
  majority: number;     // percentage (winner share - runner-up share)
  electorate: number;
  results: ResultRow[];
}

// Build the 2024 results view from the data layer for the active constituency.
// Top 5 by votes shown individually; the rest are grouped as "Other".
function deriveResults(slug: string): DerivedResults | null {
  const data = getFullData(slug);
  if (!data) return null;
  const candidates = data.candidates ?? [];
  const r2024 = data.constituency.results2024;

  if (candidates.length === 0) {
    return {
      year: 2024,
      turnout: r2024.turnoutPct,
      majority: 0,
      electorate: data.constituency.electorate,
      results: [],
    };
  }

  const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  const rows: ResultRow[] = top.map((c) => {
    const meta = partyMeta(c.party);
    return {
      party: meta.label,
      candidate: c.name,
      votes: c.votes,
      percentage: c.share,
      color: meta.color,
    };
  });

  if (rest.length > 0) {
    const otherVotes = rest.reduce((sum, c) => sum + c.votes, 0);
    const otherShare = rest.reduce((sum, c) => sum + c.share, 0);
    rows.push({
      party: "Other",
      candidate: `${rest.length} candidate${rest.length === 1 ? "" : "s"}`,
      votes: otherVotes,
      percentage: Math.round(otherShare * 10) / 10,
      color: "#999999",
    });
  }

  const winner = sorted[0];
  const runnerUp = sorted[1];
  const majorityPct = runnerUp ? Math.round((winner.share - runnerUp.share) * 10) / 10 : winner.share;

  return {
    year: 2024,
    turnout: r2024.turnoutPct,
    majority: majorityPct,
    electorate: data.constituency.electorate,
    results: rows,
  };
}


// Convert live EC constituency data to the shape used by ecPrediction
function toLiveEcPrediction(ec: ECConstituencyData) {
  const predicted: Record<string, number> = {};
  const keyMap: Record<string, string> = { CON: "CON", LAB: "LAB", Reform: "Reform", LIB: "LIB", Green: "Green" };
  for (const [ecKey, ourKey] of Object.entries(keyMap)) {
    if (ec.predicted[ecKey]?.share) {
      predicted[ourKey] = ec.predicted[ecKey].share;
    }
  }
  return {
    prediction: ec.prediction,
    predicted,
    winningChances: ec.winningChances,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
}

// Convert live EC ward data to the shape used by wardElectoralCalc
function toLiveWardData(wards: ECConstituencyData["wards"]): Record<string, { electorate: number; winner2024: string; predictedWinner: string }> {
  const result: Record<string, { electorate: number; winner2024: string; predictedWinner: string }> = {};
  for (const w of wards) {
    if (w.ward) {
      result[w.ward] = {
        electorate: w.electorate,
        winner2024: w.winner2024,
        predictedWinner: w.predictedWinner,
      };
    }
  }
  return result;
}

/**
 * showIndicators: render EC's 'Political and Demographic indicators' table
 * in the MRP view. Enabled on the Political tab only — the map-tab instance
 * stays compact.
 */
/** Coloured indicator cell, styled like the EC seat page (party colours and
 * 5-step scale backgrounds via CSS variables — see ecIndicatorStyle). */
function IndicatorCell({ value, cls, emphasis = false }: { value: string; cls: string; emphasis?: boolean }) {
  const style = value ? ecIndicatorStyle(cls) : null;
  return (
    <td
      data-ec-class={cls || undefined}
      className={`py-1 px-1.5 text-center ${emphasis ? "font-semibold" : ""} ${
        style ? "" : emphasis ? "text-foreground" : "text-zinc-500"
      }`}
      style={style ?? undefined}
    >
      {value}
    </td>
  );
}

export default function ElectoralIntel({ showIndicators = false }: { showIndicators?: boolean }) {
  const { slug } = useConstituency();
  const results2024 = deriveResults(slug);
  const [view, setView] = useState<View>("prediction");
  const [indicators, setIndicators] = useState<ECConstituencyData["indicators"]>(null);
  // No default/fallback prediction data — starts empty; failures surface as
  // an error message, never as another constituency's numbers.
  const [ecPrediction, setEcPrediction] = useState<{
    prediction: string;
    predicted: Record<string, number>;
    winningChances: Record<string, number>;
    lastUpdated: string;
  } | null>(null);
  const [wardElectoralCalc, setWardElectoralCalc] = useState<
    Record<string, { electorate: number; winner2024: string; predictedWinner: string }>
  >({});
  const [ecLoading, setEcLoading] = useState(true);
  const [ecError, setEcError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return; // auth still loading — effect re-runs when slug resolves
    async function fetchLiveEC() {
      setEcLoading(true);
      setEcError(null);
      setEcPrediction(null);
      setWardElectoralCalc({});
      setIndicators(null);
      try {
        const res = await fetch(withConstituency("/api/electoral-calculus?type=seat", slug));
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { message?: string; error?: string; detail?: string }
            | null;
          setEcError(body?.message ?? body?.detail ?? body?.error ?? `Request failed (${res.status})`);
          return;
        }
        const data: ECConstituencyData = await res.json();
        if (data.prediction && Object.keys(data.predicted).length > 0) {
          setEcPrediction(toLiveEcPrediction(data));
          setIndicators(data.indicators ?? null);
        } else {
          setEcError("Electoral Calculus returned no prediction for this seat.");
        }
        if (data.wards && data.wards.length > 0) {
          const liveWards = toLiveWardData(data.wards);
          if (Object.keys(liveWards).length > 0) {
            setWardElectoralCalc(liveWards);
          }
        }
      } catch (err) {
        setEcError((err as Error).message || "Unable to reach Electoral Calculus");
      } finally {
        setEcLoading(false);
      }
    }
    fetchLiveEC();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const tabs: { key: View; label: string }[] = [
    { key: "prediction", label: "MRP Forecast" },
    { key: "results", label: "2024 Results" },
    { key: "wards", label: "Ward Map" },
  ];

  const wards = Object.entries(wardElectoralCalc);
  const swings = wards.filter(([, d]) => d.winner2024 !== d.predictedWinner);
  const wardCounts: Record<string, number> = {};
  for (const [, d] of wards) wardCounts[d.predictedWinner] = (wardCounts[d.predictedWinner] || 0) + 1;

  return (
    <div data-component="electoralIntel">
      {/* View tabs */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`flex-1 px-2 py-1.5 text-[0.611rem] font-medium transition-colors ${
              view === t.key ? "text-emerald-400 border-b-2 border-emerald-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 2024 Results */}
      {view === "results" && (
        <div className="p-4 space-y-3">
          {!results2024 ? (
            <div className="text-[0.611rem] text-zinc-500 text-center py-8">
              2024 results not available for this constituency.
            </div>
          ) : (
            <>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>General Election {results2024.year}</span>
                <span>Turnout: {results2024.turnout}%</span>
              </div>
              {results2024.results.length === 0 ? (
                <div className="text-[0.611rem] text-zinc-500 text-center py-4">
                  Candidate data not yet sourced for this constituency.
                </div>
              ) : (
                <div className="space-y-2">
                  {results2024.results.map((r) => (
                    <div key={r.party}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="text-[0.667rem] text-zinc-300">{r.party}</span>
                        </div>
                        <span className="text-[0.667rem] font-medium text-zinc-200">{r.percentage}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.percentage}%`, backgroundColor: r.color }} />
                      </div>
                      <div className="text-[0.556rem] text-zinc-600 mt-0.5">
                        {r.candidate} · {r.votes.toLocaleString()} votes
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[0.556rem] text-zinc-600 text-center">
                Majority: {results2024.majority}% · Electorate: {results2024.electorate.toLocaleString()}
              </div>
            </>
          )}
        </div>
      )}

      {/* MRP Prediction */}
      {view === "prediction" && ecLoading && <PanelSkeleton variant="list" rows={3} />}
      {view === "prediction" && !ecLoading && !ecPrediction && (
        <PanelError message={ecError ?? "Electoral Calculus prediction unavailable."} />
      )}
      {view === "prediction" && !ecLoading && ecPrediction && (
        <div className="p-4 space-y-3">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <div className="text-[11px] text-zinc-500 mb-1">Constituency Prediction</div>
            <div className="text-base font-bold text-cyan-400">{ecPrediction.prediction}</div>
          </div>

          {/* Winning chances */}
          <div className="flex justify-center gap-4">
            {Object.entries(ecPrediction.winningChances)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([party, chance]) => (
                <div key={party} className="text-center">
                  <div className="text-xl font-bold" style={{ color: partyColor(party) }}>
                    {chance}%
                  </div>
                  <div className="text-[0.556rem] text-zinc-500">{party}</div>
                </div>
              ))}
          </div>

          {/* Predicted shares */}
          <div className="space-y-1.5">
            <div className="text-[0.611rem] text-zinc-500 font-medium">Predicted Vote Share</div>
            {Object.entries(ecPrediction.predicted)
              .filter(([k]) => k !== "OTH")
              .sort((a, b) => b[1] - a[1])
              .map(([party, share]) => (
                <div key={party} className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 w-14">{party}</span>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${share * 2}%`, backgroundColor: partyColor(party), opacity: 0.8 }} />
                  </div>
                  <span className="text-[0.611rem] text-zinc-300 font-medium w-10 text-right">{share}%</span>
                </div>
              ))}
          </div>

          {/* Political & demographic indicators — political tab only */}
          {showIndicators && indicators && indicators.rows.length > 0 ? (
            <div data-component="ecIndicators" className="pt-2">
              <div className="text-[0.611rem] text-zinc-500 font-medium mb-1.5">
                Political &amp; Demographic Indicators
              </div>
              <table className="w-full text-[0.611rem]">
                <thead>
                  <tr className="text-zinc-500 uppercase tracking-wider text-[0.5rem]">
                    <th className="text-left font-medium py-1">Indicator</th>
                    <th className="text-center font-medium py-1">Seat</th>
                    <th className="text-center font-medium py-1">{indicators.areaName}</th>
                    <th className="text-center font-medium py-1">All GB</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.rows.map((row) => (
                    <tr key={row.name} className="border-t border-border/40">
                      <td className="py-1 pr-2 text-zinc-400">{row.name}</td>
                      <IndicatorCell value={row.seat} cls={row.seatClass} emphasis />
                      <IndicatorCell value={row.area} cls={row.areaClass} />
                      <IndicatorCell value={row.gb} cls={row.gbClass} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="text-[0.556rem] text-zinc-700 text-center">
            Source: Electoral Calculus MRP <span className="text-emerald-600 ml-1">(live)</span>
          </div>
        </div>
      )}

      {/* Ward breakdown */}
      {view === "wards" && !ecLoading && wards.length === 0 && (
        <PanelError message={ecError ?? "No ward-level Electoral Calculus data for this seat."} />
      )}
      {view === "wards" && ecLoading && <PanelSkeleton variant="list" rows={4} />}
      {view === "wards" && !ecLoading && wards.length > 0 && (
        <div className="p-3 space-y-3">
          {/* Ward summary */}
          <div className="flex gap-2">
            {Object.entries(wardCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([party, count]) => (
                <div key={party} className="flex-1 bg-muted/30 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold" style={{ color: partyColor(party) }}>{count}</div>
                  <div className="text-[10px] text-zinc-500">{party}</div>
                </div>
              ))}
          </div>
          <div className="text-[0.556rem] text-zinc-600 text-center">{swings.length} wards predicted to change hands</div>

          {/* Ward table */}
          <div className="overflow-auto max-h-[250px]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-zinc-500 border-b border-border">
                  <th className="text-left py-1 font-medium">Ward</th>
                  <th className="text-center py-1 font-medium">2024</th>
                  <th className="text-center py-1 font-medium">Pred</th>
                  <th className="text-right py-1 font-medium">Elect.</th>
                </tr>
              </thead>
              <tbody>
                {wards.map(([name, data]) => {
                  const changed = data.winner2024 !== data.predictedWinner;
                  return (
                    <tr key={name} className={`border-b border-border/30 ${changed ? "bg-red-500/5" : ""}`}>
                      <td className="py-1 text-zinc-300">{name}</td>
                      <td className="text-center">
                        <span style={{ color: partyColor(data.winner2024) }}>{data.winner2024}</span>
                      </td>
                      <td className="text-center">
                        <span style={{ color: partyColor(data.predictedWinner) }}>
                          {data.predictedWinner}
                          {changed && " \u26A1"}
                        </span>
                      </td>
                      <td className="text-right text-zinc-500">{data.electorate.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[0.556rem] text-zinc-700 text-center">
            Source: Electoral Calculus MRP <span className="text-emerald-600 ml-1">(live)</span>
          </div>
        </div>
      )}
    </div>
  );
}
