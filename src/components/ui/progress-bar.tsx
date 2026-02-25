import { cn } from "@/lib/utils";

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  accent?: "primary" | "earning" | "deduction" | "warning";
  showCount?: boolean;
  className?: string;
}

const barColors = {
  primary: "bg-primary",
  earning: "bg-earning",
  deduction: "bg-deduction",
  warning: "bg-warning",
};

const bgColors = {
  primary: "bg-primary/10",
  earning: "bg-earning/10",
  deduction: "bg-deduction/10",
  warning: "bg-warning/10",
};

const textColors = {
  primary: "text-primary",
  earning: "text-earning",
  deduction: "text-deduction",
  warning: "text-warning",
};

export function ProgressBar({ current, total, label, accent = "earning", showCount = true, className }: ProgressBarProps) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  return (
    <div className={cn("rounded-lg border px-4 py-3", bgColors[accent], className)}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {showCount && (
            <span className={cn("text-lg font-bold font-heading tabular-nums", textColors[accent])}>
              {current}
            </span>
          )}
          <span className="text-xs text-muted-foreground">/{total}</span>
          {label && <span className={cn("text-xs font-medium", textColors[accent])}>{label}</span>}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", barColors[accent])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
