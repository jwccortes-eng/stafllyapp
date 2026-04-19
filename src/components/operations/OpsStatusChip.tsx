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

const toneClasses: Record<OpsStatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/10 text-primary border-primary/20",
  success: "bg-earning/10 text-earning border-earning/20",
  warning: "bg-warning/12 text-warning border-warning/25",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/20",
  muted: "bg-muted/50 text-muted-foreground border-transparent",
};

const dotTone: Record<OpsStatusTone, string> = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-earning",
  warning: "bg-warning",
  critical: "bg-destructive",
  info: "bg-info",
  muted: "bg-muted-foreground/60",
};

const sizeClasses = {
  sm: "h-5 px-1.5 text-[10px] gap-1",
  md: "h-6 px-2 text-[11px] gap-1.5",
  lg: "h-7 px-2.5 text-xs gap-1.5",
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
        "inline-flex items-center rounded-full border font-medium uppercase tracking-wide whitespace-nowrap",
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
