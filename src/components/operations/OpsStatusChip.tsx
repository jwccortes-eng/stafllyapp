import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  FAMILY_CLASSES,
  FAMILY_DOT_CLASSES,
  type StatusFamily,
} from "@/lib/status/status-registry";


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

// OX-2 — sin mapas cromáticos propios: delega en las familias semánticas canónicas.
const TONE_FAMILY: Record<OpsStatusTone, StatusFamily> = {
  neutral: "neutral",
  primary: "progress",
  success: "positive",
  warning: "warning",
  critical: "critical",
  info: "progress",
  muted: "neutral",
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
        FAMILY_CLASSES[TONE_FAMILY[tone]],
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
