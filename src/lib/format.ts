/**
 * Shared formatting helpers.
 *
 * Single source of truth — components must not reimplement these.
 */

/**
 * Human-readable relative time, e.g. 'Just now', '5m ago', '3h ago',
 * 'Yesterday', or a short '5 Jun' style date.
 *
 * Returns the input unchanged if it can't be parsed.
 */
export function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

/**
 * Compact time delta variant ('now', '5m', '3h', '2d') for tight UI
 * (timeline rows, mention chips). Same parse semantics as formatTimeAgo.
 */
export function formatTimeAgoShort(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffHours < 48) return "1d";
    return `${Math.floor(diffHours / 24)}d`;
  } catch {
    return dateStr;
  }
}

/**
 * Full GB date, e.g. '5 Jun 2026'. Returns input unchanged on parse error.
 */
export function formatGbDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Compact integer formatter, e.g. 1500 → '1.5k', 250 → '250'.
 */
export function formatCompactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
