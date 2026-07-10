"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, AlertTriangle } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import PanelSkeleton from "./ui/PanelSkeleton";

// Stream event shape, mirroring src/app/api/ai-brief/route.ts. Kept inline
// here rather than imported so the client bundle doesn't drag in any
// server-side modules.
interface BriefSource {
  label: string;
  url: string;
}

type StreamEvent =
  | { type: "attempt"; n: number; of: number }
  | { type: "retry"; n: number; of: number; status: number; message: string; waitMs: number }
  | { type: "result"; brief: string; generated: string; model?: string; source?: string; sources?: BriefSource[] }
  | { type: "error"; message: string };

interface Attempt {
  n: number;
  of: number;
}

interface RetryInfo {
  n: number;
  of: number;
  status: number;
  message: string;
  waitMs: number;
}

export default function AIBrief() {
  const { slug } = useConstituency();
  const [brief, setBrief] = useState<string>("");
  const [generated, setGenerated] = useState<string>("");
  const [sources, setSources] = useState<BriefSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [retry, setRetry] = useState<RetryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the active abort controller so a constituency change (or unmount)
  // tears down the in-flight stream rather than leaving it dangling.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Slug is "" while auth is loading — without this guard the request
    // fires slug-less and previously rendered the default constituency's
    // brief. The effect re-runs once the real slug resolves.
    if (!slug) return;
    fetchBriefStream(false);
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function fetchBriefStream(force: boolean) {
    // Cancel any prior in-flight stream.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setAttempt(null);
    setRetry(null);

    try {
      // `refresh=1` bypasses the server-side ai_brief_cache. We only set it
      // when the user clicks the refresh button — initial loads still
      // benefit from the cache.
      const path = force ? "/api/ai-brief?stream=1&refresh=1" : "/api/ai-brief?stream=1";
      const res = await fetch(withConstituency(path, slug), {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        throw new Error(`Brief request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep last (possibly partial) line in the buffer.
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(trimmed) as StreamEvent;
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
      // Drain trailing buffered line if any.
      const tail = buffer.trim();
      if (tail) {
        try {
          handleEvent(JSON.parse(tail) as StreamEvent);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user navigated away
      setError((e as Error).message || "Failed to load brief");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleEvent(event: StreamEvent) {
    if (event.type === "attempt") {
      setAttempt({ n: event.n, of: event.of });
      setRetry(null);
    } else if (event.type === "retry") {
      setRetry({ n: event.n, of: event.of, status: event.status, message: event.message, waitMs: event.waitMs });
    } else if (event.type === "result") {
      setBrief(event.brief || "");
      setGenerated(event.generated || "");
      setSources(event.sources ?? []);
      setError(null);
      setAttempt(null);
      setRetry(null);
    } else if (event.type === "error") {
      setError(event.message);
      setAttempt(null);
      setRetry(null);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchBriefStream(true);
  }

  /** Download the brief as Markdown, with a deterministic sources section. */
  function handleExport() {
    if (!brief) return;
    const sourceSection =
      sources.length > 0
        ? `\n\n---\n\n## Sources & Further Reading\n\n${sources
            .map((src) => `- [${src.label}](${src.url})`)
            .join("\n")}\n`
        : "";
    const generatedLine = generated
      ? `\n\n_Exported from Ground Game Intel — generated ${new Date(generated).toLocaleString("en-GB")}_\n`
      : "";
    const content = `${brief}${sourceSection}${generatedLine}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-brief-${slug || "constituency"}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Loading state with attempt progress ────────────────────────────────
  if (loading) {
    return (
      <div data-component="AIBriefLoading" className="space-y-[0.667rem]">
        <PanelSkeleton variant="list" rows={4} className="p-[0.889rem]" />

        <div className="mt-[1.111rem] flex flex-col items-center gap-[0.333rem]">
          <p className="text-[0.611rem] text-zinc-500 uppercase tracking-wider">
            Generating AI intelligence brief
          </p>

          {attempt ? (
            <p
              data-component="AIBriefAttempt"
              className="text-[0.611rem] text-zinc-400"
            >
              Attempt{" "}
              <span className="text-emerald-400 font-medium">
                {attempt.n}/{attempt.of}
              </span>
            </p>
          ) : null}

          {retry ? (
            <p
              data-component="AIBriefRetry"
              className="text-[0.556rem] text-amber-400/80 max-w-xs text-center leading-relaxed"
            >
              Gemini returned {retry.status === 503 ? "503 (overloaded)" : `error ${retry.status}`}.
              Retrying in {(retry.waitMs / 1000).toFixed(1)}s ({retry.n}/{retry.of} failed)
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Terminal error state ───────────────────────────────────────────────
  if (error) {
    const overloaded = /503|overload|unavailable/i.test(error);
    return (
      <div data-component="AIBriefError" className="p-[1.111rem]">
        <div className="flex items-start gap-[0.556rem] border border-amber-500/30 bg-amber-500/5 p-[0.889rem]">
          <AlertTriangle className="h-[0.889rem] w-[0.889rem] text-amber-400 flex-shrink-0 mt-[0.111rem]" />
          <div className="flex-1 min-w-0">
            <p className="text-[0.722rem] text-amber-300 font-medium uppercase tracking-wider mb-[0.333rem]">
              {overloaded ? "Gemini is overloaded" : "Brief unavailable"}
            </p>
            <p className="text-[0.611rem] text-zinc-400 leading-relaxed mb-[0.556rem]">
              {overloaded
                ? `Gemini's API returned 503 on all ${MAX_ATTEMPTS_DISPLAY} attempts. The model is experiencing high demand — usually clears within a few minutes.`
                : error}
            </p>
            <button
              onClick={handleRefresh}
              className="text-[0.611rem] uppercase tracking-wider text-emerald-400 hover:text-emerald-300 flex items-center gap-[0.333rem]"
            >
              <RefreshCw className="h-[0.667rem] w-[0.667rem]" />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Flex column with an explicit max height. The middle region is the only
    // scroll container — Panel wraps us in `overflow-hidden flex flex-col`
    // with a `flex-1 overflow-auto` body, so a nested `max-h` on the content
    // div alone didn't reliably trigger scroll. Capping the root height +
    // letting the middle take flex-1 + min-h-0 fixes that.
    <div data-component="AIBrief" className="flex flex-col h-full max-h-[40rem]">
      {/* Header bar with timestamp and refresh */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        {generated && (
          <span className="text-[0.556rem] text-zinc-600">
            Generated:{" "}
            {new Date(generated).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        <span className="flex items-center gap-1">
          <button
            data-component="briefExport"
            onClick={handleExport}
            disabled={!brief || loading}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
            title="Export brief as Markdown (includes source links)"
          >
            <Download className="h-[0.667rem] w-[0.667rem] text-zinc-500" />
          </button>
          <button
            data-component="briefRefresh"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
            title="Update brief — regenerates from the latest data"
          >
            <RefreshCw
              className={`h-[0.667rem] w-[0.667rem] text-zinc-500 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </span>
      </div>

      {/* Brief content rendered as markdown-like HTML — the only scroll
          region. `min-h-0` is required for overflow-y-auto to actually clip
          inside a flex column parent. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-[0.667rem] py-[0.667rem]">
        <div className="prose prose-invert prose-xs max-w-none">
          {brief.split("\n").map((line, i) => {
            if (line.startsWith("# ")) {
              return (
                <h3
                  key={i}
                  className="text-sm font-bold text-zinc-100 mt-[0.667rem] mb-[0.444rem] first:mt-0"
                >
                  {line.replace(/^# /, "")}
                </h3>
              );
            }
            if (line.startsWith("## ")) {
              return (
                <h4
                  key={i}
                  className="text-xs font-semibold text-emerald-400 mt-[0.667rem] mb-[0.333rem] uppercase tracking-wide"
                >
                  {line.replace(/^## /, "")}
                </h4>
              );
            }
            if (line.startsWith("### ")) {
              return (
                <h5
                  key={i}
                  className="text-xs font-semibold text-zinc-300 mt-[0.444rem] mb-[0.222rem]"
                >
                  {line.replace(/^### /, "")}
                </h5>
              );
            }
            if (line.startsWith("---")) {
              return (
                <hr
                  key={i}
                  className="border-border my-2"
                />
              );
            }
            if (line.startsWith("- ") || line.startsWith("* ")) {
              const content = line.replace(/^[-*] /, "").trim();
              // Skip bullets whose content is empty or just orphan markdown
              // markers (e.g. a stray `**` left behind by a mid-bold truncation
              // upstream). Prevents the dashboard from showing empty bullets.
              if (!content || /^[*_`]+$/.test(content)) return null;
              return (
                <div
                  key={i}
                  className="flex gap-[0.333rem] text-[0.611rem] text-zinc-400 leading-relaxed ml-[0.222rem] mb-[0.111rem]"
                >
                  <span className="text-emerald-500 mt-[0.111rem]">•</span>
                  <span dangerouslySetInnerHTML={{ __html: formatInline(content) }} />
                </div>
              );
            }
            if (line.startsWith("> ")) {
              return (
                <div
                  key={i}
                  className="border-l-2 border-amber-500/50 pl-[0.444rem] text-[0.611rem] text-amber-400/80 italic my-[0.222rem]"
                >
                  {line.replace(/^> /, "")}
                </div>
              );
            }
            if (line.trim() === "") {
              return <div key={i} className="h-[0.333rem]" />;
            }
            return (
              <p
                key={i}
                className="text-[0.611rem] text-zinc-400 leading-relaxed mb-[0.222rem]"
                dangerouslySetInnerHTML={{ __html: formatInline(line) }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex-shrink-0 px-3 py-2 border-t border-border/50 text-center">
        <span className="text-[10px] text-zinc-600">
          Powered by Knox Digital AI
        </span>
      </div>
    </div>
  );
}

// Matches MAX_ATTEMPTS in src/app/api/ai-brief/route.ts. Kept local to avoid
// a server-side import; bump in lockstep.
const MAX_ATTEMPTS_DISPLAY = 5;

function formatInline(text: string): string {
  // Pre-pass: if the model produced an unclosed `**` (truncation upstream),
  // drop the trailing orphan so it doesn't render as literal asterisks.
  const bolds = (text.match(/\*\*/g) ?? []).length;
  const safe = bolds % 2 === 0 ? text : text.replace(/\*\*(?!.*\*\*)/, "");

  return safe
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-zinc-200">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="text-emerald-400 bg-muted/50 px-1 rounded text-[10px]">$1</code>');
}
