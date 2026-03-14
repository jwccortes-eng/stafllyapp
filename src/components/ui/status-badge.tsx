import * as React from "react";
import { cn } from "@/lib/utils";

const STATUS_MAP = {
  confirmed: { label: "Confirmado", dotClass: "bg-[hsl(var(--status-confirmed))]", className: "status-confirmed" },
  active: { label: "Activo", dotClass: "bg-[hsl(var(--status-active))]", className: "status-active" },
  pending: { label: "Pendiente", dotClass: "bg-[hsl(var(--status-pending))]", className: "status-pending" },
  missing: { label: "Faltan trabajadores", dotClass: "bg-[hsl(var(--status-missing))]", className: "status-missing" },
  completed: { label: "Completado", dotClass: "bg-[hsl(var(--status-completed))]", className: "status-completed" },
  cancelled: { label: "Cancelado", dotClass: "bg-[hsl(var(--status-cancelled))]", className: "status-cancelled" },
} as const;

export type StatusKey = keyof typeof STATUS_MAP;

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusKey;
  label?: string;
  showDot?: boolean;
}

export function StatusBadge({ status, label, showDot = true, className: extraClass, ...props }: StatusBadgeProps) {
  const config = STATUS_MAP[status];
  if (!config) return null;

  return (
    <span className={cn(config.className, extraClass)} {...props}>
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dotClass)} />}
      {label ?? config.label}
    </span>
  );
}

export { STATUS_MAP };
