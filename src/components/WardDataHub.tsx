"use client";

import { useState, useMemo } from "react";
import {
  wardData,
  wardElectoralCalc,
  wardDemographics,
  demographics,
  type DemographicSet,
} from "@/data/braintree";
import { partyColor as partyColorOf } from "@/lib/palette";
import SectionLabel from "./ui/SectionLabel";
import DataTable, { type DataTableColumn } from "./ui/DataTable";
import { useConstituency } from "@/hooks/useConstituency";

/* ── helpers ────────────────────────────────────────────────── */

const partyColor: Record<string, string> = {
  CON: partyColorOf("CON"),
  LAB: partyColorOf("LAB"),
  Reform: partyColorOf("Reform"),
  LD: partyColorOf("LIB"),
  Green: partyColorOf("Green"),
};

const partyBg: Record<string, string> = {
  CON: "bg-blue-500/20 text-blue-400",
  LAB: "bg-red-500/20 text-red-400",
  Reform: "bg-cyan-500/20 text-cyan-400",
  LD: "bg-yellow-500/20 text-yellow-400",
  Green: "bg-green-500/20 text-green-400",
};

const depBg: Record<string, string> = {
  Low: "bg-emerald-500/20 text-emerald-400",
  "Low-Medium": "bg-emerald-500/10 text-emerald-500",
  Medium: "bg-yellow-500/20 text-yellow-400",
  "Medium-High": "bg-orange-500/20 text-orange-400",
  High: "bg-red-500/20 text-red-400",
};

const depOrder: Record<string, number> = {
  Low: 1,
  "Low-Medium": 2,
  Medium: 3,
  "Medium-High": 4,
  High: 5,
};

/* ── enriched ward type ─────────────────────────────────────── */

interface EnrichedWard {
  name: string;
  population: number;
  deprivation: string;
  conVote: number;
  refVote: number;
  labVote: number;
  ldVote: number;
  grnVote: number;
  electorate: number;
  winner2024: string;
  predictedWinner: string;
  swing: boolean;
}

function buildWards(): EnrichedWard[] {
  return wardData.map((w) => {
    const ec = wardElectoralCalc[w.name];
    return {
      ...w,
      electorate: ec?.electorate ?? 0,
      winner2024: ec?.winner2024 ?? "—",
      predictedWinner: ec?.predictedWinner ?? "—",
      swing: ec ? ec.winner2024 !== ec.predictedWinner : false,
    };
  });
}

/* ── bar helper ──────────────────────────────────────────────── */

function VoteBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[0.611rem]">
      <span className="w-10 text-zinc-500 text-right shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-zinc-300 font-medium tabular-nums">{pct}%</span>
    </div>
  );
}

/* ── demographic mini-section ─────────────────────────────── */

const catColors: Record<string, string[]> = {
  age: ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"],
  ethnicity: ["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"],
  housing: ["#10b981", "#ef4444", "#f59e0b", "#8b5cf6"],
  education: ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"],
};

function getLabel(item: Record<string, unknown>) {
  return (item.group || item.type || item.level || "") as string;
}

function DemoSection({
  label,
  catKey,
  data,
  avg,
}: {
  label: string;
  catKey: string;
  data: { percentage: number; [k: string]: unknown }[];
  avg: { percentage: number; [k: string]: unknown }[];
}) {
  const colors = catColors[catKey] ?? catColors.age;
  return (
    <div>
      <div className="text-[0.556rem] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">{label}</div>
      <div className="h-4 rounded-full overflow-hidden flex mb-1.5">
        {data.map((item, i) => (
          <div
            key={i}
            style={{ width: `${item.percentage}%`, backgroundColor: colors[i % colors.length] }}
            title={`${getLabel(item as Record<string, unknown>)}: ${item.percentage}%`}
          />
        ))}
      </div>
      <div className="space-y-0.5">
        {data.map((item, i) => {
          const lbl = getLabel(item as Record<string, unknown>);
          const avgItem = avg.find((a) => getLabel(a as Record<string, unknown>) === lbl);
          const diff = avgItem ? item.percentage - avgItem.percentage : 0;
          return (
            <div key={lbl} className="flex items-center gap-1 text-[0.556rem]">
              <div
                className="w-1.5 h-1.5 rounded-sm shrink-0"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-zinc-500 flex-1 truncate">{lbl}</span>
              <span className="text-zinc-300 tabular-nums">{item.percentage}%</span>
              {diff !== 0 && (
                <span
                  className={`text-[0.444rem] tabular-nums ${diff > 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {diff > 0 ? "+" : ""}
                  {diff.toFixed(1)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function WardDataHub() {
  const { slug, name: constituencyName } = useConstituency();
  const wards = useMemo(buildWards, []);
  const [selected, setSelected] = useState<string | null>(null);

  if (slug !== "braintree") {
    return (
      <div className="p-4 text-center">
        <div className="text-xs text-zinc-500">
          Ward-level data not yet available for {constituencyName}.
        </div>
      </div>
    );
  }

  const detail = selected ? wards.find((w) => w.name === selected) : null;
  const detailDemo: DemographicSet | null =
    selected && wardDemographics[selected] ? wardDemographics[selected] : null;

  const columns: DataTableColumn<EnrichedWard>[] = [
    {
      key: "name",
      label: "Ward",
      sort: "string",
      render: (w) => (
        <span className="text-zinc-200 font-medium whitespace-nowrap">
          {w.name}
          {w.swing && (
            <span className="ml-1 text-[0.444rem] text-amber-400" title="Predicted to swing">
              SWING
            </span>
          )}
        </span>
      ),
    },
    {
      key: "population",
      label: "Pop",
      sort: "number",
      align: "right",
      className: "tabular-nums text-zinc-400",
      render: (w) => w.population.toLocaleString(),
    },
    {
      key: "deprivation",
      label: "Deprivation",
      sort: "number",
      align: "center",
      accessor: (w) => depOrder[w.deprivation] ?? 0,
      render: (w) => (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[0.5rem] font-medium ${
            depBg[w.deprivation] ?? "bg-zinc-800 text-zinc-400"
          }`}
        >
          {w.deprivation}
        </span>
      ),
    },
    { key: "winner2024", label: "2024", align: "center", render: (w) => <PartyChip party={w.winner2024} /> },
    { key: "predictedWinner", label: "Predicted", align: "center", render: (w) => <PartyChip party={w.predictedWinner} /> },
    { key: "conVote", label: "CON", sort: "number", align: "right", className: "tabular-nums text-zinc-400", render: (w) => `${w.conVote}%` },
    { key: "refVote", label: "REF", sort: "number", align: "right", className: "tabular-nums text-zinc-400", render: (w) => `${w.refVote}%` },
    { key: "labVote", label: "LAB", align: "right", className: "tabular-nums text-zinc-400", render: (w) => `${w.labVote}%` },
    { key: "electorate", label: "Electorate", align: "right", className: "tabular-nums text-zinc-400", render: (w) => (w.electorate ? w.electorate.toLocaleString() : "—") },
  ];

  return (
    <div data-component="wardDataHub" className="p-3 space-y-3">
      {/* ── SUMMARY TABLE ──────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <DataTable
          rows={wards}
          columns={columns}
          getRowId={(w) => w.name}
          density="tight"
          initialSort={{ key: "name", dir: "asc" }}
          onRowClick={(w) => setSelected(selected === w.name ? null : w.name)}
          rowClassName={(w) =>
            selected === w.name ? "bg-emerald-500/10" : "hover:bg-muted/40"
          }
          headerRowClassName="bg-muted/60 uppercase tracking-wider"
          className="text-[10px]"
        />
      </div>

      {/* ── DETAIL CARD ────────────────────────────────────── */}
      {detail && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-4">
          {/* header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">{detail.name}</h3>
              <div className="flex items-center gap-3 mt-1 text-[0.556rem] text-zinc-500">
                <span>Pop {detail.population.toLocaleString()}</span>
                <span>Electorate {detail.electorate.toLocaleString()}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[0.5rem] font-medium ${
                    depBg[detail.deprivation] ?? ""
                  }`}
                >
                  {detail.deprivation} deprivation
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-zinc-600 hover:text-zinc-300 text-xs transition-colors"
            >
              Close
            </button>
          </div>

          {/* swing indicator */}
          {detail.swing && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-400 text-[0.611rem] font-medium">Swing ward</span>
              <span className="text-[0.556rem] text-zinc-400">
                {detail.winner2024} &rarr; {detail.predictedWinner}
              </span>
            </div>
          )}

          {/* electoral */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">2024 Winner</div>
              <span
                className={`text-sm font-bold ${
                  partyBg[detail.winner2024]?.split(" ")[1] ?? "text-zinc-300"
                }`}
              >
                {detail.winner2024}
              </span>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Predicted</div>
              <span
                className={`text-sm font-bold ${
                  partyBg[detail.predictedWinner]?.split(" ")[1] ?? "text-zinc-300"
                }`}
              >
                {detail.predictedWinner}
              </span>
            </div>
          </div>

          {/* vote bars */}
          <div className="space-y-1.5">
            <SectionLabel>Vote Share Estimates</SectionLabel>
            <VoteBar label="CON" pct={detail.conVote} color={partyColor.CON} />
            <VoteBar label="REF" pct={detail.refVote} color={partyColor.Reform} />
            <VoteBar label="LAB" pct={detail.labVote} color={partyColor.LAB} />
            <VoteBar label="LD" pct={detail.ldVote} color={partyColor.LD} />
            <VoteBar label="GRN" pct={detail.grnVote} color={partyColor.Green} />
          </div>

          {/* demographics (if available) */}
          {detailDemo ? (
            <div className="space-y-3">
              <SectionLabel>
                Census Demographics
                <span className="ml-1 text-zinc-600">(+/- vs constituency avg)</span>
              </SectionLabel>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <DemoSection label="Age" catKey="age" data={detailDemo.age} avg={demographics.age} />
                <DemoSection
                  label="Ethnicity"
                  catKey="ethnicity"
                  data={detailDemo.ethnicity}
                  avg={demographics.ethnicity}
                />
                <DemoSection
                  label="Housing"
                  catKey="housing"
                  data={detailDemo.housing}
                  avg={demographics.housing}
                />
                <DemoSection
                  label="Education"
                  catKey="education"
                  data={detailDemo.education}
                  avg={demographics.education}
                />
              </div>
            </div>
          ) : (
            <div className="text-[0.556rem] text-zinc-600 italic">
              Ward-level census demographics not available for this ward.
            </div>
          )}
        </div>
      )}

      {!selected && (
        <div className="text-[0.556rem] text-zinc-600 text-center">
          Click a row to view detailed ward data
        </div>
      )}
    </div>
  );
}

function PartyChip({ party }: { party: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[0.5rem] font-medium ${
        partyBg[party] ?? "text-zinc-400"
      }`}
    >
      {party}
    </span>
  );
}
