import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface KpiCardProps {
  value: string | number;
  label: string;
  icon?: ReactNode;
  accent?: "primary" | "earning" | "deduction" | "warning" | "muted";
  subtitle?: string;
  onClick?: () => void;
  className?: string;
}

const accentStyles = {
  primary: "border-primary/15 bg-primary/[0.04]",
  earning: "border-earning/15 bg-earning/[0.04]",
  deduction: "border-deduction/15 bg-deduction/[0.04]",
  warning: "border-warning/15 bg-warning/[0.04]",
  muted: "border-border/50 bg-surface-2",
};

const valueColors = {
  primary: "text-primary",
  earning: "text-earning",
  deduction: "text-deduction",
  warning: "text-warning",
  muted: "text-foreground",
};

export function KpiCard({ value, label, icon, accent = "muted", subtitle, onClick, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-all duration-200",
        accentStyles[accent],
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.98]",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("text-2xl font-bold font-heading tabular-nums", valueColors[accent])}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{label}</p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={cn("shrink-0 rounded-lg p-2", accentStyles[accent])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
