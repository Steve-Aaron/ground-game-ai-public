"use client";

import { useConstituency } from "@/hooks/useConstituency";
import { useElectoralCalculus } from "@/hooks/useElectoralCalculus";
import { partyColor } from "@/lib/palette";
import DataTable, { type DataTableColumn } from "./ui/DataTable";
import PanelSkeleton from "@/components/ui/PanelSkeleton";
import PanelError from "@/components/ui/PanelError";
import { PredictionHeadline, VoteShareBars, WinningChances } from "@/components/ui/Prediction";
import { getFullData } from "@/data";


/** Banner for a pending by-election. EC seat pages only carry the GE-cycle
 * MRP, so by-election status comes from our own constituency data. */
function ByElectionBanner({ note, date }: { note: string; date?: string }) {
  return (
    <div
      data-component="byElectionBanner"
      className="border border-amber-500/40 bg-amber-500/10 px-3 py-2"
    >
      <p className="text-[0.611rem] uppercase tracking-wider text-amber-400 font-semibold mb-0.5">
        By-election {date ? `— ${date}` : "pending"}
      </p>
      <p className="text-[0.611rem] text-zinc-400">{note}</p>
    </div>
  );
}

export default function ECPrediction() {
  const { slug } = useConstituency();
  const { prediction: pred, wardData: wardElectoralCalc, loading, error } = useElectoralCalculus(slug);

  const byElection = getFullData(slug)?.constituency.byElection;

  if (loading) {
    return <PanelSkeleton variant="list" rows={3} />;
  }

  if (!pred) {
    return (
      <div className="p-4 space-y-3">
        {byElection ? <ByElectionBanner note={byElection.note} date={byElection.date} /> : null}
        {error ? (
          <PanelError message={error} />
        ) : (
          <p className="text-xs text-zinc-500">
            Electoral Calculus prediction not available for this constituency.
          </p>
        )}
      </div>
    );
  }

  const wards = Object.entries(wardElectoralCalc);

  // Count ward predictions
  const wardCounts: Record<string, number> = {};
  for (const [, data] of wards) {
    wardCounts[data.predictedWinner] = (wardCounts[data.predictedWinner] || 0) + 1;
  }

  // Count swings (wards that changed)
  const swings = wards.filter(([, d]) => d.winner2024 !== d.predictedWinner);

  return (
    <div data-component="ecPrediction" className="space-y-4">
      {byElection ? <ByElectionBanner note={byElection.note} date={byElection.date} /> : null}
      {/* Headline prediction */}
      <PredictionHeadline prediction={pred.prediction}>
        <WinningChances chances={pred.winningChances} className="gap-3 mt-2" />
      </PredictionHeadline>

      {/* Predicted vote shares */}
      <div>
        <div className="text-xs text-zinc-500 mb-2 font-medium">Predicted Vote Share</div>
        <VoteShareBars shares={pred.predicted} />
      </div>

      {/* Ward swing summary */}
      <div>
        <div className="text-xs text-zinc-500 mb-2 font-medium">
          Ward Predictions ({wards.length} wards)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(wardCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([party, count]) => (
              <div key={party} className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold" style={{ color: partyColor(party) }}>
                  {count}
                </div>
                <div className="text-[10px] text-zinc-500">{party} wards</div>
              </div>
            ))}
        </div>
        <div className="mt-2 text-[11px] text-zinc-600">
          {swings.length} ward{swings.length !== 1 ? "s" : ""} predicted to change hands
        </div>
      </div>

      {/* Ward detail table */}
      <WardPredictionTable wards={wards} />

      <div className="text-[10px] text-zinc-700 text-center">
        Source: Electoral Calculus MRP &middot; Updated {pred.lastUpdated}
      </div>
    </div>
  );
}

// ── Ward prediction table ────────────────────────────────────────────────
// Extracted to keep the main component focused on data-fetching + summary
// blocks. Uses the shared DataTable primitive so sorting + a11y are free.

interface WardRow {
  name: string;
  winner2024: string;
  predictedWinner: string;
  electorate: number;
}

function WardPredictionTable({
  wards,
}: {
  wards: Array<[string, { electorate: number; winner2024: string; predictedWinner: string }]>;
}) {
  const rows: WardRow[] = wards.map(([name, data]) => ({ name, ...data }));

  const columns: DataTableColumn<WardRow>[] = [
    { key: "name", label: "Ward", sort: "string" },
    {
      key: "winner2024",
      label: "2024",
      align: "center",
      sort: "string",
      render: (row) => <PartyPill party={row.winner2024} />,
    },
    {
      key: "predictedWinner",
      label: "Pred",
      align: "center",
      sort: "string",
      render: (row) => <PartyPill party={row.predictedWinner} />,
    },
    {
      key: "electorate",
      label: "Elect.",
      align: "right",
      sort: "number",
      className: "text-zinc-500",
      render: (row) => row.electorate.toLocaleString(),
    },
  ];

  return <DataTable rows={rows} columns={columns} getRowId={(r) => r.name} />;
}

function PartyPill({ party }: { party: string }) {
  return (
    <span
      data-component="partyPill"
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ color: partyColor(party) }}
    >
      {party}
    </span>
  );
}
