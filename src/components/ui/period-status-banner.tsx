import { cn } from "@/lib/utils";
import { CalendarDays, AlertTriangle, CheckCircle2, Clock, Lock } from "lucide-react";

interface PeriodInfo {
  label: string;
  count: number;
  icon: typeof CalendarDays;
  dotColor: string;
  bgColor: string;
  textColor: string;
}

interface PeriodStatusBannerProps {
  open: number;
  closed: number;
  published: number;
  overdueCount?: number;
  overdueDays?: number;
  onOverdueClick?: () => void;
  className?: string;
}

export function PeriodStatusBanner({
  open,
  closed,
  published,
  overdueCount = 0,
  overdueDays,
  onOverdueClick,
  className,
}: PeriodStatusBannerProps) {
  const periods: PeriodInfo[] = [
    {
      label: "Abierto",
      count: open,
      icon: Clock,
      dotColor: "bg-earning",
      bgColor: "bg-earning/10",
      textColor: "text-earning",
    },
    {
      label: "Cerrado",
      count: closed,
      icon: Lock,
      dotColor: "bg-warning",
      bgColor: "bg-warning/10",
      textColor: "text-warning",
    },
    {
      label: "Publicado",
      count: published,
      icon: CheckCircle2,
      dotColor: "bg-primary",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Period status pills */}
      <div className="grid grid-cols-3 gap-2">
        {periods.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.label}
              className={cn(
                "rounded-xl border px-3 py-2.5 flex flex-col items-center gap-1.5 transition-all",
                p.bgColor,
                "border-transparent"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full shrink-0", p.dotColor)} />
                <Icon className={cn("h-3.5 w-3.5", p.textColor)} />
              </div>
              <p className={cn("text-lg font-bold font-heading tabular-nums leading-none", p.textColor)}>
                {p.count}
              </p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {p.label}{p.count !== 1 ? "s" : ""}
              </p>
            </div>
          );
        })}
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div
          className={cn(
            "rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 flex items-center gap-3",
            onOverdueClick && "cursor-pointer hover:bg-destructive/10 transition-colors"
          )}
          onClick={onOverdueClick}
        >
          <div className="h-9 w-9 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">
              {overdueCount} periodo{overdueCount !== 1 ? "s" : ""} con atraso
            </p>
            {overdueDays !== undefined && (
              <p className="text-xs text-destructive/70 mt-0.5">
                Hasta {overdueDays} día{overdueDays !== 1 ? "s" : ""} de retraso
              </p>
            )}
          </div>
          {onOverdueClick && (
            <span className="text-xs font-medium text-destructive/80">Ver →</span>
          )}
        </div>
      )}
    </div>
  );
}
