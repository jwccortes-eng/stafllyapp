import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type OpsStatusTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "critical"
  | "info"
  | "muted";

interface OpsStatusChipProps {
  label: string;
  tone?: OpsStatusTone;
  /** Optional dot / icon on the leading edge */
  leading?: ReactNode;
  /** Subtle pulsing dot — for "live" or "in progress" states */
  pulse?: boolean;
  className?: string;
  /** Visual size — sm for tables, md default, lg for hero usage */
  size?: "sm" | "md" | "lg";
}

// Sober, enterprise-grade tones — low chroma surfaces, strong-contrast text.
// Uses ~6% surface fill + 15% border + full text colour for a flat, premium feel.
const toneClasses: Record<OpsStatusTone, string> = {
  neutral: "bg-muted/60 text-foreground/80 border-border/60",
  primary: "bg-primary/[0.08] text-primary border-primary/15",
  success: "bg-earning/[0.08] text-earning border-earning/20",
  warning: "bg-warning/[0.08] text-warning border-warning/20",
  critical: "bg-destructive/[0.08] text-destructive border-destructive/20",
  info: "bg-info/[0.08] text-info border-info/20",
  muted: "bg-muted/40 text-muted-foreground border-border/40",
};

const dotTone: Record<OpsStatusTone, string> = {
  neutral: "bg-foreground/50",
  primary: "bg-primary",
  success: "bg-earning",
  warning: "bg-warning",
  critical: "bg-destructive",
  info: "bg-info",
  muted: "bg-muted-foreground/50",
};

// Slightly tighter type — premium, less shouty.
const sizeClasses = {
  sm: "h-[18px] px-1.5 text-[10px] gap-1 tracking-normal",
  md: "h-[22px] px-2 text-[10.5px] gap-1.5 tracking-normal",
  lg: "h-6 px-2.5 text-[11px] gap-1.5 tracking-normal",
};

/**
 * OpsStatusChip — single source of truth for operational state badges.
 *
 * Replaces ad-hoc <Badge variant="outline" className="..."/> usages
 * across Shifts, Time Clock and Clients. Use a consistent `tone`
 * vocabulary so users learn the color language across the module.
 */
export function OpsStatusChip({
  label,
  tone = "neutral",
  leading,
  pulse,
  className,
  size = "md",
}: OpsStatusChipProps) {
  return (
    <span
      className={cn(
        // Premium pill: flat surface, 1px hairline border, medium-weight non-uppercase label.
        "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
    >
      {leading ?? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            dotTone[tone],
            pulse && "animate-pulse",
          )}
        />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
