import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextButton } from "./ActionButton";

/** Standard panel footer strip. */
export function PanelFooter({
  align = "between",
  className,
  children,
}: {
  align?: "between" | "center";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-component="panelFooter"
      className={cn(
        "px-3 py-1.5 border-t border-border/50 flex items-center text-[0.611rem] text-zinc-600",
        align === "between" ? "justify-between" : "justify-center",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Footer with an 'Updated …' label and optional refresh action. */
export function UpdatedFooter({
  label,
  onRefresh,
  refreshIcon: Icon = RefreshCw,
}: {
  label: React.ReactNode;
  onRefresh?: () => void;
  refreshIcon?: LucideIcon;
}) {
  return (
    <PanelFooter>
      <span>{label}</span>
      {onRefresh ? (
        <TextButton onClick={onRefresh} icon={Icon}>
          Refresh
        </TextButton>
      ) : null}
    </PanelFooter>
  );
}

/** Centred micro source/attribution note. */
export function SourceNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-component="sourceNote"
      className={cn("text-[0.556rem] text-zinc-700 text-center", className)}
    >
      {children}
    </div>
  );
}
