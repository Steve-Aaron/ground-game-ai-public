"use client";

import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "./ui/PanelSkeleton";
import SectionLabel from "./ui/SectionLabel";
import StatGrid from "./ui/StatGrid";
import Bar from "./ui/Bar";

interface PetitionItem {
  title: string;
  totalSignatures: number;
  localSignatures: number;
  salience: number;
  overIndexed: boolean;
  url: string;
}

interface PetitionsData {
  petitions: PetitionItem[];
  source: string;
  error?: string;
}

function heatIcon(salience: number, median: number): string {
  if (salience > median * 3) return "\uD83D\uDD25";
  if (salience > median * 2) return "\u26A1";
  return "";
}

export default function PetitionsPanel() {
  const { data, loading } = useConstituencyResource<PetitionsData>("/api/petitions");

  if (loading) return <PanelSkeleton variant="cards" rows={5} />;

  if (!data || data.error || !data.petitions?.length) {
    return <p className="text-zinc-500 text-xs">No petition data available</p>;
  }

  const petitions = data.petitions;
  const totalLocalSigs = petitions.reduce((s, p) => s + (p.localSignatures ?? 0), 0);

  // Median salience for heat thresholds
  const sorted = [...petitions].sort((a, b) => a.salience - b.salience);
  const medianSalience =
    sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)].salience
      : 1;

  // Most over-indexed topic (highest salience)
  const topPetition = petitions[0];

  // Top 8 for bar chart
  const chartPetitions = petitions.slice(0, 8);
  const maxSalience = chartPetitions.length > 0 ? chartPetitions[0].salience : 1;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <StatGrid
        cols={2}
        items={[
          {
            label: "Local Signatures",
            value: totalLocalSigs.toLocaleString(),
            subtitle: `Across ${petitions.length} petitions`,
          },
          {
            label: "Most Over-indexed",
            value: (
              <span className="text-sm line-clamp-2 leading-tight">
                {topPetition.title.length > 60
                  ? topPetition.title.slice(0, 57) + "..."
                  : topPetition.title}
              </span>
            ),
            color: "#c084fc",
            valueClassName: "text-sm font-bold mt-0.5",
            subtitle: `${topPetition.salience.toFixed(1)}x local salience`,
          },
        ]}
      />

      {/* Horizontal bar chart — top 8 by salience */}
      <div>
        <SectionLabel className="mb-2">Top Petitions by Local Salience</SectionLabel>
        <div className="space-y-1">
          {chartPetitions.map((p, i) => {
            const heat = heatIcon(p.salience, medianSalience);
            return (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <Bar
                  variant="progress"
                  value={p.salience}
                  max={maxSalience}
                  color="bg-purple-600/70"
                  height="h-5"
                  label={`${heat ? heat + " " : ""}${p.title}`}
                  valueText={
                    <span className="font-mono font-bold text-purple-400">
                      {p.salience.toFixed(1)}x
                    </span>
                  }
                />
              </a>
            );
          })}
        </div>
      </div>

      {/* Full scrollable list */}
      <div>
        <SectionLabel className="mb-2">All Petitions</SectionLabel>
        <div className="space-y-1.5 max-h-[16.667rem] overflow-y-auto pr-1">
          {petitions.map((p, i) => {
            const heat = heatIcon(p.salience, medianSalience);
            return (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-zinc-900 rounded-xl px-3 py-2 hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-200 line-clamp-2">
                      {heat && <span className="mr-1">{heat}</span>}
                      {p.title}
                    </div>
                    <div className="text-[0.556rem] text-zinc-500 flex items-center gap-2 mt-1">
                      <span>{(p.localSignatures ?? 0).toLocaleString()} local sigs</span>
                      <span className="text-zinc-700">&middot;</span>
                      <span>{(p.totalSignatures ?? 0).toLocaleString()} total</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={`text-sm font-bold ${
                        p.salience >= 2
                          ? "text-purple-400"
                          : p.salience >= 1
                          ? "text-emerald-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {p.salience.toFixed(1)}x
                    </div>
                    {p.overIndexed && (
                      <div className="text-[0.5rem] text-purple-400/80 mt-0.5">
                        over-indexed
                      </div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Link to parliament */}
      <div className="text-center">
        <a
          href="https://petition.parliament.uk/petitions?state=open"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.556rem] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          View all open petitions on parliament.uk &#8599;
        </a>
      </div>
    </div>
  );
}
