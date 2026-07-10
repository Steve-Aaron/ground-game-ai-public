import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Bar — unified horizontal bar primitive with discriminated-union variants.
//
//   <Bar variant="progress"   value={75} max={100} color="#10b981" />
//   <Bar variant="comparison" localValue={6.4} nationalValue={4.1} unit="%" />
//   <Bar variant="stacked"    segments={[{ label, percentage, color }]} />
//
// Type narrowing on `variant` ensures each variant gets the right props.
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressBarProps {
  variant: "progress";
  /** Current value (in the same unit as max). */
  value: number;
  /** Maximum value of the scale. */
  max: number;
  /** Fill colour — CSS value or Tailwind bg-* class. Defaults to emerald. */
  color?: string;
  /** Optional label shown left of the bar. */
  label?: string;
  /** Optional value text shown right of the bar (defaults to "{value}{unit}"). */
  valueText?: React.ReactNode;
  /** Unit string used for the default valueText (e.g. '%'). */
  unit?: string;
  /** Bar height — defaults to 'h-2'. */
  height?: "h-1.5" | "h-2" | "h-3" | "h-4" | "h-5";
}

interface ComparisonBarProps {
  variant: "comparison";
  /** Local value. */
  localValue: number;
  /** National / reference value. */
  nationalValue: number;
  /** Unit for the labels (defaults to ''). */
  unit?: string;
  /** When true, lower local values are 'better' (green). */
  higherIsWorse?: boolean;
  /** Optional title shown above the pair. */
  label?: string;
}

interface StackedSegment {
  label: string;
  percentage: number;
  color: string;
}

interface StackedBarProps {
  variant: "stacked";
  segments: StackedSegment[];
  /** Bar height. Defaults to 'h-3'. */
  height?: "h-2" | "h-3" | "h-4" | "h-5";
  /** Show a colour-coded legend below the bar. */
  showLegend?: boolean;
}

export type BarProps =
  | (ProgressBarProps & { className?: string })
  | (ComparisonBarProps & { className?: string })
  | (StackedBarProps & { className?: string });

export default function Bar(props: BarProps) {
  if (props.variant === "progress") return <ProgressBar {...props} />;
  if (props.variant === "comparison") return <ComparisonBar {...props} />;
  return <StackedBar {...props} />;
}

// ── progress ────────────────────────────────────────────────────────────────

function ProgressBar({
  value,
  max,
  color,
  label,
  valueText,
  unit = "",
  height = "h-2",
  className,
}: ProgressBarProps & { className?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isTailwindClass = color?.startsWith("bg-") ?? false;
  return (
    <div
      data-component="barProgress"
      className={cn("flex items-center gap-2", className)}
    >
      {label ? (
        <span className="text-[0.611rem] text-zinc-400 w-14 shrink-0">{label}</span>
      ) : null}
      <div className={cn("flex-1 bg-muted rounded-full overflow-hidden", height)}>
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isTailwindClass ? color : ""
          )}
          style={{
            width: `${Math.max(pct, 2)}%`,
            backgroundColor: isTailwindClass ? undefined : color ?? "#10b981",
          }}
        />
      </div>
      {valueText !== undefined ? (
        <span className="text-xs text-zinc-300 font-medium w-12 text-right">
          {valueText}
        </span>
      ) : (
        <span className="text-xs text-zinc-300 font-medium w-12 text-right">
          {value}
          {unit}
        </span>
      )}
    </div>
  );
}

// ── comparison ──────────────────────────────────────────────────────────────

function ComparisonBar({
  localValue,
  nationalValue,
  unit = "",
  higherIsWorse = false,
  label,
  className,
}: ComparisonBarProps & { className?: string }) {
  const max = Math.max(localValue, nationalValue) * 1.2 || 1;
  const localPct = (localValue / max) * 100;
  const nationalPct = (nationalValue / max) * 100;

  const isBetter = higherIsWorse ? localValue < nationalValue : localValue > nationalValue;
  const barColor = isBetter ? "bg-emerald-500" : "bg-red-500";

  return (
    <div
      data-component="barComparison"
      className={cn("space-y-1", className)}
    >
      {label ? (
        <div className="text-[0.611rem] text-zinc-400">{label}</div>
      ) : null}
      <BarRow label="Local" pct={localPct} color={barColor} value={localValue} unit={unit} />
      <BarRow label="National" pct={nationalPct} color="bg-zinc-500" value={nationalValue} unit={unit} />
    </div>
  );
}

function BarRow({
  label,
  pct,
  color,
  value,
  unit,
}: {
  label: string;
  pct: number;
  color: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.556rem] text-zinc-500 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[0.611rem] text-zinc-400 w-12 text-right">
        {value}
        {unit}
      </span>
    </div>
  );
}

// ── stacked ─────────────────────────────────────────────────────────────────

function StackedBar({
  segments,
  height = "h-3",
  showLegend = false,
  className,
}: StackedBarProps & { className?: string }) {
  return (
    <div data-component="barStacked" className={cn("space-y-2", className)}>
      <div className={cn("flex bg-muted rounded-full overflow-hidden", height)}>
        {segments.map((seg, i) => (
          <div
            key={i}
            className="h-full"
            style={{ width: `${seg.percentage}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.percentage.toFixed(1)}%`}
          />
        ))}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1 text-[0.556rem] text-zinc-400">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span>
                {seg.label} ({seg.percentage.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
