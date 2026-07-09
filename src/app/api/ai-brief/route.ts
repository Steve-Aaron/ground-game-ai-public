import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";
import { requireConstituencyAccess } from "@/lib/guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Retry policy for transient Gemini 503s ('model currently overloaded').
const MAX_ATTEMPTS = 5;
// Exponential backoff with jitter — 1s, 2s, 4s, 8s nominal. Cap at 10s.
function backoffDelayMs(attempt: number): number {
  const base = Math.min(10_000, 1000 * 2 ** (attempt - 1));
  const jitter = Math.random() * 400;
  return base + jitter;
}

// Brief cache TTL. Without this the cache row never expires, so a brief
// generated when source data was unavailable would be served forever.
const BRIEF_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Gemini model — Flash chosen for cost/latency parity with the previous Haiku
// pick. Override at deploy time via GEMINI_MODEL if you want Pro etc.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_ENDPOINT = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

function briefDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildNoKeyBrief(name: string, mpName: string, mpParty: string): string {
  return `# Constituency Intelligence Brief — ${name}

**Generated:** ${briefDate()}

**MP:** ${mpName} (${mpParty})

---

> **AI Brief unavailable.** The Gemini API key is not configured. Set the \`GEMINI_API_KEY\` environment variable to enable AI-powered intelligence synthesis.
`;
}

function buildErrorBrief(name: string, mpName: string, mpParty: string, reason: string): string {
  return `# Constituency Intelligence Brief — ${name}

**Generated:** ${briefDate()}

**MP:** ${mpName} (${mpParty})

---

> **AI Brief generation failed.** ${reason}
`;
}

interface DataSources {
  news: unknown;
  crime: unknown;
  parliament: unknown;
  fixmystreet: unknown;
}

interface BriefData {
  brief: string;
  generated: string;
  model?: string;
  usage?: unknown;
}

async function fetchLocalData(
  baseUrl: string,
  slug: string,
  cookieHeader: string
): Promise<DataSources> {
  const c = encodeURIComponent(slug);
  const endpoints = [
    { key: "news", path: `/api/news?constituency=${c}` },
    { key: "crime", path: `/api/crime?constituency=${c}` },
    { key: "parliament", path: `/api/parliament?type=votes&constituency=${c}` },
    { key: "fixmystreet", path: `/api/fixmystreet?constituency=${c}` },
  ];

  // Forward the user's session cookie. Without this the middleware in
  // src/middleware.ts redirects each sub-fetch to /login (no session present
  // on a server-to-server call), the redirect is followed, the response body
  // is the /login HTML, and `await res.json()` throws — every source comes
  // back as null and Gemini gets "No data available" for every section.
  const headers: Record<string, string> = { "User-Agent": "GroundGameAI/1.0" };
  if (cookieHeader) headers.cookie = cookieHeader;

  const results = await Promise.allSettled(
    endpoints.map(async (ep) => {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        cache: "no-store",
        headers,
        redirect: "manual", // Don't silently follow a middleware redirect to /login.
      });
      if (!res.ok) return { key: ep.key, data: null };
      try {
        return { key: ep.key, data: await res.json() };
      } catch {
        return { key: ep.key, data: null };
      }
    })
  );

  const sources: DataSources = { news: null, crime: null, parliament: null, fixmystreet: null };
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      const k = r.value.key as keyof DataSources;
      sources[k] = r.value.data;
    }
  }
  return sources;
}

function summariseData(data: unknown, type: string): string {
  if (!data) return "No data available";
  try {
    const d = data as Record<string, unknown>;
    if (type === "news") {
      const items = (d.items || d.articles || []) as Array<{ title?: string; source?: string }>;
      return items.slice(0, 10).map((i) => `- ${i.title || "Untitled"} (${i.source || "unknown"})`).join("\n") || "No headlines";
    }
    if (type === "crime") {
      const summary = d.summary as Array<{ category?: string; count?: number }> | undefined;
      const months = d.months as string[] | undefined;
      const monthlyTotals = d.monthlyTotals as Array<{ month?: string; count?: number }> | undefined;

      // Header line: which months the figures actually cover, so Gemini can
      // describe the window correctly rather than claiming "this month".
      const windowLine =
        Array.isArray(months) && months.length > 0
          ? `Window: ${months[0]} → ${months[months.length - 1]} (${months.length} months)`
          : "Window: unknown";

      // Per-month totals → lets the model spot trend (rising / falling).
      const trendBlock =
        Array.isArray(monthlyTotals) && monthlyTotals.length > 0
          ? "Per-month totals:\n" +
            monthlyTotals.map((m) => `- ${m.month ?? "?"}: ${m.count ?? 0}`).join("\n")
          : "";

      if (Array.isArray(summary) && summary.length > 0) {
        const lines = summary.map((s) => `- ${s.category ?? "Unknown"}: ${s.count ?? 0}`).join("\n");
        const total = typeof d.total === "number" ? `\nTotal across window: ${d.total}` : "";
        return [windowLine, "", "Category breakdown:", lines, total, trendBlock].filter(Boolean).join("\n");
      }
      const crimes = (d.crimes || []) as unknown[];
      return `${windowLine}\n${crimes.length} total crimes reported`;
    }
    if (type === "parliament") {
      const votes = (d.votes || []) as Array<{ title?: string; votedAye?: boolean; date?: string }>;
      return votes.slice(0, 10).map((v) => `- ${v.votedAye ? "Aye" : "No"}: ${v.title} (${v.date?.substring(0, 10) || ""})`).join("\n") || "No votes";
    }
    if (type === "fixmystreet") {
      const reports = (d.reports || []) as Array<{ title?: string; category?: string }>;
      return reports.slice(0, 10).map((r) => `- [${r.category || "other"}] ${r.title || "Untitled"}`).join("\n") || "No reports";
    }
    const str = JSON.stringify(data);
    return str.length > 2000 ? str.substring(0, 2000) + "..." : str;
  } catch {
    return "Data parsing error";
  }
}

function buildPrompt(data: DataSources, name: string, mpName: string, mpParty: string): string {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `You are a senior political intelligence analyst producing a daily constituency brief.

Today's date: ${today}
Constituency: ${name}
MP: ${mpName} (${mpParty})

Below is raw data collected from multiple sources. Synthesise it into a structured, actionable constituency intelligence brief in clean markdown format.

---

## SOURCE DATA

### Local News Headlines
${summariseData(data.news, "news")}

### Crime Summary (rolling 3-month window from data.police.uk)
${summariseData(data.crime, "crime")}

### Recent Parliamentary Votes
${summariseData(data.parliament, "parliament")}

### Community Issues (FixMyStreet)
${summariseData(data.fixmystreet, "fixmystreet")}

---

## INSTRUCTIONS

Produce the brief with these sections in markdown:

# Daily Constituency Intelligence Brief — ${name}
Include today's date and MP name.

## Top Local Stories
List the top 5 most relevant local news stories with relevance assessment.

## Community Issues Trending
Summarise FixMyStreet themes and clusters.

## Crime & Safety Summary
Summarise the crime data **across the 3-month window provided**. State the
exact months covered, the total, and the top categories. Use the per-month
totals to call out a clear rising or falling trend if one exists; otherwise
say activity is broadly steady. Flag anything unusual.

## Parliamentary Activity
Summarise recent voting activity for the MP.

## Key Talking Points
Provide 3-5 conversation-ready bullet points.

## Risk Flags
Note emerging issues to watch in 24-48 hours.

Be specific. Do not invent or hallucinate information not present in the source data.`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }>; role?: string };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  modelVersion?: string;
}

/**
 * Single call to Gemini. Returns either the parsed brief, or a discriminated
 * failure: {retryable: true} for 503/overloaded, {retryable: false} for
 * permanent errors (auth, bad request, etc).
 */
async function callGeminiOnce(
  apiKey: string,
  prompt: string
): Promise<
  | { ok: true; data: BriefData }
  | { ok: false; retryable: boolean; status: number; message: string }
> {
  let res: Response;
  try {
    res = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        // 3000 was tight: seven sections × 3-month detail occasionally ran the
        // model out mid-bullet (Crime & Safety surfaced as a `- **` orphan).
        // 8000 leaves headroom; Gemini Flash bills per output token so the
        // marginal cost is still negligible.
        generationConfig: { temperature: 0.4, maxOutputTokens: 8000 },
      }),
      cache: "no-store",
    });
  } catch (e) {
    // Network-level failures: treat as retryable.
    return {
      ok: false,
      retryable: true,
      status: 0,
      message: e instanceof Error ? e.message : "Network error contacting Gemini",
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryable = res.status === 503 || res.status === 429 || (res.status >= 500 && res.status < 600);
    return { ok: false, retryable, status: res.status, message: body.slice(0, 400) };
  }

  let geminiData: GeminiResponse;
  try {
    geminiData = (await res.json()) as GeminiResponse;
  } catch {
    return { ok: false, retryable: false, status: res.status, message: "Gemini returned non-JSON" };
  }

  const brief = geminiData.candidates
    ?.flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .filter((t) => t.length > 0)
    .join("\n");

  if (!brief) {
    return { ok: false, retryable: false, status: res.status, message: "Gemini returned empty response (no text parts)" };
  }

  return {
    ok: true,
    data: {
      brief,
      generated: new Date().toISOString(),
      model: geminiData.modelVersion || GEMINI_MODEL,
      usage: geminiData.usageMetadata,
    },
  };
}

// ── Streaming protocol ───────────────────────────────────────────────────
// Newline-delimited JSON events sent to the client:
//   {type:"attempt", n:1, of:5}                — about to call Gemini
//   {type:"retry",  n:1, of:5, status:503,
//                   message:"...", waitMs:1234}  — after a 503, before sleep
//   {type:"result", brief:"...", generated:...} — success
//   {type:"error",  message:"..."}              — terminal failure

type Event =
  | { type: "attempt"; n: number; of: number }
  | { type: "retry"; n: number; of: number; status: number; message: string; waitMs: number }
  | { type: "result"; brief: string; generated: string; model?: string; usage?: unknown; source?: string }
  | { type: "error"; message: string };

function ev(e: Event): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(e) + "\n");
}

async function generateWithRetries(
  controller: ReadableStreamDefaultController<Uint8Array>,
  baseUrl: string,
  apiKey: string,
  slug: string,
  name: string,
  mpName: string,
  mpParty: string,
  cookieHeader: string
): Promise<BriefData | null> {
  const data = await fetchLocalData(baseUrl, slug, cookieHeader);
  const prompt = buildPrompt(data, name, mpName, mpParty);

  let lastError = "Unknown error";
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    controller.enqueue(ev({ type: "attempt", n, of: MAX_ATTEMPTS }));

    const result = await callGeminiOnce(apiKey, prompt);
    if (result.ok) {
      return result.data;
    }

    lastError = `Gemini ${result.status || "network"}: ${result.message}`;

    if (!result.retryable || n === MAX_ATTEMPTS) {
      controller.enqueue(ev({ type: "error", message: lastError }));
      return null;
    }

    const waitMs = backoffDelayMs(n);
    controller.enqueue(
      ev({
        type: "retry",
        n,
        of: MAX_ATTEMPTS,
        status: result.status,
        message: result.message.slice(0, 200),
        waitMs,
      })
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }
  controller.enqueue(ev({ type: "error", message: lastError }));
  return null;
}

async function tryWriteCache(cacheDocRef: DocumentReference, fresh: BriefData) {
  try {
    const existing = await cacheDocRef.get();
    const existingData = existing.data()?.data ?? null;
    if (existingData && JSON.stringify(existingData) === JSON.stringify(fresh)) return;
    await cacheDocRef.set({
      data: fresh,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("AI brief cache write failed (returning fresh anyway):", err);
  }
}

export async function GET(request: Request) {
  // __AUTH_GUARD__
  const __guard = await requireConstituencyAccess(request);
  if (__guard instanceof NextResponse) return __guard;

  const apiKey = process.env.GEMINI_API_KEY;
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const { searchParams } = url;
  // Clients pass `?stream=1` to opt into the SSE-style progress feed.
  // Plain JSON callers (server-side aggregations etc) still get the legacy
  // shape with no progress events.
  const wantsStream = searchParams.get("stream") === "1";
  // `?refresh=1` (or upstream's `?force=1`) forces a fresh Gemini call,
  // ignoring any cached brief. Surfaced via the refresh button in AIBrief.tsx.
  const forceRefresh =
    searchParams.get("refresh") === "1" || searchParams.get("force") === "1";
  // Forwarded to sub-fetches so the auth guard on /api/crime etc lets them
  // through. Server-to-server fetch() does NOT auto-attach incoming cookies.
  const cookieHeader = request.headers.get("cookie") ?? "";

  const constituencySlug = searchParams.get("constituency") ?? "";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json({ error: "Invalid constituency slug" }, { status: 400 });
  }
  if (!constituencyData.mp) {
    return Response.json({ error: "MP data not available for this constituency" }, { status: 400 });
  }

  const NAME = constituencyData.constituency.name;
  const MP_NAME = constituencyData.mp.name;
  const MP_PARTY = constituencyData.constituency.party;

  const cacheDocRef = adminDb().collection("ai_brief_cache").doc(constituencySlug);

  // Cache read is best-effort.
  let cached: { data: BriefData; updated_at: string } | null = null;
  if (!forceRefresh) {
    try {
      const snap = await cacheDocRef.get();
      if (snap.exists) {
        const candidate = snap.data() as { data: BriefData; updated_at: string };
        const ageMs = Date.now() - new Date(candidate.updated_at).getTime();
        if (ageMs <= BRIEF_CACHE_TTL_MS) {
          cached = candidate;
        }
      }
    } catch (err) {
      console.warn("AI brief cache read failed:", err);
    }
  }

  // Cache hit path: return immediately. No retries needed, no streaming
  // benefit (we already have the answer).
  if (cached) {
    if (wantsStream) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(ev({ type: "result", ...cached!.data, source: "cache" }));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
      });
    }
    return NextResponse.json({
      ...cached.data,
      source: "cache",
      _cachedAt: new Date(cached.updated_at).getTime(),
    });
  }

  // No key configured: serve the placeholder brief, no retries possible.
  if (!apiKey) {
    const payload: BriefData = {
      brief: buildNoKeyBrief(NAME, MP_NAME, MP_PARTY),
      generated: new Date().toISOString(),
    };
    if (wantsStream) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(ev({ type: "result", ...payload }));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
      });
    }
    return NextResponse.json(payload);
  }

  // Streaming generation with retries.
  if (wantsStream) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const fresh = await generateWithRetries(
            controller,
            baseUrl,
            apiKey,
            constituencySlug,
            NAME,
            MP_NAME,
            MP_PARTY,
            cookieHeader
          );
          if (fresh) {
            await tryWriteCache(cacheDocRef, fresh);
            controller.enqueue(ev({ type: "result", ...fresh }));
          }
          controller.close();
        } catch (e) {
          controller.enqueue(
            ev({
              type: "error",
              message: e instanceof Error ? e.message : "Unknown error",
            })
          );
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
  }

  // Non-streaming legacy path — still retries, just doesn't surface progress.
  // We collect events from a sink controller and discard them.
  const sink = new ReadableStream<Uint8Array>({ start() {} });
  const reader = sink.getReader();
  reader.releaseLock();
  // Use an in-process controller wrapper that ignores enqueues.
  const noop: ReadableStreamDefaultController<Uint8Array> = {
    desiredSize: null,
    close: () => {},
    enqueue: () => {},
    error: () => {},
  } as unknown as ReadableStreamDefaultController<Uint8Array>;

  const fresh = await generateWithRetries(
    noop,
    baseUrl,
    apiKey,
    constituencySlug,
    NAME,
    MP_NAME,
    MP_PARTY,
    cookieHeader
  );

  if (!fresh) {
    return NextResponse.json(
      {
        brief: buildErrorBrief(NAME, MP_NAME, MP_PARTY, "Gemini repeatedly overloaded (503). Try again in a moment."),
        generated: new Date().toISOString(),
        error: "Gemini overloaded after retries",
      },
      { status: 200 }
    );
  }

  const cachedAt = Date.now();
  await tryWriteCache(cacheDocRef, fresh);
  return NextResponse.json({ ...fresh, _cachedAt: cachedAt }, { status: 200 });
}
