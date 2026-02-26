import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Clock, Lock, Wallet } from "lucide-react";

interface PeriodInfo {
  label: string;
  count: number;
  icon: typeof Clock;
  dotColor: string;
  bgColor: string;
  textColor: string;
}

interface PeriodStatusBannerProps {
  open: number;
  closed: number;
  published: number;
  paid?: number;
  overdueCount?: number;
  overdueDays?: number;
  onOverdueClick?: () => void;
  className?: string;
}

export function PeriodStatusBanner({
  open,
  closed,
  published,
  paid = 0,
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
    {
      label: "Pagado",
      count: paid,
      icon: Wallet,
      dotColor: "bg-earning",
      bgColor: "bg-earning/5",
      textColor: "text-earning",
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Period status pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {periods.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.label}
              className={cn(
                "rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-all hover-lift",
                p.bgColor,
                "border-transparent"
              )}
            >
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", p.bgColor)}>
                <Icon className={cn("h-4 w-4", p.textColor)} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-lg font-bold font-heading tabular-nums leading-none", p.textColor)}>
                  {p.count}
                </p>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
                  {p.label}{p.count !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div
          className={cn(
            "rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 flex items-center gap-3 animate-fade-in",
            onOverdueClick && "cursor-pointer hover:bg-destructive/10 transition-colors press-scale"
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
            <span className="text-xs font-medium text-destructive/80 whitespace-nowrap">Ver →</span>
          )}
        </div>
      )}
    </div>
  );
}
