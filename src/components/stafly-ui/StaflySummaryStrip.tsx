/**
 * StaflySummaryStrip — cabecera de resumen canónica (strip de KPIs).
 *
 * Desktop/iPad: rejilla. Móvil: scroll horizontal con el mismo card.
 * Misma jerarquía visual, solo cambia el acomodo.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StaflyKpiCard, type StaflyKpiCardProps } from "./StaflyKpiCard";

export interface StaflySummaryStripProps {
  items: (StaflyKpiCardProps & { id: string })[];
  className?: string;
  /** Columnas en desktop (por defecto se ajusta al número de métricas, máx. 4). */
  columns?: 2 | 3 | 4;
  children?: ReactNode;
}

const COLUMN_CLASSES: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

export function StaflySummaryStrip({
  items,
  className,
  columns,
  children,
}: StaflySummaryStripProps) {
  if (items.length === 0) return null;
  const cols = columns ?? (Math.min(Math.max(items.length, 2), 4) as 2 | 3 | 4);

  return (
    <div
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none",
        "sm:mx-0 sm:grid sm:gap-3 sm:overflow-visible sm:px-0",
        COLUMN_CLASSES[cols],
        className
      )}
    >
      {items.map(({ id, ...kpi }) => (
        <StaflyKpiCard key={id} {...kpi} className={cn("w-[42vw] shrink-0 sm:w-auto", kpi.className)} />
      ))}
      {children}
    </div>
  );
}
