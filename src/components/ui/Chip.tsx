import { cn } from "@/lib/utils";

const TONES = {
  muted: "text-zinc-500 bg-muted border border-transparent",
  emerald: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  amber: "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  outline: "text-foreground bg-muted/50 border border-border",
} as const;

/**
 * Micro chip/badge. `tag` = square micro-label (kind/category chips),
 * `pill` = rounded-full (handle chips).
 */
export function Chip({
  tone = "muted",
  shape = "tag",
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  shape?: "tag" | "pill";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-component="chip"
      className={cn(
        "inline-flex items-center gap-1",
        shape === "pill"
          ? "px-2 py-0.5 rounded-full text-[0.611rem]"
          : "px-1.5 py-0.5 text-[0.5rem] uppercase tracking-wider",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
