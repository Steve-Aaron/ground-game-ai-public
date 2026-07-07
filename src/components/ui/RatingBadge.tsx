import { cn } from "@/lib/utils";

export interface RatingStyle {
  /** Tailwind background class (e.g. 'bg-emerald-500/20'). */
  bg: string;
  /** Tailwind text class (e.g. 'text-emerald-400'). */
  text: string;
  /** Optional display label override (defaults to the raw rating string). */
  label?: string;
}

interface RatingBadgeProps {
  /** The rating value, looked up in `config`. */
  rating: string;
  /** Lookup map keyed by rating. Unknown ratings fall back to a neutral pill. */
  config: Record<string, RatingStyle>;
  /** Size variant. Defaults to 'sm'. */
  size?: "xs" | "sm";
  className?: string;
}

const FALLBACK: RatingStyle = {
  bg: "bg-zinc-700/30",
  text: "text-zinc-400",
};

/**
 * Config-driven coloured pill — used for Ofsted / CQC / Health significance /
 * EPC band style status tags.
 */
export default function RatingBadge({
  rating,
  config,
  size = "sm",
  className,
}: RatingBadgeProps) {
  const style = config[rating] ?? FALLBACK;
  const label = style.label ?? rating ?? "Not rated";
  return (
    <span
      data-component="ratingBadge"
      className={cn(
        "inline-flex items-center font-medium rounded-full",
        size === "xs"
          ? "text-[0.5rem] px-1.5 py-0.5"
          : "text-[0.556rem] px-2 py-0.5",
        style.bg,
        style.text,
        className
      )}
    >
      {label}
    </span>
  );
}
