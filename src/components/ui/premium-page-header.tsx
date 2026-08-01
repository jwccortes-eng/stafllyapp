import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { OperationalScreenHeader } from "@/components/stafly-ui/OperationalScreenHeader";
import { OX_MOTION, OX_SURFACE_SOFT } from "@/lib/ox/continuity";

/**
 * OX-8 — ONE STAFLY.
 *
 * `PremiumPageHeader` dejó de ser una cabecera distinta a `PageHeader`:
 * ambas renderizan la misma cabecera canónica. Aquí sólo sobrevive el
 * extra real (tira de métricas), con el ritmo y la profundidad únicos
 * del producto.
 */
export interface PremiumPageHeaderKpi {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "default" | "primary" | "success" | "warning" | "destructive";
  onClick?: () => void;
  active?: boolean;
}

interface PremiumPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** @deprecated OX-8: la identidad la da la empresa, no un icono de módulo. */
  icon?: LucideIcon;
  /** @deprecated OX-8. */
  eyebrow?: string;
  breadcrumb?: ReactNode;
  rightSlot?: ReactNode;
  kpis?: PremiumPageHeaderKpi[];
  className?: string;
}

const ACCENT_MAP: Record<NonNullable<PremiumPageHeaderKpi["accent"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function PremiumPageHeader({
  title,
  subtitle,
  breadcrumb,
  rightSlot,
  kpis,
  className,
}: PremiumPageHeaderProps) {
  return (
    <div className={cn("mb-4", className)}>
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}

      <OperationalScreenHeader
        title={title}
        context={subtitle}
        action={rightSlot}
      />

      {kpis && kpis.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k, i) => {
            const interactive = !!k.onClick;
            return (
              <button
                key={i}
                type="button"
                onClick={k.onClick}
                disabled={!interactive}
                className={cn(
                  OX_SURFACE_SOFT,
                  OX_MOTION,
                  "px-3 py-2.5 text-left",
                  interactive
                    ? "cursor-pointer hover:border-primary/40"
                    : "cursor-default",
                  k.active && "border-primary/50 bg-primary/[0.05]",
                )}
              >
                <div className="text-[12px] font-medium leading-4 text-muted-foreground">
                  {k.label}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-[24px] font-bold leading-7 tabular-nums tracking-tight",
                    ACCENT_MAP[k.accent ?? "default"],
                  )}
                >
                  {k.value}
                </div>
                {k.hint && (
                  <div className="mt-1 truncate text-[12px] leading-4 text-muted-foreground/80">
                    {k.hint}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
