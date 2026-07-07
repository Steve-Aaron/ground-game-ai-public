import { cn } from "@/lib/utils";

interface SectionLabelProps {
  children: React.ReactNode;
  /** Render size — defaults to 'xs' (~0.556rem). 'sm' is ~0.611rem. */
  size?: "xs" | "sm";
  className?: string;
}

/**
 * Tiny uppercase section label, e.g. 'BAND DISTRIBUTION', 'TOP PETITIONS'.
 *
 * Centralises the repeated `text-[0.556rem] text-zinc-500 uppercase
 * tracking-wider` pattern that appeared 40+ times across panels.
 */
export default function SectionLabel({
  children,
  size = "xs",
  className,
}: SectionLabelProps) {
  return (
    <div
      data-component="sectionLabel"
      className={cn(
        "text-zinc-500 uppercase tracking-wider",
        size === "xs" ? "text-[0.556rem]" : "text-[0.611rem]",
        className
      )}
    >
      {children}
    </div>
  );
}
