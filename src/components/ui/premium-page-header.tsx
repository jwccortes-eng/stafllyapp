import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * PremiumPageHeader — premium-gold module header.
 *
 * Pieces (all optional):
 *  - eyebrow            : tiny uppercase label above the title
 *  - breadcrumb         : slot for breadcrumb / context badges (left aligned, above title)
 *  - icon + title       : main identity
 *  - subtitle           : one-line context
 *  - rightSlot          : primary action(s) on the right
 *  - kpis               : optional KPI strip rendered below the header
 */

export interface PremiumPageHeaderKpi {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Optional accent for the value (semantic class string). */
  accent?: "default" | "primary" | "success" | "warning" | "destructive";
  onClick?: () => void;
  active?: boolean;
}

interface PremiumPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  eyebrow?: string;
  breadcrumb?: ReactNode;
  rightSlot?: ReactNode;
  kpis?: PremiumPageHeaderKpi[];
  className?: string;
}

const ACCENT_MAP: Record<NonNullable<PremiumPageHeaderKpi["accent"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
};

export function PremiumPageHeader({
  title,
  subtitle,
  icon: Icon,
  eyebrow,
  breadcrumb,
  rightSlot,
  kpis,
  className,
}: PremiumPageHeaderProps) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
          {eyebrow && (
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1.5">
              {eyebrow}
            </p>
          )}
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/[0.08]">
                <Icon className="h-[18px] w-[18px] md:h-5 md:w-5 text-primary" strokeWidth={2} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold font-heading tracking-tight text-foreground leading-tight">
                {title}
              </h1>
              {subtitle && (
                <div className="text-xs md:text-sm text-muted-foreground mt-0.5 leading-relaxed">
                  {subtitle}
                </div>
              )}
            </div>
          </div>
        </div>
        {rightSlot && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">{rightSlot}</div>
        )}
      </div>

      {kpis && kpis.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {kpis.map((k, i) => {
            const interactive = !!k.onClick;
            return (
              <button
                key={i}
                type="button"
                onClick={k.onClick}
                disabled={!interactive}
                className={cn(
                  "text-left rounded-xl border bg-card/60 px-3 py-2.5 transition-all",
                  interactive
                    ? "hover:border-primary/40 hover:shadow-sm cursor-pointer"
                    : "cursor-default",
                  k.active
                    ? "border-primary/50 bg-primary/[0.04] shadow-sm"
                    : "border-border/50",
                )}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-xl font-bold tabular-nums leading-none",
                    ACCENT_MAP[k.accent ?? "default"],
                  )}
                >
                  {k.value}
                </div>
                {k.hint && (
                  <div className="mt-1 text-[10px] text-muted-foreground/80 truncate">{k.hint}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
