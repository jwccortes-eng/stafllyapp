import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CARD_SURFACE,
  MOBILE_PAGE_PX,
  TXT_KPI,
  TXT_LABEL,
} from "./mobile-admin-tokens";

export interface MobileMetric {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
}

const TONE_CLASS: Record<NonNullable<MobileMetric["tone"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
};

interface MobileSummaryStripProps {
  metrics: MobileMetric[];
  /** 2 | 3 | 4 columns. Default auto: 2 if ≤2, 4 if ==4, else 3. */
  columns?: 2 | 3 | 4;
  className?: string;
}

export function MobileSummaryStrip({
  metrics,
  columns,
  className,
}: MobileSummaryStripProps) {
  const cols = columns ?? (metrics.length <= 2 ? 2 : metrics.length === 4 ? 2 : 3);
  const gridClass =
    cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";

  return (
    <div className={cn(MOBILE_PAGE_PX, className)}>
      <div className={cn("grid gap-2.5", gridClass)}>
        {metrics.map((m, i) => (
          <MobileMetricCard key={i} metric={m} />
        ))}
      </div>
    </div>
  );
}

export function MobileMetricCard({ metric }: { metric: MobileMetric }) {
  return (
    <div className={cn(CARD_SURFACE, "p-3")}>
      <div className={cn(TXT_LABEL, "leading-tight")}>{metric.label}</div>
      <div className={cn(TXT_KPI, "mt-1.5 leading-none", TONE_CLASS[metric.tone ?? "default"])}>
        {metric.value}
      </div>
      {metric.hint && (
        <div className="text-[11px] text-muted-foreground mt-1 truncate">
          {metric.hint}
        </div>
      )}
    </div>
  );
}
