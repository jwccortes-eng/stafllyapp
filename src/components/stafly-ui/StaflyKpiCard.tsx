/**
 * StaflyKpiCard — tarjeta de métrica canónica.
 *
 * Misma jerarquía en Desktop / iPad / iPhone: valor → etiqueta → contexto.
 * En móvil se usa dentro de un strip con scroll horizontal; no cambia el diseño,
 * solo el acomodo.
 */

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  STAFLY_CARD_BASE,
  STAFLY_STATE,
  STAFLY_TEXT,
  STAFLY_TONE_TEXT,
  type StaflyTone,
} from "./tokens";

export interface StaflyKpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StaflyTone;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export function StaflyKpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  onClick,
  active,
  className,
}: StaflyKpiCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        STAFLY_CARD_BASE,
        "min-w-0 p-3 text-left",
        onClick && cn(STAFLY_STATE.interactive, STAFLY_STATE.focus, "cursor-pointer"),
        active && "border-primary/40 bg-primary/[0.04]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn(STAFLY_TEXT.metric, STAFLY_TONE_TEXT[tone])}>{value}</p>
        {Icon && <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", STAFLY_TONE_TEXT[tone])} />}
      </div>
      <p className={cn(STAFLY_TEXT.meta, "mt-1.5 truncate")}>{label}</p>
      {hint && (
        <p className="text-[11px] text-muted-foreground/70 truncate">{hint}</p>
      )}
    </Tag>
  );
}
