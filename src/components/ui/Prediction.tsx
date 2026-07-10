"use client";

import { partyColor } from "@/lib/palette";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Shared presentational primitives for the Electoral Calculus prediction
// panels (ECPrediction on the map tab, ElectoralIntel on the political tab).
// Purely presentational — data fetching lives in useElectoralCalculus.
// ─────────────────────────────────────────────────────────────────────────────

/** The bg-muted/30 headline card with the cyan bold prediction text.
 * Children (e.g. WinningChances) render inside the card, after the text. */
export function PredictionHeadline({
  prediction,
  align = "left",
  size = "md",
  children,
}: {
  prediction: string;
  align?: "left" | "center";
  size?: "sm" | "md";
  children?: React.ReactNode;
}) {
  return (
    <div
      data-component="predictionHeadline"
      className={cn("bg-muted/30 rounded-lg p-3", align === "center" && "text-center")}
    >
      <div className={cn(size === "md" ? "text-xs" : "text-[11px]", "text-zinc-500 mb-1")}>
        Constituency Prediction
      </div>
      <div className={cn(size === "md" ? "text-lg" : "text-base", "font-bold text-cyan-400")}>
        {prediction}
      </div>
      {children}
    </div>
  );
}

/** Row of winning-chance percentages coloured by party. Chances of 0 are
 * hidden; the rest are sorted descending. */
export function WinningChances({
  chances,
  className,
  labelClassName = "text-[10px]",
}: {
  chances: Record<string, number>;
  className?: string;
  /** Party label size — differs between the compact card and the panel. */
  labelClassName?: string;
}) {
  return (
    <div data-component="winningChances" className={cn("flex", className)}>
      {Object.entries(chances)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([party, chance]) => (
          <div key={party} className="text-center">
            <div className="text-xl font-bold" style={{ color: partyColor(party) }}>
              {chance}%
            </div>
            <div className={cn(labelClassName, "text-zinc-500")}>{party}</div>
          </div>
        ))}
    </div>
  );
}

/** Predicted vote-share bars: OTH filtered out, sorted descending, bar width
 * is share*2% (50% share fills the track), party colour at 0.8 opacity. */
export function VoteShareBars({
  shares,
  barHeight = "h-4",
}: {
  shares: Record<string, number>;
  barHeight?: "h-3" | "h-4";
}) {
  const compact = barHeight === "h-3";
  return (
    <div data-component="voteShareBars" className="space-y-1.5">
      {Object.entries(shares)
        .filter(([k]) => k !== "OTH")
        .sort((a, b) => b[1] - a[1])
        .map(([party, share]) => (
          <div key={party} className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-14">{party}</span>
            <div className={cn("flex-1 bg-muted rounded-full overflow-hidden", barHeight)}>
              <div
                className={cn("h-full rounded-full", !compact && "transition-all")}
                style={{
                  width: `${share * 2}%`,
                  backgroundColor: partyColor(party),
                  opacity: 0.8,
                }}
              />
            </div>
            <span
              className={cn(
                compact ? "text-[0.611rem] w-10" : "text-xs w-12",
                "text-zinc-300 font-medium text-right"
              )}
            >
              {share}%
            </span>
          </div>
        ))}
    </div>
  );
}
