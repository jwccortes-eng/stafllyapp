/**
 * ServicePreparationMeter — lectura del readiness (0–100) de un Servicio en
 * calendario, lista y drawer. Comparte tonos y barra con `ReadinessBar`, la
 * expresión canónica del ÚNICO indicador de madurez del ecosistema.
 *
 * Nunca usa rojo para un borrador: un evento en construcción no es un error.
 */
import { memo } from "react";
import { cn } from "@/lib/utils";
import { READINESS_TONE } from "@/components/shifts/copilot/ReadinessBar";
import type { PreparationBand, ServicePreparation } from "@/lib/shifts/service-preparation";

const BAND_TONE: Record<PreparationBand, { bar: string; text: string; dot: string }> =
  READINESS_TONE;


export function PreparationDot({
  preparation,
  className,
}: {
  preparation: ServicePreparation;
  className?: string;
}) {
  return (
    <span
      aria-label={`Readiness ${preparation.score}% · ${preparation.bandLabel}`}
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
          Readiness
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
