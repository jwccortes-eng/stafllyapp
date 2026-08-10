/**
 * ENTITY ROW — variante de planificación del Unified Entity Design System.
 *
 * No reemplaza a EntityCard: comparte identidad visual (avatar con anillo de
 * estado, referencia de pasaporte) pero está pensada para ser el índice
 * izquierdo de un scheduler.
 *
 * REGLAS DURAS
 *  - Una sola línea de identidad: Nombre · (Rol · REF).
 *  - Nunca correo, nunca badges largos, nunca información administrativa.
 *  - Ancho fijo controlado por el contenedor (280px desktop / 200px tablet).
 *  - Componente de presentación puro: no lee datos, no muta nada.
 */

import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getEntityStatusColor, type EntityStatusTone } from "@/lib/entities/entity-identity";

export interface EntityRowProps {
  /** Avatar ya renderizado por el dominio (worker, cliente, venue…). */
  avatar: ReactNode;
  name: string;
  /** Rol operativo. Opcional. */
  role?: string | null;
  /** Referencia de pasaporte (ST-00101, CL-00084…). */
  reference?: string | null;
  /** Métrica ligera opcional (p. ej. "12:30 h"). */
  metric?: string | null;
  /** Tono del anillo de estado. */
  tone?: EntityStatusTone | null;
  /** Acento de identidad (color del Cliente). NUNCA representa estado. */
  accentColor?: string | null;

  /** Contenido del tooltip de hover (resumen operativo). */
  hover?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

function EntityRowImpl({
  avatar,
  name,
  role,
  reference,
  metric,
  tone,
  accentColor,
  hover,
  selected,
  onClick,
  className,
}: EntityRowProps) {
  const status = getEntityStatusColor(tone);

  const body = (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "relative flex h-full w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
        onClick && "cursor-pointer",
        selected ? "bg-primary/[0.07]" : "hover:bg-accent/40",
        className,
      )}
    >
      {accentColor ? (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-[3px] rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      ) : null}

      <span className={cn("shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-background", status.ring)}>
        {avatar}
      </span>


      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight text-foreground">
          {name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
          {[role, reference].filter(Boolean).join(" · ") || "—"}
        </span>
      </span>

      {metric ? (
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          {metric}
        </span>
      ) : null}
    </div>
  );

  if (!hover) return body;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="right" align="center" className="max-w-[220px]">
        {hover}
      </TooltipContent>
    </Tooltip>
  );
}

export const EntityRow = memo(EntityRowImpl);
