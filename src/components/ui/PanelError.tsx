import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelErrorProps {
  /** Error message to display. */
  message: string;
  /** Optional retry handler — renders a Retry button when provided. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Error-state placeholder for panel content. Shows an alert icon, message,
 * and optional retry button.
 */
export default function PanelError({
  message,
  onRetry,
  className,
}: PanelErrorProps) {
  return (
    <div
      data-component="panelError"
      className={cn("p-4 text-center", className)}
    >
      <AlertCircle className="h-5 w-5 text-zinc-500 mx-auto mb-2" />
      <p className="text-sm text-zinc-400">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      ) : null}
    </div>
  );
}
