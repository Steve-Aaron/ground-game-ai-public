"use client";

import { useState } from "react";
import { Stethoscope, Pill, Smile, ExternalLink } from "lucide-react";
import Panel from "@/components/Panel";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "@/components/ui/PanelSkeleton";

// NHS facility list for the active constituency. Sourced from /api/nhs-practices,
// which de-duplicates GP practices, pharmacies and dental practices across all
// LADs that overlap the constituency.

interface Practice {
  odsCode: string;
  name: string;
  type: "gp" | "pharmacy" | "dental";
  postcode: string;
  status: string;
}

interface NHSPracticesData {
  counts: { gp: number; pharmacy: number; dental: number };
  practices: Practice[];
  source: string;
  sourceUrl: string;
}

const TYPE_META: Record<Practice["type"], { label: string; icon: React.ReactNode; ring: string }> = {
  gp: { label: "GP practices", icon: <Stethoscope className="w-3.5 h-3.5" />, ring: "border-emerald-500/40" },
  pharmacy: { label: "Pharmacies", icon: <Pill className="w-3.5 h-3.5" />, ring: "border-blue-500/40" },
  dental: { label: "Dental practices", icon: <Smile className="w-3.5 h-3.5" />, ring: "border-amber-500/40" },
};

export default function NHSPracticesPanel() {
  const { data, loading, error } = useConstituencyResource<NHSPracticesData>(
    "/api/nhs-practices"
  );
  const [activeType, setActiveType] = useState<Practice["type"]>("gp");

  const visible = data?.practices.filter((p) => p.type === activeType) ?? [];

  return (
    <Panel title="NHS facilities" dataComponent="nhsPractices" icon={<Stethoscope className="w-3.5 h-3.5" />}>
      <div data-component="NHSPracticesPanel" className="p-3 space-y-3">
        {loading && <PanelSkeleton variant="list" rows={4} className="p-0" />}
        {error && <div className="text-[0.65rem] text-red-400">Could not load: {error}</div>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_META) as Practice["type"][]).map((t) => {
                const meta = TYPE_META[t];
                const active = t === activeType;
                return (
                  <button
                    key={t}
                    type="button"
                    data-component="NHSPracticesPanel.TypeChip"
                    onClick={() => setActiveType(t)}
                    className={`text-left border ${meta.ring} ${active ? "bg-zinc-800/60" : "bg-transparent"} px-2 py-1.5 hover:bg-zinc-800/40 transition`}
                  >
                    <div className="flex items-center gap-1.5 text-zinc-300">
                      {meta.icon}
                      <span className="text-[0.6rem] uppercase tracking-wider">{meta.label}</span>
                    </div>
                    <div className="text-base font-semibold text-zinc-100 mt-0.5">
                      {data.counts[t]}
                    </div>
                  </button>
                );
              })}
            </div>

            <ul data-component="NHSPracticesPanel.List" className="divide-y divide-[#2a2a2a] border border-[#2a2a2a]">
              {visible.length === 0 && (
                <li className="px-2 py-1.5 text-[0.65rem] text-zinc-500">None recorded</li>
              )}
              {visible.map((p) => (
                <li key={p.odsCode} className="px-2 py-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[0.72rem] text-zinc-200 truncate">{p.name}</div>
                    <div className="text-[0.6rem] text-zinc-500">
                      {p.postcode} {"·"} {p.odsCode}
                    </div>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.postcode}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-500 hover:text-zinc-200"
                    aria-label="Open in Google Maps"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>

            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[0.6rem] text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
            >
              Source: {data.source} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </>
        )}
      </div>
    </Panel>
  );
}

