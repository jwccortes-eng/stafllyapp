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
  /** Right-align value and use monospace font — ideal for currency */
  mono?: boolean;
  /** Visual size: sm (count chips), md (default), lg (hero financials) */
  size?: "sm" | "md" | "lg";
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

const sizeStyles = {
  sm: { card: "p-2.5", value: "text-lg", label: "text-[10px]" },
  md: { card: "p-4", value: "text-2xl", label: "text-xs" },
  lg: { card: "p-4", value: "text-xl sm:text-2xl", label: "text-xs" },
};

export function KpiCard({ value, label, icon, accent = "muted", subtitle, onClick, className, mono, size = "md" }: KpiCardProps) {
  const s = sizeStyles[size];
  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-200 min-w-0",
        s.card,
        accentStyles[accent],
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.98]",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-bold font-heading tabular-nums leading-tight",
              s.value,
              valueColors[accent],
              mono && "font-mono text-right",
              size === "lg" && "break-all"
            )}
            title={String(value)}
          >
            {value}
          </p>
          <p className={cn("text-muted-foreground mt-0.5 truncate", s.label, mono && "text-right")}>{label}</p>
          {subtitle && (
            <p className={cn("text-[10px] text-muted-foreground/70 mt-0.5 truncate", mono && "text-right")}>{subtitle}</p>
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
