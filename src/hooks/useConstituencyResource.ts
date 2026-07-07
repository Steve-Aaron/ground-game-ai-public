"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConstituency, withConstituency } from "./useConstituency";

export interface UseConstituencyResourceOptions<T> {
  /**
   * Fallback value returned when the request errors. If provided, `error` is
   * still set but `data` will be the fallback (matches the 'mock data on
   * failure' pattern used by NewsFeed / Headlines).
   */
  fallback?: T;
  /** Custom error message. Defaults to 'Unable to load data'. */
  errorMessage?: string;
  /**
   * If true, skips the fetch entirely (e.g. tab not yet active). When the
   * flag flips to false the hook fetches on the next render.
   */
  skip?: boolean;
}

export interface UseConstituencyResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the request. */
  refetch: () => void;
}

/**
 * Fetches a constituency-scoped JSON endpoint and tracks loading / error
 * state. The path is appended with `?constituency=<slug>` automatically.
 *
 * Replaces the useState + useEffect + fetch + try/catch/finally boilerplate
 * repeated across every panel. Re-fetches when the constituency slug changes.
 *
 * Race-condition safe: if `slug` changes mid-flight the stale response is
 * discarded.
 */
export function useConstituencyResource<T>(
  path: string,
  options: UseConstituencyResourceOptions<T> = {}
): UseConstituencyResourceResult<T> {
  const { fallback, errorMessage = "Unable to load data", skip = false } = options;
  const { slug } = useConstituency();

  const [data, setData] = useState<T | null>(fallback ?? null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);

  // Bump on each fetch invocation so stale responses are ignored.
  const requestIdRef = useRef(0);

  const run = useCallback(async () => {
    if (skip) {
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withConstituency(path, slug));
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json: T = await res.json();
      if (requestId !== requestIdRef.current) return; // stale
      setData(json);
    } catch {
      if (requestId !== requestIdRef.current) return; // stale
      setError(errorMessage);
      if (fallback !== undefined) setData(fallback);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [path, slug, errorMessage, fallback, skip]);

  useEffect(() => {
    run();
    // run() captures every dep we care about.
  }, [run]);

  return { data, loading, error, refetch: run };
}
