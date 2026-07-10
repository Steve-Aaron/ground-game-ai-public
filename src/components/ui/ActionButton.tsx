import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Emerald pill action button — the primary in-panel action (submit, add,
 * upload, track). Replaces the copy-pasted emerald pill markup.
 */
export function ActionButton({
  icon: Icon,
  size = "md",
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  size?: "sm" | "md";
}) {
  return (
    <button
      data-component="actionButton"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-[0.611rem] uppercase tracking-wider font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1" : "px-4 py-1.5",
        className
      )}
      {...rest}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}

/**
 * Borderless emerald text button — secondary inline actions (refresh links,
 * view-more).
 */
export function TextButton({
  icon: Icon,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon }) {
  return (
    <button
      data-component="textButton"
      className={cn(
        "text-emerald-500/70 hover:text-emerald-400 flex items-center gap-1 transition-colors",
        className
      )}
      {...rest}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}
