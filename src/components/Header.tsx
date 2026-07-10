"use client";

import Link from "next/link";
import { LogOut, Menu, RefreshCw, Shield, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";
import type { ConstituencyOption, ConstituencySlug } from "@/hooks/useConstituency";
import ConstituencySearch from "./ConstituencySearch";
import ThemeToggle from "@/components/ThemeToggle";

export type TabId = "map" | "political" | "polling" | "demographics" | "local" | "material" | "canvassing";

const TABS: { id: TabId; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "political", label: "Political" },
  { id: "polling", label: "Polling" },
  { id: "demographics", label: "Demographics" },
  { id: "local", label: "Local Issues" },
  { id: "material", label: "Campaign Material" },
  { id: "canvassing", label: "Campaign Events" },
];

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  constituencySlug: ConstituencySlug;
  onConstituencyChange: (slug: ConstituencySlug) => void;
  /** Allowed constituencies for the signed-in user. */
  options: ConstituencyOption[];
}


/** Reloads the page so every panel refetches — the simple, reliable way to
 * pull the latest data across the board. Server-side caches still apply
 * their own TTLs (and the Apify budget caps stay enforced). */
function RefreshButton() {
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      data-component="pageRefresh"
      onClick={() => {
        setSpinning(true);
        window.location.reload();
      }}
      title="Refresh data"
      aria-label="Refresh data"
      className="text-zinc-400 hover:text-emerald-400 transition-colors"
    >
      <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
}

export default function Header({
  activeTab,
  onTabChange,
  constituencySlug,
  onConstituencyChange,
  options,
}: HeaderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { me } = useMe();

  // Close on Escape — standard sidebar behaviour. Listener is only registered
  // while the sidebar is open so the global keyup is a no-op the rest of the
  // time.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, [sidebarOpen]);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    // Hard reload — clears all client state and the singleton useMe cache.
    window.location.href = "/login";
  }

  return (
    <>
      <header data-component="header" className="bg-card border-b border-border sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: Logo */}
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

          {/* Right: admin link + signed-in email + sidebar trigger */}
          <div className="flex items-center gap-3">
            {me?.role === "admin" ? (
              <Link
                href="/admin"
                data-component="AdminLink"
                className="hidden md:flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-emerald-400"
              >
                <Shield className="h-3 w-3" />
                Admin
              </Link>
            ) : null}
            {me ? (
              <span
                data-component="SignedInEmail"
                className="hidden lg:block text-[10px] text-zinc-600 uppercase tracking-wider truncate max-w-[10rem]"
                title={me.email}
              >
                {me.email}
              </span>
            ) : null}
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="hidden md:flex items-center text-zinc-500 hover:text-red-400"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <div className="hidden md:flex items-center gap-1.5 px-2 py-1 border border-border">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[0.556rem] text-zinc-500 uppercase tracking-wider">Live</span>
            </div>
            <RefreshButton />
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

        {/* Tab bar */}
        <div className="flex border-t border-border overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 text-[0.611rem] uppercase tracking-wider font-medium transition-colors whitespace-nowrap ${
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

      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        data-component="constituencySidebar"
        className={`fixed inset-y-0 right-0 w-72 bg-card border-l border-border z-[70] flex flex-col transform transition-transform duration-200 ease-out ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!sidebarOpen}
        aria-label="Constituency selector"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">
            Constituencies ({options.length})
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="text-zinc-400 hover:text-foreground"
          >
            <X className="h-[0.889rem] w-[0.889rem]" />
          </button>
        </div>

        {/* Search — typeahead over the user's allowed list */}
        {options.length > 0 ? (
          <div className="px-4 py-3 border-b border-border">
            <ConstituencySearch
              options={options}
              selectedSlug={constituencySlug}
              onSelect={(slug) => {
                onConstituencyChange(slug);
                setSidebarOpen(false);
              }}
            />
          </div>
        ) : null}

        <nav className="flex-1 overflow-y-auto py-2">
          {options.length === 0 ? (
            <div className="px-4 py-6 text-xs text-zinc-600">
              No constituencies assigned to your account. Contact your administrator.
            </div>
          ) : (
            options.map((c) => {
              const isActive = c.slug === constituencySlug;
              return (
                <button
                  key={c.slug}
                  onClick={() => {
                    onConstituencyChange(c.slug);
                    setSidebarOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs transition-colors border-l-2 ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500 font-medium"
                      : "text-zinc-400 border-transparent hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  {c.name}
                </button>
              );
            })
          )}
        </nav>

        {/* Mobile-only admin + signout (md+ shows them in the topbar) */}
        <div className="border-t border-border p-4 md:hidden flex items-center justify-between">
          {me?.role === "admin" ? (
            <Link
              href="/admin"
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400 hover:text-emerald-400"
              onClick={() => setSidebarOpen(false)}
            >
              <Shield className="h-3 w-3" />
              Admin panel
            </Link>
          ) : (
            <span />
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400 hover:text-red-400"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
