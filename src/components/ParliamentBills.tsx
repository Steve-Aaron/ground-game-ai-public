"use client";

import { useState } from "react";
import { Search, ExternalLink, ThumbsUp, ThumbsDown } from "lucide-react";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import { PanelFooter } from "./ui/PanelFooter";
import PanelSkeleton from "./ui/PanelSkeleton";
import { formatGbDate } from "@/lib/format";

type Tab = "votes" | "bills";

interface Vote {
  title: string;
  date: string;
  votedAye: boolean;
  votedNo: boolean;
  ayes: number;
  noes: number;
  divisionNumber: number;
  url: string;
}

interface Bill {
  id: number;
  title: string;
  house: string;
  stage: string;
  stageWithHouse: string;
  lastUpdate: string;
  isAct: boolean;
  isDefeated: boolean;
  withdrawn: boolean;
  url: string;
}

// Stage pipeline for board view
const STAGES = [
  { key: "1st reading", label: "1st Reading", color: "border-yellow-500/50 bg-yellow-500/5" },
  { key: "2nd reading", label: "2nd Reading", color: "border-orange-500/50 bg-orange-500/5" },
  { key: "Committee", label: "Committee", color: "border-blue-500/50 bg-blue-500/5" },
  { key: "Report", label: "Report", color: "border-purple-500/50 bg-purple-500/5" },
  { key: "3rd reading", label: "3rd Reading", color: "border-emerald-500/50 bg-emerald-500/5" },
  { key: "Royal Assent", label: "Royal Assent", color: "border-green-500/50 bg-green-500/5" },
  { key: "other", label: "Other", color: "border-zinc-600/50 bg-muted/50" },
];

function classifyStage(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("1st")) return "1st reading";
  if (s.includes("2nd")) return "2nd reading";
  if (s.includes("committee")) return "Committee";
  if (s.includes("report")) return "Report";
  if (s.includes("3rd")) return "3rd reading";
  if (s.includes("royal")) return "Royal Assent";
  return "other";
}

interface VotesResponse {
  votes?: Vote[];
}

// Module-level so the reference is stable across renders (the hook keys its
// fetch callback on `fallback`). Matches the old catch handler: votes reset
// to [] on error.
const EMPTY_VOTES: VotesResponse = { votes: [] };

export default function ParliamentBills() {
  const [tab, setTab] = useState<Tab>("votes");
  const { data, loading } = useConstituencyResource<VotesResponse>(
    "/api/parliament?type=votes",
    { fallback: EMPTY_VOTES }
  );
  const votes = data?.votes ?? [];
  const [bills, setBills] = useState<Bill[]>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  async function fetchBills(query?: string) {
    try {
      setSearching(true);
      const url = query
        ? `/api/parliament?type=bills&q=${encodeURIComponent(query)}`
        : "/api/parliament?type=bills";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setBills(data.bills || []);
    } catch { setBills([]); } finally { setSearching(false); }
  }

  function handleTabChange(newTab: Tab) {
    setTab(newTab);
    if (newTab === "bills" && bills.length === 0) fetchBills();
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchBills(search || undefined);
  }

  if (loading) return <PanelSkeleton variant="list" rows={5} />;

  // Group bills by stage for board view
  const billsByStage: Record<string, Bill[]> = {};
  STAGES.forEach((s) => (billsByStage[s.key] = []));
  bills.forEach((b) => {
    const key = classifyStage(b.stage);
    if (billsByStage[key]) billsByStage[key].push(b);
    else billsByStage["other"].push(b);
  });

  return (
    <div data-component="parliamentBills">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => handleTabChange("votes")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "votes" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          MP Votes
        </button>
        <button
          onClick={() => handleTabChange("bills")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "bills" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Bill Pipeline
        </button>
      </div>

      {/* Votes tab */}
      {tab === "votes" && (
        <div className="divide-y divide-zinc-800/50">
          {votes.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">No voting records found</div>
          ) : (
            votes.slice(0, 12).map((vote, i) => {
              const won = vote.votedAye ? vote.ayes > vote.noes : vote.noes > vote.ayes;
              return (
                <a key={i} href={vote.url} target="_blank" rel="noopener noreferrer"
                  className="block px-3 py-2 hover:bg-muted/20 transition-colors group">
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 p-1 rounded ${vote.votedAye ? "bg-emerald-400/10" : "bg-red-400/10"}`}>
                      {vote.votedAye ? <ThumbsUp className="h-3 w-3 text-emerald-400" /> : <ThumbsDown className="h-3 w-3 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.667rem] text-zinc-300 leading-snug group-hover:text-zinc-100">
                        {vote.title}
                        <ExternalLink className="inline h-2.5 w-2.5 ml-1 text-zinc-600 group-hover:text-zinc-400" />
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[0.556rem]">
                        <span className={vote.votedAye ? "text-emerald-400" : "text-red-400"}>
                          {vote.votedAye ? "Aye" : "No"}
                        </span>
                        <span className="text-zinc-600">{vote.ayes}–{vote.noes}</span>
                        <span className={won ? "text-emerald-500" : "text-red-500"}>{won ? "Won" : "Lost"}</span>
                        <span className="text-zinc-600">{formatGbDate(vote.date)}</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })
          )}
        </div>
      )}

      {/* Bills board view */}
      {tab === "bills" && (
        <div>
          <form onSubmit={handleSearch} className="px-3 py-2 border-b border-border/50">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-600" />
                <input type="text" placeholder="Search bills..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-md pl-7 pr-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <button type="submit" disabled={searching}
                className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded-md hover:bg-emerald-500/30 transition-colors disabled:opacity-50">
                {searching ? "..." : "Go"}
              </button>
            </div>
          </form>

          {/* Stage pipeline board */}
          <div className="px-3 py-2 space-y-2">
            {STAGES.map((stage) => {
              const stageBills = billsByStage[stage.key] || [];
              if (stageBills.length === 0) return null;
              return (
                <div key={stage.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`h-2 w-2 rounded-full ${stage.color.replace("bg-", "bg-").replace("/5", "/60")}`} />
                    <span className="text-[0.611rem] font-medium text-zinc-400">
                      {stage.label}
                    </span>
                    <span className="text-[0.556rem] text-zinc-600">({stageBills.length})</span>
                  </div>
                  <div className="space-y-1 ml-4">
                    {stageBills.slice(0, 4).map((bill) => (
                      <a key={bill.id} href={bill.url} target="_blank" rel="noopener noreferrer"
                        className={`block px-2 py-1.5 rounded border text-[11px] hover:bg-muted/30 transition-colors ${stage.color}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[0.5rem] font-bold px-1 rounded ${
                            bill.house === "Commons" ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"
                          }`}>
                            {bill.house === "Commons" ? "HC" : "HL"}
                          </span>
                          <span className="text-zinc-300 truncate flex-1">{bill.title}</span>
                          <ExternalLink className="h-2.5 w-2.5 text-zinc-600 flex-shrink-0" />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 ml-6">
                          <span className="text-[0.5rem] text-zinc-500">{formatGbDate(bill.lastUpdate)}</span>
                        </div>
                      </a>
                    ))}
                    {stageBills.length > 4 && (
                      <div className="text-[0.556rem] text-zinc-600 ml-2">+{stageBills.length - 4} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PanelFooter align="center" className="py-2">
        <span className="text-[10px] text-zinc-600">
          {tab === "votes" ? "James Cleverly voting record" : "Bill stages pipeline"} · Parliament API
        </span>
      </PanelFooter>
    </div>
  );
}
