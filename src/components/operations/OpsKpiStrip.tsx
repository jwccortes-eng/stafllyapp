import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface OpsKpiItem {
  key: string;
  label: string;
  value: string | number;
  /** Optional sublabel — keep to 2-3 words ("vs ayer", "abiertos", etc.) */
  hint?: string;
  /** Operational tone — drives accent color, NOT severity */
  tone?: "neutral" | "primary" | "success" | "warning" | "critical" | "info";
  icon?: ReactNode;
  onClick?: () => void;
  /** Render a thin trend bar (0-100) below the value */
  trend?: number;
}

interface OpsKpiStripProps {
  items: OpsKpiItem[];
  className?: string;
  /** Density preset — "ops" is default, "compact" for embedded panels */
  density?: "ops" | "compact";
}

const toneRing: Record<NonNullable<OpsKpiItem["tone"]>, string> = {
  neutral: "ring-border",
  primary: "ring-primary/20",
  success: "ring-earning/25",
  warning: "ring-warning/30",
  critical: "ring-destructive/30",
  info: "ring-info/25",
};

const toneText: Record<NonNullable<OpsKpiItem["tone"]>, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-earning",
  warning: "text-warning",
  critical: "text-destructive",
  info: "text-info",
};

const toneBar: Record<NonNullable<OpsKpiItem["tone"]>, string> = {
  neutral: "bg-muted-foreground/40",
  primary: "bg-primary",
  success: "bg-earning",
  warning: "bg-warning",
  critical: "bg-destructive",
  info: "bg-info",
};

/**
 * OpsKpiStrip — high-density, command-center-style KPI strip.
 *
 * Differs from <KpiCard> by being:
 *  - Single horizontal row (no card chrome) → maximum scan speed
 *  - Subtle ring + uniform height → enterprise tone, no decoration
 *  - Optional trend bar instead of icon backgrounds
 *
 * Use at the top of operations pages (Shifts, Time Clock, Clients).
 * For dashboard cards or financial figures, prefer <KpiCard>.
 */
export function OpsKpiStrip({ items, className, density = "ops" }: OpsKpiStripProps) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {items.map((it) => {
        const tone = it.tone ?? "neutral";
        const interactive = !!it.onClick;
        return (
          <button
            type="button"
            key={it.key}
            onClick={it.onClick}
            disabled={!interactive}
            className={cn(
              "group relative rounded-xl bg-card text-left",
              "ring-1 transition-all duration-150",
              toneRing[tone],
              compact ? "px-3 py-2" : "px-3.5 py-2.5",
              interactive
                ? "hover:bg-muted/40 hover:ring-primary/30 active:scale-[0.99] cursor-pointer"
                : "cursor-default",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {it.label}
              </span>
              {it.icon && (
                <span className={cn("shrink-0 opacity-70", toneText[tone])}>{it.icon}</span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-bold font-heading tabular-nums leading-none",
                  compact ? "text-lg" : "text-xl",
                  toneText[tone],
                )}
              >
                {it.value}
              </span>
              {it.hint && (
                <span className="text-[10px] text-muted-foreground truncate">
                  {it.hint}
                </span>
              )}
            </div>
            {typeof it.trend === "number" && (
              <div className="mt-2 h-[3px] w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full", toneBar[tone])}
                  style={{ width: `${Math.max(0, Math.min(100, it.trend))}%` }}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
