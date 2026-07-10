import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelEmptyProps {
  /** Optional icon component (lucide). */
  icon?: LucideIcon;
  /** Primary message — short, sentence-case. */
  title: string;
  /** Optional supporting description. */
  description?: string;
  /** Optional action node (e.g. a link or button). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Empty-state placeholder for panel content (no data, not yet configured, etc.).
 *
 * Centered icon + title + optional description + optional action.
 */
export default function PanelEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: PanelEmptyProps) {
  return (
    <div
      data-component="panelEmpty"
      className={cn("p-6 text-center", className)}
    >
      {Icon ? (
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted mb-3">
          <Icon className="h-5 w-5 text-zinc-500" />
        </div>
      ) : null}
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      {description ? (
        <p className="text-xs text-zinc-600 mt-1.5 max-w-[15.556rem] mx-auto">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
