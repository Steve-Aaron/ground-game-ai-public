"use client";

import { useEffect, useState } from "react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";

interface Application {
  id: string;
  title: string;
  address: string;
  type: string;
  status: string;
  date: string;
  url: string;
  local_authority: string;
}

interface PlanningData {
  applications: Application[];
  total: number;
  error?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:    { label: "Pending",   color: "text-amber-400",  dot: "bg-amber-400" },
  approved:   { label: "Approved",  color: "text-emerald-400",dot: "bg-emerald-400" },
  refused:    { label: "Refused",   color: "text-red-400",    dot: "bg-red-400" },
  withdrawn:  { label: "Withdrawn", color: "text-zinc-400",   dot: "bg-zinc-400" },
  appeal:     { label: "Appeal",    color: "text-purple-400", dot: "bg-purple-400" },
};

const TYPE_LABELS: Record<string, string> = {
  residential:    "Residential",
  commercial:     "Commercial",
  infrastructure: "Infrastructure",
  "change of use":"Change of Use",
  "trees/landscaping": "Trees / Landscaping",
  agricultural:   "Agricultural",
  signage:        "Signage",
  demolition:     "Demolition",
  other:          "Other",
};

function statusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: "text-zinc-400", dot: "bg-zinc-400" };
}

function formatDate(date: string): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function PlanningPanel() {
  const { slug } = useConstituency();
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(withConstituency("/api/planning", slug))
      .then((r) => r.json())
      .then((d: PlanningData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-xs text-zinc-500">Loading planning applications...</div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="p-4">
        <p className="text-xs text-zinc-500">No planning applications found in the last 60 days.</p>
      </div>
    );
  }

  // Status counts
  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  for (const app of data.applications) {
    statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
    typeCounts[app.type] = (typeCounts[app.type] || 0) + 1;
  }

  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const recent = [...data.applications]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  return (
    <div className="p-4 space-y-4">
      {/* Headline */}
      <div>
        <div className="text-2xl font-bold text-zinc-100">{data.total}</div>
        <div className="text-[11px] text-zinc-500">applications in last 60 days</div>
      </div>

      {/* Status breakdown */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([status, count]) => {
            const cfg = statusConfig(status);
            return (
              <div key={status} className="flex items-center gap-1.5 bg-muted/40 rounded-full px-2.5 py-1">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`text-[11px] font-medium ${cfg.color}`}>{count}</span>
                <span className="text-[11px] text-zinc-500">{cfg.label}</span>
              </div>
            );
          })}
      </div>

      {/* Type breakdown */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">By type</div>
        <div className="space-y-1.5">
          {topTypes.map(([type, count]) => (
            <div key={type} className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">{TYPE_LABELS[type] ?? type}</span>
              <span className="text-[11px] font-medium text-zinc-300">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent applications */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Recent</div>
        <div className="space-y-2">
          {recent.map((app) => {
            const cfg = statusConfig(app.status);
            return (
              <div key={app.id} className="bg-muted/30 rounded-lg p-2.5">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="text-[11px] text-zinc-300 leading-snug line-clamp-2 flex-1">
                    {app.url ? (
                      <a href={app.url} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">
                        {app.title}
                      </a>
                    ) : app.title}
                  </p>
                  <span className={`text-[10px] font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <span className="truncate">{app.address}</span>
                  {app.date && <span className="shrink-0">{formatDate(app.date)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 text-center pt-1">
        <a href="https://www.planit.org.uk/" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">
          PlanIt
        </a>
        {" · last 60 days"}
      </div>
    </div>
  );
}
