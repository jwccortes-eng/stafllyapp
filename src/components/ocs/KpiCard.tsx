/**
 * OX-4 — KpiCard.
 * Responde: "¿Qué significa este indicador?"
 *
 * Contrato: nunca un número sin contexto. `meaning` es obligatorio.
 * Soporta estados de carga, error (con reintento) y vacío explicado (OX-1).
 */
import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT, TAP, FOCUS_RING } from "@/lib/mobile/mobile-scale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { StatusKey } from "@/lib/status/status-registry";
import { presentMetric, type MetricState } from "@/lib/ox/metric-state";


export interface KpiCardProps {
  /** Nombre del indicador. */
  label: string;
  /** Valor ya formateado. Ignorado si se pasa `state`. */
  value?: React.ReactNode;
  /** Unidad del valor: "turnos", "horas", "workers". */
  unit?: string;
  /** Qué significa el número para la operación. Obligatorio salvo con `state`. */
  meaning?: string;
  /** Qué pasa si no se atiende. Se muestra bajo el significado. */
  consequence?: string | null;
  /**
   * OX-4.5 — Estado semántico de la métrica. Cuando se pasa, resuelve valor,
   * unidad, contexto, estado y consecuencia. Elimina el cero silencioso.
   */
  state?: MetricState;
  /** Comparación: "+12% vs semana pasada". */
  trendLabel?: string | null;
  trend?: "up" | "down" | "flat";
  /** `up` bueno o malo según el indicador. */
  trendIsPositive?: boolean;
  status?: StatusKey | (string & {});
  statusLabel?: string;
  loading?: boolean;
  /** Mensaje de error; nunca se muestra un cero silencioso. */
  error?: string | null;
  onRetry?: () => void;
  /** Texto cuando no hay datos (no equivale a cero). */
  emptyLabel?: string;
  isEmpty?: boolean;
  action?: OcsAction;
  onClick?: () => void;
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}


const TREND_ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
} as const;

export function KpiCard({
  label,
  value,
  unit,
  meaning,
  consequence,
  state,
  trendLabel,
  trend = "flat",
  trendIsPositive = true,
  status,
  statusLabel,
  loading,
  error,
  onRetry,
  emptyLabel = "Sin datos en este periodo",
  isEmpty,
  action,
  onClick,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  className,
}: KpiCardProps) {
  const TrendIcon = TREND_ICON[trend];

  // El estado semántico manda: resuelve valor, unidad, estado y consecuencia.
  const p = state ? presentMetric(state, { consequence }) : null;

  const rLoading = p ? p.loading : !!loading;
  const rError = p ? p.error : error ?? null;
  const rEmpty = p ? p.isEmpty : !!isEmpty;
  const rEmptyLabel = p ? p.emptyLabel : emptyLabel;
  const rMeaning = p ? p.meaning : meaning ?? "";
  const rConsequence = p ? p.consequence : consequence ?? null;
  const rStatus = p ? p.statusKey : status;
  const rStatusLabel = p ? p.statusLabel : statusLabel;
  const rValue = p ? p.displayValue : value;
  const rUnit = p ? null : unit;

  const body = rLoading ? (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-3 w-40" />
    </div>
  ) : rError ? (
    <div className="space-y-2">
      <p className={cn(MT.body, "text-status-danger")}>{rError}</p>
      {onRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className={cn(TAP, FOCUS_RING, MT.body, "rounded-xl")}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Reintentar
        </Button>
      )}
    </div>
  ) : rEmpty ? (
    <p className={cn(MT.body, "text-muted-foreground")}>{rEmptyLabel}</p>
  ) : (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className={MT.metric}>{rValue}</span>
      {rUnit && (
        <span className={cn(MT.caption, "text-muted-foreground")}>{rUnit}</span>
      )}
      {trendLabel && (
        <span
          className={cn(
            MT.caption,
            "inline-flex items-center gap-1",
            trend === "flat"
              ? "text-muted-foreground"
              : trendIsPositive === (trend === "up")
              ? "text-status-success"
              : "text-status-danger"
          )}
        >
          <TrendIcon className="h-3 w-3" aria-hidden />
          {trendLabel}
        </span>
      )}
    </div>
  );

  const meaningBlock =
    rLoading || rError ? undefined : (
      <span className="block space-y-0.5">
        <span className="block">{rMeaning}</span>
        {rConsequence && (
          <span className="block text-status-warning">{rConsequence}</span>
        )}
      </span>
    );

  return (
    <OperationalCard
      status={rStatus}
      statusLabel={rStatusLabel}
      title={label}
      primary={body}
      secondary={meaningBlock}
      action={action}
      onClick={onClick}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`Indicador ${label}`}
    />
  );
}

