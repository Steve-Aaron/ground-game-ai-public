"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

interface Option {
  slug: string;
  name: string;
}

interface Props {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Searchable multi-select with chip rendering. Suitable for the full list of
 * 650 constituencies — filters at typeahead time so the list never renders
 * the full set at once.
 */
export default function ConstituencyMultiSelect({ options, selected, onChange }: Props) {
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.slug)),
    [options, selectedSet]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => !selectedSet.has(o.slug) && o.name.toLowerCase().includes(q))
      .slice(0, 25);
  }, [options, query, selectedSet]);

  function add(slug: string) {
    if (selectedSet.has(slug)) return;
    onChange([...selected, slug]);
    setQuery("");
  }

  function remove(slug: string) {
    onChange(selected.filter((s) => s !== slug));
  }

  function selectAll() {
    onChange(options.map((o) => o.slug));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div data-component="ConstituencyMultiSelect">
      <div className="flex items-center justify-between mb-[0.556rem]">
        <label className="text-[0.722rem] text-zinc-500 uppercase tracking-widest">
          Allowed constituencies ({selected.length})
        </label>
        <div className="flex gap-[0.556rem] text-[0.722rem] uppercase tracking-wider">
          <button
            type="button"
            onClick={selectAll}
            className="text-zinc-500 hover:text-emerald-400"
          >
            Select all
          </button>
          <span className="text-zinc-700">·</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-zinc-500 hover:text-red-400"
          >
            Clear
          </button>
        </div>
      </div>

      {selectedOptions.length > 0 ? (
        <div className="border border-border bg-background p-[0.556rem] mb-[0.556rem] max-h-[8rem] overflow-y-auto">
          <div className="flex flex-wrap gap-[0.333rem]">
            {selectedOptions.map((o) => (
              <span
                key={o.slug}
                className="inline-flex items-center gap-[0.222rem] px-[0.556rem] py-[0.111rem] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[0.722rem]"
              >
                {o.name}
                <button
                  type="button"
                  onClick={() => remove(o.slug)}
                  className="hover:text-red-400"
                  aria-label={`Remove ${o.name}`}
                >
                  <X className="h-[0.778rem] w-[0.778rem]" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to search 650 constituencies…"
        className="w-full bg-background border border-border focus:border-emerald-500 outline-none px-[0.833rem] py-[0.611rem] text-[0.833rem] text-foreground"
      />

      {matches.length > 0 ? (
        <div className="border border-t-0 border-border bg-card max-h-[15rem] overflow-y-auto">
          {matches.map((o) => (
            <button
              key={o.slug}
              type="button"
              onClick={() => add(o.slug)}
              className="w-full text-left px-[0.833rem] py-[0.444rem] text-[0.833rem] text-zinc-300 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              {o.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
