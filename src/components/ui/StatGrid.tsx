import { cn } from "@/lib/utils";
import SectionLabel from "./SectionLabel";

export interface StatTileData {
  /** Uppercase label above the value. */
  label: string;
  /** Big-number value — pre-formatted (use formatCompactNumber etc upstream). */
  value: React.ReactNode;
  /** Optional smaller line below the value. */
  subtitle?: React.ReactNode;
  /** Optional CSS colour for the value (defaults to zinc-100). */
  color?: string;
  /** Optional class override for the value (e.g. text-lg vs text-xl). */
  valueClassName?: string;
  /** Optional badge / icon shown beside or below the value. */
  badge?: React.ReactNode;
}

interface StatTileProps extends StatTileData {
  className?: string;
}

/**
 * Single statistic card — label + big value + optional subtitle / badge.
 *
 * Exported as a named export for ad-hoc placement. Most callers should use
 * `<StatGrid items={...} />` instead.
 */
export function StatTile({
  label,
  value,
  subtitle,
  color,
  valueClassName,
  badge,
  className,
}: StatTileProps) {
  return (
    <div
      data-component="statTile"
      className={cn("bg-zinc-900 rounded-xl p-3", className)}
    >
      <SectionLabel>{label}</SectionLabel>
      <div
        className={cn(
          "font-bold mt-0.5",
          valueClassName ?? "text-xl text-zinc-100"
        )}
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {subtitle ? (
        <div className="text-[0.556rem] text-zinc-500 mt-0.5">{subtitle}</div>
      ) : null}
      {badge ? <div className="mt-1">{badge}</div> : null}
    </div>
  );
}

interface StatGridProps {
  /** Tiles to render. */
  items: StatTileData[];
  /** Column count (defaults to items.length capped at 4). */
  cols?: 2 | 3 | 4;
  className?: string;
}

const COLS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

/**
 * Grid of stat tiles. Default is the canonical 'dashboard summary' row.
 */
export default function StatGrid({ items, cols, className }: StatGridProps) {
  const resolvedCols: 2 | 3 | 4 =
    cols ?? (items.length >= 4 ? 4 : items.length === 3 ? 3 : 2);
  return (
    <div
      data-component="statGrid"
      className={cn("grid gap-3", COLS[resolvedCols], className)}
    >
      {items.map((item, i) => (
        <StatTile key={i} {...item} />
      ))}
    </div>
  );
}
