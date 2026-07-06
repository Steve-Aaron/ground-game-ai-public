"use client";

import { Menu, X, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { SELECTABLE_CONSTITUENCIES, type ConstituencySlug } from "@/hooks/useConstituency";
import ThemeToggle from "@/components/ThemeToggle";

const COUNTRY_ORDER = ["England", "Scotland", "Wales", "Northern Ireland"];

const ENGLAND_REGION_ORDER = [
  "North East",
  "North West",
  "Yorkshire and the Humber",
  "East Midlands",
  "West Midlands",
  "East of England",
  "London",
  "South East",
  "South West",
];

function getCountry(region: string): string {
  if (region === "Scotland" || region === "Wales" || region === "Northern Ireland") return region;
  return "England";
}

function groupConstituencies(query: string) {
  const q = query.toLowerCase();
  const filtered = SELECTABLE_CONSTITUENCIES.filter((c) =>
    c.name.toLowerCase().includes(q)
  );

  const grouped: Record<string, Record<string, typeof filtered>> = {};
  for (const c of filtered) {
    const country = getCountry(c.region);
    const region = country === "England" ? c.region : country;
    if (!grouped[country]) grouped[country] = {};
    if (!grouped[country][region]) grouped[country][region] = [];
    grouped[country][region].push(c);
  }

  for (const country of Object.keys(grouped)) {
    for (const region of Object.keys(grouped[country])) {
      grouped[country][region].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return grouped;
}

function getActiveCountryAndRegion(slug: ConstituencySlug) {
  const c = SELECTABLE_CONSTITUENCIES.find((x) => x.slug === slug);
  if (!c) return { country: "England", region: "" };
  const country = getCountry(c.region);
  const region = country === "England" ? c.region : country;
  return { country, region };
}

export type TabId = "map" | "political" | "polling" | "demographics" | "local";

const TABS: { id: TabId; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "political", label: "Political" },
  { id: "polling", label: "Polling" },
  { id: "demographics", label: "Demographics" },
  { id: "local", label: "Local Issues" },
];

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  constituencySlug: ConstituencySlug;
  onConstituencyChange: (slug: ConstituencySlug) => void;
}

export default function Header({
  activeTab,
  onTabChange,
  constituencySlug,
  onConstituencyChange,
}: HeaderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { country: activeCountry, region: activeRegion } = getActiveCountryAndRegion(constituencySlug);

  const [openCountries, setOpenCountries] = useState<Set<string>>(
    () => new Set([activeCountry])
  );
  const [openRegions, setOpenRegions] = useState<Set<string>>(
    () => new Set([activeRegion])
  );

  // When active constituency changes, ensure its section is expanded
  useEffect(() => {
    setOpenCountries((prev) => { const s = new Set(prev); s.add(activeCountry); return s; });
    setOpenRegions((prev) => { const s = new Set(prev); s.add(activeRegion); return s; });
  }, [activeCountry, activeRegion]);

  // When searching, expand all sections that have results
  useEffect(() => {
    if (!search) return;
    const grouped = groupConstituencies(search);
    setOpenCountries(new Set(Object.keys(grouped)));
    const regions = new Set<string>();
    for (const country of Object.keys(grouped)) {
      for (const region of Object.keys(grouped[country])) {
        regions.add(region);
      }
    }
    setOpenRegions(regions);
  }, [search]);

  const grouped = useMemo(() => groupConstituencies(search), [search]);

  const toggleCountry = (country: string) => {
    setOpenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  };

  const toggleRegion = (region: string) => {
    setOpenRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, [sidebarOpen]);

  return (
    <>
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-bold text-foreground tracking-tight uppercase">
                Ground Game <span className="text-emerald-500">Intel</span>
              </span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-border" />
            <span className="hidden sm:block text-[10px] text-zinc-600 uppercase tracking-widest">
              Constituency Monitor
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 px-2 py-1 border border-border">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Live</span>
            </div>
            <ThemeToggle />
            <button
              className="text-zinc-400 hover:text-foreground transition-colors"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Close constituency menu" : "Open constituency menu"}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="flex border-t border-border overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 text-[11px] uppercase tracking-wider font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-emerald-500 border-b-2 border-emerald-500 bg-emerald-500/5"
                  : "text-zinc-600 hover:text-zinc-400 border-b-2 border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 right-0 w-72 bg-card border-l border-border z-[70] flex flex-col transform transition-transform duration-200 ease-out ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!sidebarOpen}
        aria-label="Constituency selector"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">
            Constituencies
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5">
            <Search className="h-3 w-3 text-zinc-500 shrink-0" />
            <input
              type="text"
              placeholder="Search constituencies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none w-full"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-zinc-600 hover:text-zinc-400">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Grouped nav */}
        <nav className="flex-1 overflow-y-auto py-1">
          {COUNTRY_ORDER.map((country) => {
            const regions = grouped[country];
            if (!regions) return null;

            const countryOpen = openCountries.has(country);
            const regionKeys =
              country === "England"
                ? ENGLAND_REGION_ORDER.filter((r) => regions[r])
                : Object.keys(regions);

            const totalCount = regionKeys.reduce(
              (n, r) => n + (regions[r]?.length ?? 0),
              0
            );

            return (
              <div key={country}>
                {/* Country toggle */}
                <button
                  onClick={() => toggleCountry(country)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                      {country}
                    </span>
                    <span className="text-[9px] text-zinc-600">{totalCount}</span>
                  </div>
                  {countryOpen ? (
                    <ChevronDown className="h-3 w-3 text-zinc-600" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-zinc-600" />
                  )}
                </button>

                {countryOpen && (
                  <div>
                    {regionKeys.map((region) => {
                      const constituencies = regions[region];
                      if (!constituencies?.length) return null;

                      // For non-England countries there is only one "region" (the country itself),
                      // so skip the region header and list constituencies directly.
                      if (country !== "England") {
                        return constituencies.map((c) => {
                          const isActive = c.slug === constituencySlug;
                          return (
                            <button
                              key={c.slug}
                              onClick={() => {
                                onConstituencyChange(c.slug);
                                setSidebarOpen(false);
                              }}
                              className={`w-full text-left px-6 py-2 text-xs transition-colors border-l-2 ${
                                isActive
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500 font-medium"
                                  : "text-zinc-400 border-transparent hover:bg-muted/50 hover:text-zinc-200"
                              }`}
                            >
                              {c.name}
                            </button>
                          );
                        });
                      }

                      const regionOpen = openRegions.has(region);
                      return (
                        <div key={region}>
                          {/* Region toggle */}
                          <button
                            onClick={() => toggleRegion(region)}
                            className="w-full flex items-center justify-between pl-6 pr-4 py-1.5 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                                {region}
                              </span>
                              <span className="text-[9px] text-zinc-700">
                                {constituencies.length}
                              </span>
                            </div>
                            {regionOpen ? (
                              <ChevronDown className="h-2.5 w-2.5 text-zinc-700" />
                            ) : (
                              <ChevronRight className="h-2.5 w-2.5 text-zinc-700" />
                            )}
                          </button>

                          {regionOpen &&
                            constituencies.map((c) => {
                              const isActive = c.slug === constituencySlug;
                              return (
                                <button
                                  key={c.slug}
                                  onClick={() => {
                                    onConstituencyChange(c.slug);
                                    setSidebarOpen(false);
                                  }}
                                  className={`w-full text-left pl-8 pr-4 py-2 text-xs transition-colors border-l-2 ${
                                    isActive
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500 font-medium"
                                      : "text-zinc-400 border-transparent hover:bg-muted/50 hover:text-zinc-200"
                                  }`}
                                >
                                  {c.name}
                                </button>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
