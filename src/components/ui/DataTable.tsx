"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Column-config-driven data table primitive.
//
// Usage:
//   <DataTable
//     rows={wards}
//     getRowId={(w) => w.name}
//     columns={[
//       { key: 'name',       label: 'Ward',       sort: 'string' },
//       { key: 'population', label: 'Pop',        sort: 'number', align: 'right',
//         render: (w) => w.population.toLocaleString() },
//       { key: 'change',     label: 'Change',     render: (w) => <PartyPill ... /> },
//     ]}
//   />
//
// Features:
//   - Per-column sortability (string | number | none)
//   - Custom cell renderers via `render`
//   - Alignment (left | right | center)
//   - Click-to-row callback
//   - Alternating row backgrounds (optional)
//   - Sticky header (optional)
// ─────────────────────────────────────────────────────────────────────────────

export interface DataTableColumn<Row> {
  /** Unique identifier — also used as the default header label fallback. */
  key: string;
  /** Header cell content. */
  label: React.ReactNode;
  /** Sort behaviour — omit to disable sorting on this column. */
  sort?: "string" | "number";
  /** Cell alignment (defaults to 'left'). */
  align?: "left" | "right" | "center";
  /** Cell renderer. Defaults to (row) => String((row as any)[key]). */
  render?: (row: Row) => React.ReactNode;
  /** Sort accessor — defaults to (row) => (row as any)[key]. */
  accessor?: (row: Row) => string | number | null | undefined;
  /** Optional column width (CSS or Tailwind class — applied via className). */
  className?: string;
  /** Optional header className override. */
  headerClassName?: string;
}

interface DataTableProps<Row> {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  /** Stable id for each row — used as React key + row identity. */
  getRowId: (row: Row) => string | number;
  /** Optional row click handler. */
  onRowClick?: (row: Row) => void;
  /** Per-row className — useful for selection highlighting. */
  rowClassName?: (row: Row, index: number) => string | undefined;
  /** Render alternating row backgrounds. */
  striped?: boolean;
  /** Sticky header (panel must have its own scroll container). */
  stickyHeader?: boolean;
  /** Optional initial sort. */
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Optional empty-state node. */
  emptyState?: React.ReactNode;
  /** Table-level density. 'tight' uses px-2 py-1.5; 'default' uses py-1. */
  density?: "default" | "tight";
  /** Optional header className override. */
  headerRowClassName?: string;
  className?: string;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

const ALIGN: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export default function DataTable<Row>({
  rows,
  columns,
  getRowId,
  onRowClick,
  rowClassName,
  striped = false,
  stickyHeader = false,
  initialSort = undefined,
  emptyState,
  density = "default",
  headerRowClassName,
  className,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || !col.sort) return rows;
    const accessor =
      col.accessor ?? ((row: Row) => (row as Record<string, unknown>)[sort.key] as string | number);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (col.sort === "number") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, columns, sort]);

  function toggleSort(col: DataTableColumn<Row>) {
    if (!col.sort) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "asc" };
      if (prev.dir === "asc") return { key: col.key, dir: "desc" };
      return null;
    });
  }

  if (rows.length === 0 && emptyState) {
    return <div data-component="dataTableEmpty">{emptyState}</div>;
  }

  return (
    <div
      data-component="dataTable"
      className={cn("overflow-x-auto", className)}
    >
      <table className="w-full text-[0.667rem]">
        <thead>
          <tr
            className={cn(
              "text-zinc-500 border-b border-border",
              stickyHeader && "sticky top-0 bg-card",
              headerRowClassName
            )}
          >
            {columns.map((col) => {
              const isActive = sort?.key === col.key;
              const sortable = !!col.sort;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    density === "tight" ? "px-2 py-1.5" : "py-1",
                    "font-medium select-none",
                    ALIGN[col.align ?? "left"],
                    sortable && "cursor-pointer hover:text-zinc-300",
                    col.headerClassName,
                    col.className
                  )}
                  onClick={() => toggleSort(col)}
                  aria-sort={
                    isActive ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortable && isActive ? (
                      sort?.dir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    ) : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border/30 transition-colors",
                striped && i % 2 === 1 && "bg-muted/20",
                onRowClick && "cursor-pointer hover:bg-muted/40",
                rowClassName?.(row, i)
              )}
            >
              {columns.map((col) => {
                const value = col.render
                  ? col.render(row)
                  : ((row as Record<string, unknown>)[col.key] as React.ReactNode);
                return (
                  <td
                    key={col.key}
                    className={cn(
                      density === "tight" ? "px-2 py-1.5" : "py-1",
                      "text-zinc-300",
                      ALIGN[col.align ?? "left"],
                      col.className
                    )}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
