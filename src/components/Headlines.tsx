"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import FeedItem from "./ui/FeedItem";
import PanelEmpty from "./ui/PanelEmpty";
import PanelSkeleton from "./ui/PanelSkeleton";

interface HeadlineItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

interface HeadlinesResponse {
  headlines?: HeadlineItem[];
  briefings?: HeadlineItem[];
}

type Tab = "headlines" | "briefings";

export default function Headlines() {
  const [tab, setTab] = useState<Tab>("headlines");

  const fallback: HeadlinesResponse = { headlines: getMockHeadlines(), briefings: [] };
  const { data, loading } = useConstituencyResource<HeadlinesResponse>(
    "/api/headlines",
    { fallback }
  );

  if (loading) return <PanelSkeleton variant="list" rows={6} />;

  const headlines = data?.headlines ?? [];
  const briefings = data?.briefings ?? [];

  return (
    <div data-component="headlinesContainer">
      <TabBar tab={tab} onChange={setTab} />

      {tab === "headlines" ? (
        <div className="divide-y divide-zinc-800/50">
          {headlines.map((item, i) => (
            <FeedItem
              key={i}
              href={item.link}
              title={item.title}
              source={{ label: item.source }}
              date={item.pubDate}
            />
          ))}
          {headlines.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">
              No headlines available
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/50">
          {briefings.length > 0 ? (
            briefings.map((item, i) => (
              <FeedItem
                key={i}
                href={item.link}
                title={item.title}
                source={{ label: item.source }}
                date={item.pubDate}
                leading={<Bookmark className="h-3 w-3 text-orange-400 mt-1" />}
              />
            ))
          ) : (
            <PanelEmpty
              icon={Bookmark}
              title="Daily briefings from Politico, BBC, and other outlets appear here"
              description="Eg. Politico London Playbook, Westminster morning briefings"
            />
          )}
        </div>
      )}

      <div className="px-3 py-2 text-[10px] text-zinc-700 text-center border-t border-border/50">
        BBC, Sky, Guardian, Telegraph, GB News, Politico &middot; Updates every 10 min
      </div>
    </div>
  );
}

interface TabBarProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

function TabBar({ tab, onChange }: TabBarProps) {
  return (
    <div data-component="headlinesTabs" className="flex border-b border-zinc-800">
      <button
        onClick={() => onChange("headlines")}
        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
          tab === "headlines"
            ? "text-emerald-400 border-b-2 border-emerald-400"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Top Headlines
      </button>
      <button
        onClick={() => onChange("briefings")}
        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
          tab === "briefings"
            ? "text-emerald-400 border-b-2 border-emerald-400"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        <Bookmark className="inline h-3 w-3 mr-1" />
        Daily Briefings
      </button>
    </div>
  );
}

function getMockHeadlines(): HeadlineItem[] {
  return [
    { title: "PM faces backbench revolt over planning reform bill", link: "#", pubDate: new Date(Date.now() - 30 * 60000).toISOString(), source: "BBC" },
    { title: "Chancellor under pressure to revise fiscal rules", link: "#", pubDate: new Date(Date.now() - 2 * 3600000).toISOString(), source: "Guardian" },
    { title: "Home Secretary announces new small boats crackdown", link: "#", pubDate: new Date(Date.now() - 3 * 3600000).toISOString(), source: "Sky News" },
    { title: "Reform UK surges in latest polling as by-election looms", link: "#", pubDate: new Date(Date.now() - 4 * 3600000).toISOString(), source: "GB News" },
    { title: "NHS waiting list target missed by two years, report warns", link: "#", pubDate: new Date(Date.now() - 5 * 3600000).toISOString(), source: "Telegraph" },
  ];
}
