/**
 * OX-4 — CoverageMeter: medidor de cobertura compartido por ShiftCard y TeamCard.
 * Color por familia semántica OX-2. Accesible vía role="progressbar".
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { MT } from "@/lib/mobile/mobile-scale";
import { OCS_ACCENT } from "./tokens";

export interface CoverageMeterProps {
  assigned: number;
  slots: number;
  label?: string;
  className?: string;
}

export function CoverageMeter({
  assigned,
  slots,
  label,
  className,
}: CoverageMeterProps) {
  const safeSlots = Math.max(slots, 1);
  const percent = Math.min(100, Math.round((assigned / safeSlots) * 100));
  const family =
    assigned >= slots ? "positive" : assigned === 0 ? "critical" : "warning";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Cobertura ${assigned} de ${slots}`}
        className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden"
      >
        <div
          className={cn("h-full rounded-full transition-all", OCS_ACCENT[family])}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={cn(MT.caption, "tabular-nums font-medium shrink-0")}>
        {assigned}/{slots}
      </span>
    </div>
  );
}
