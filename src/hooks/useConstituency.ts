"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CONSTITUENCIES } from "@/data/constituencies";
import { useMe } from "./useMe";

// Slug type is a plain string — the set of valid slugs is the full 650
// constituencies, filtered at runtime by the signed-in user's allowed list.
export type ConstituencySlug = string;

export interface ConstituencyOption {
  slug: string;
  name: string;
}

// Full selectable list (upstream API) — auth-agnostic. Prefer the `options`
// returned by useConstituency() in signed-in contexts.
export const SELECTABLE_CONSTITUENCIES: ConstituencyOption[] =
  CONSTITUENCIES.map((c) => ({ slug: c.slug, name: c.name }));

// Index `name` by `slug` once at module load — used to attach friendly names
// to the user's allowed slugs.
const NAME_BY_SLUG = new Map<string, string>(
  CONSTITUENCIES.map((c) => [c.slug, c.name])
);

/**
 * Returns the current constituency selection AND the list of options the
 * signed-in user is allowed to choose from. Selection logic:
 *
 * 1. Read `?constituency=<slug>` from the URL
 * 2. If that slug is in the user's allowed list, use it
 * 3. Otherwise default to the first allowed slug
 * 4. While the user is loading, return empty values — the UI should treat
 *    that as a 'loading' state
 */
export function useConstituency(): {
  slug: ConstituencySlug;
  name: string;
  options: ConstituencyOption[];
  loading: boolean;
} {
  const params = useSearchParams();
  const raw = params.get("constituency");
  const { me, loading } = useMe();

  const options = useMemo<ConstituencyOption[]>(() => {
    if (!me) return [];
    return me.allowedConstituencies
      .map((slug) => {
        const name = NAME_BY_SLUG.get(slug);
        return name ? { slug, name } : null;
      })
      .filter((x): x is ConstituencyOption => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [me]);

  const resolved = useMemo<ConstituencyOption>(() => {
    if (options.length === 0) return { slug: "", name: "" };
    if (raw) {
      const match = options.find((o) => o.slug === raw);
      if (match) return match;
    }
    return options[0];
  }, [options, raw]);

  return { slug: resolved.slug, name: resolved.name, options, loading };
}

/**
 * Append `?constituency=<slug>` (or `&constituency=…` if the path already has
 * a query) to a relative API path. Returns the path unchanged if slug is
 * empty (so callers can avoid firing requests before the user is loaded).
 */
export function withConstituency(path: string, slug: string): string {
  if (!slug) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}constituency=${encodeURIComponent(slug)}`;
}
