import { CheckCircle2, AlertCircle, ShieldAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

/**
 * ReadinessBadge — visual layer over the readiness layer.
 *
 * Bands (deterministic from progressPct + blocking flags):
 *   - ready             : 90 ≤ pct ≤ 100  AND  no blocking gaps
 *   - needs-attention   : 50 ≤ pct < 90   OR   minor gaps (e.g. missing photo)
 *   - blocked           : pct < 50        OR   missing required docs / portal blocked
 *
 * This is a pure presentation component — the calling code owns the data.
 * Designed to slot into PremiumAvatar `cornerBadge`, table cells, profile hero, etc.
 */

export type ReadinessBand = "ready" | "needs-attention" | "blocked" | "unknown";

interface ReadinessInputs {
  progressPct: number; // 0..100
  missingDocsCount: number;
  missingPersonalCount: number;
  portalActive?: boolean;
  hasPhoto?: boolean;
  loading?: boolean;
}

export function deriveReadinessBand({
  progressPct,
  missingDocsCount,
  missingPersonalCount,
  portalActive,
}: ReadinessInputs): ReadinessBand {
  if (missingDocsCount > 0 || progressPct < 50 || portalActive === false) {
    return "blocked";
  }
  if (progressPct >= 90 && missingPersonalCount === 0) return "ready";
  return "needs-attention";
}

const BAND_META: Record<ReadinessBand, {
  label: string;
  Icon: typeof CheckCircle2;
  pillClass: string;
  dotClass: string;
}> = {
  ready: {
    label: "Ready",
    Icon: CheckCircle2,
    pillClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    dotClass: "bg-emerald-500",
  },
  "needs-attention": {
    label: "Needs attention",
    Icon: AlertCircle,
    pillClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dotClass: "bg-amber-500",
  },
  blocked: {
    label: "Blocked",
    Icon: ShieldAlert,
    pillClass: "bg-destructive/10 text-destructive border-destructive/20",
    dotClass: "bg-destructive",
  },
  unknown: {
    label: "Unknown",
    Icon: AlertCircle,
    pillClass: "bg-muted text-muted-foreground border-border",
    dotClass: "bg-muted-foreground/40",
  },
};

interface ReadinessBadgeProps {
  band: ReadinessBand;
  /** Tiny dot variant for tight spaces (e.g. avatar corner). */
  variant?: "pill" | "dot" | "icon";
  size?: "sm" | "md";
  loading?: boolean;
  tooltip?: ReactNode;
  className?: string;
  showLabel?: boolean;
}

export function ReadinessBadge({
  band,
  variant = "pill",
  size = "sm",
  loading,
  tooltip,
  className,
  showLabel = true,
}: ReadinessBadgeProps) {
  const meta = BAND_META[band];
  const Icon = meta.Icon;

  let node: ReactNode;
  if (loading) {
    node = (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border bg-muted/40 text-muted-foreground",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
          className,
        )}
        aria-label="Loading readiness"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {showLabel && variant === "pill" && "…"}
      </span>
    );
  } else if (variant === "dot") {
    node = (
      <span
        className={cn(
          "inline-block rounded-full ring-2 ring-background",
          size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5",
          meta.dotClass,
          className,
        )}
        aria-label={meta.label}
      />
    );
  } else if (variant === "icon") {
    node = (
      <Icon
        className={cn(
          size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
          band === "ready" && "text-emerald-600 dark:text-emerald-400",
          band === "needs-attention" && "text-amber-600 dark:text-amber-400",
          band === "blocked" && "text-destructive",
          band === "unknown" && "text-muted-foreground",
          className,
        )}
        aria-label={meta.label}
      />
    );
  } else {
    node = (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-medium",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
          meta.pillClass,
          className,
        )}
      >
        <Icon className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
        {showLabel && meta.label}
      </span>
    );
  }

  if (!tooltip) return node;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span>{node}</span></TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
