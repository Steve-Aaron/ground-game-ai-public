"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withConstituency } from "./useConstituency";
import type { ConstituencyPrediction } from "@/app/api/electoral-calculus/route";

/** Headline prediction shape shared by ECPrediction and ElectoralIntel. */
export interface EcPrediction {
  prediction: string;
  predicted: Record<string, number>;
  winningChances: Record<string, number>;
  lastUpdated: string;
}

/** Ward-level EC data keyed by ward name. */
export type EcWardData = Record<
  string,
  { electorate: number; winner2024: string; predictedWinner: string }
>;

// Convert live EC constituency data to the shape used by ecPrediction
function toLiveEcPrediction(ec: ConstituencyPrediction): EcPrediction {
  const predicted: Record<string, number> = {};
  const keyMap: Record<string, string> = { CON: "CON", LAB: "LAB", Reform: "Reform", LIB: "LIB", Green: "Green" };
  for (const [ecKey, ourKey] of Object.entries(keyMap)) {
    if (ec.predicted[ecKey]?.share) {
      predicted[ourKey] = ec.predicted[ecKey].share;
    }
  }
  return {
    prediction: ec.prediction,
    predicted,
    winningChances: ec.winningChances,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
}

// Convert live EC ward data to the shape used by wardElectoralCalc
function toLiveWardData(wards: ConstituencyPrediction["wards"]): EcWardData {
  const result: EcWardData = {};
  for (const w of wards) {
    if (w.ward) {
      result[w.ward] = {
        electorate: w.electorate,
        winner2024: w.winner2024,
        predictedWinner: w.predictedWinner,
      };
    }
  }
  return result;
}

export interface UseElectoralCalculusResult {
  prediction: EcPrediction | null;
  wardData: EcWardData;
  indicators: ConstituencyPrediction["indicators"];
  loading: boolean;
  error: string | null;
  /** Re-run the request. */
  refetch: () => void;
}

/**
 * Fetches the live Electoral Calculus seat scrape for a constituency and
 * tracks loading / error state. No default or fallback prediction data —
 * starts empty; failures surface as an error message, never as another
 * constituency's numbers.
 *
 * Race-condition safe: if `slug` changes mid-flight the stale response is
 * discarded (same requestId pattern as useConstituencyResource).
 */
export function useElectoralCalculus(slug: string): UseElectoralCalculusResult {
  const [prediction, setPrediction] = useState<EcPrediction | null>(null);
  const [wardData, setWardData] = useState<EcWardData>({});
  const [indicators, setIndicators] = useState<ConstituencyPrediction["indicators"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bump on each fetch invocation so stale responses are ignored.
  const requestIdRef = useRef(0);

  const run = useCallback(async () => {
    // Slug is "" while the signed-in user is still loading. Don't fire a
    // slug-less request — the slug change re-runs this effect once auth
    // resolves, and `loading` stays true so panels show their skeletons.
    if (!slug) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setPrediction(null);
    setWardData({});
    setIndicators(null);
    try {
      const res = await fetch(withConstituency("/api/electoral-calculus?type=seat", slug));
      if (!res.ok) {
        // Surface WHY the scrape failed (seat-name mismatch, EC blocking
        // the server, etc.) instead of a silent generic empty state.
        const body = (await res.json().catch(() => null)) as
          | { message?: string; error?: string; detail?: string }
          | null;
        if (requestId !== requestIdRef.current) return; // stale
        setError(body?.message ?? body?.detail ?? body?.error ?? `Request failed (${res.status})`);
        return;
      }
      const data: ConstituencyPrediction = await res.json();
      if (requestId !== requestIdRef.current) return; // stale
      if (data.prediction && Object.keys(data.predicted).length > 0) {
        setPrediction(toLiveEcPrediction(data));
        setIndicators(data.indicators ?? null);
      } else {
        setError("Electoral Calculus returned no prediction for this seat.");
      }
      if (data.wards && data.wards.length > 0) {
        const liveWards = toLiveWardData(data.wards);
        if (Object.keys(liveWards).length > 0) {
          setWardData(liveWards);
        }
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return; // stale
      setError((err as Error).message || "Unable to reach Electoral Calculus");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    run();
  }, [run]);

  return { prediction, wardData, indicators, loading, error, refetch: run };
}
