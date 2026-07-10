import { cn } from "@/lib/utils";

/**
 * Line-based markdown-lite renderer — h1/h2/h3, horizontal rules, bullets,
 * blockquotes and inline bold/italic/code. Extracted from AIBrief so other
 * panels can render model output the same way.
 */
export default function MarkdownLite({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div data-component="markdownLite" className={cn(className)}>
      {source.split("\n").map((line, i) => {
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
  );
}

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
