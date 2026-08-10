/**
 * ServicePreparationMeter — expresión visual ÚNICA de la preparación (0–100)
 * de un Servicio. UI-only, sin datos propios: consume `getServicePreparation`.
 *
 * Nunca usa rojo para un borrador: un evento en construcción no es un error.
 */
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { PreparationBand, ServicePreparation } from "@/lib/shifts/service-preparation";

const BAND_TONE: Record<PreparationBand, { bar: string; text: string; dot: string }> = {
  ready: { bar: "bg-earning", text: "text-earning", dot: "bg-earning" },
  attention: { bar: "bg-warning", text: "text-warning", dot: "bg-warning" },
  later: { bar: "bg-primary/70", text: "text-primary", dot: "bg-primary/70" },
  closed: { bar: "bg-muted-foreground/40", text: "text-muted-foreground", dot: "bg-muted-foreground/40" },
};

export function PreparationDot({
  preparation,
  className,
}: {
  preparation: ServicePreparation;
  className?: string;
}) {
  return (
    <span
      aria-label={`Preparación ${preparation.score}% · ${preparation.bandLabel}`}
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        BAND_TONE[preparation.band].dot,
        className,
      )}
    />
  );
}

interface Props {
  preparation: ServicePreparation;
  /** `compact` para tarjetas de calendario; `full` para paneles de detalle. */
  variant?: "compact" | "full";
  className?: string;
}

function ServicePreparationMeterImpl({ preparation, variant = "full", className }: Props) {
  const tone = BAND_TONE[preparation.band];

  if (variant === "compact") {
    return (
      <span className={cn("flex items-center gap-1 min-w-0", className)}>
        <span className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full transition-all", tone.bar)}
            style={{ width: `${preparation.score}%` }}
          />
        </span>
        <span className={cn("text-[9px] font-semibold tabular-nums", tone.text)}>
          {preparation.score}%
        </span>
      </span>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preparación
        </span>
        <span className={cn("text-[12px] font-bold tabular-nums", tone.text)}>
          {preparation.score}% · {preparation.bandLabel}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone.bar)}
          style={{ width: `${preparation.score}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{preparation.headline}</p>
    </div>
  );
}

export const ServicePreparationMeter = memo(ServicePreparationMeterImpl);
