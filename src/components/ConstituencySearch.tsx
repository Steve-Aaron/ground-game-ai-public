"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { ConstituencyOption } from "@/hooks/useConstituency";

interface Props {
  options: ConstituencyOption[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
  /** Optional placeholder override. */
  placeholder?: string;
  /** Maximum suggestions shown at once (default 20). */
  maxResults?: number;
  /** Match prefix only (default true) — first letter triggers, name must start with the typed string. */
  prefixOnly?: boolean;
}

/**
 * Typeahead search over a user's allowed constituency list. Renders an input
 * with a dropdown that appears as soon as the user types one character.
 *
 * Behaviour:
 *  - First keystroke opens the dropdown
 *  - Matches against the start of the constituency name (case-insensitive)
 *  - Keyboard: ArrowUp/Down navigate, Enter selects, Esc clears
 *  - Click outside closes the dropdown
 *
 * Used in the dashboard sidebar; reusable elsewhere if needed.
 */
export default function ConstituencySearch({
  options,
  selectedSlug,
  onSelect,
  placeholder = "Search constituencies…",
  maxResults = 20,
  prefixOnly = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo<ConstituencyOption[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matcher = prefixOnly
      ? (name: string) => name.toLowerCase().startsWith(q)
      : (name: string) => name.toLowerCase().includes(q);
    return options.filter((o) => matcher(o.name)).slice(0, maxResults);
  }, [options, query, maxResults, prefixOnly]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Reset active index whenever matches change.
  useEffect(() => {
    setActiveIndex(0);
  }, [matches]);

  function commit(option: ConstituencyOption) {
    onSelect(option.slug);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "Escape") {
        setQuery("");
        setOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choice = matches[activeIndex];
      if (choice) commit(choice);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  }

  return (
    <div
      data-component="ConstituencySearch"
      ref={wrapperRef}
      className="relative"
    >
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-[0.778rem] w-[0.778rem] text-zinc-500 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="constituency-search-listbox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(e.target.value.length > 0);
          }}
          onFocus={() => {
            if (query.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-emerald-500 outline-none pl-[2rem] pr-[2rem] py-[0.5rem] text-[0.778rem] text-zinc-100 placeholder:text-zinc-600"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
          >
            <X className="h-[0.778rem] w-[0.778rem]" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id="constituency-search-listbox"
          role="listbox"
          data-component="ConstituencySearchDropdown"
          className="absolute left-0 right-0 mt-[0.222rem] bg-[#141414] border border-[#2a2a2a] max-h-[18rem] overflow-y-auto z-[80] shadow-[0_0.444rem_1.333rem_rgba(0,0,0,0.6)]"
        >
          {matches.length === 0 ? (
            <div className="px-[0.778rem] py-[0.667rem] text-[0.722rem] text-zinc-600">
              No matches in your allowed list.
            </div>
          ) : (
            matches.map((m, i) => {
              const isActive = i === activeIndex;
              const isSelected = m.slug === selectedSlug;
              return (
                <button
                  key={m.slug}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // Use mousedown so the input doesn't lose focus first and
                    // trigger the outside-click handler before this fires.
                    e.preventDefault();
                    commit(m);
                  }}
                  className={`w-full text-left px-[0.778rem] py-[0.444rem] text-[0.778rem] transition-colors flex items-center justify-between gap-[0.444rem] ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-300"
                      : isSelected
                      ? "text-emerald-400"
                      : "text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <span>{m.name}</span>
                  {isSelected ? (
                    <span className="text-[0.556rem] uppercase tracking-widest text-emerald-500">
                      Active
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
