"use client";

import { useEffect, useState } from "react";

export interface MeData {
  uid: string;
  email: string;
  role: "user" | "admin";
  allowedConstituencies: string[];
}

interface MeState {
  me: MeData | null;
  loading: boolean;
}

let cached: MeData | null = null;
let inflight: Promise<MeData | null> | null = null;

async function fetchMe(): Promise<MeData | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<MeData>) : null))
    .then((data) => {
      cached = data;
      inflight = null;
      return data;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}

/**
 * Singleton hook for the current user. Caches in-module so multiple
 * components don't refetch on mount. Call `clearMeCache()` after sign-in/out.
 */
export function useMe(): MeState {
  const [state, setState] = useState<MeState>({ me: cached, loading: !cached });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (cancelled) return;
      setState({ me, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function clearMeCache() {
  cached = null;
  inflight = null;
}
