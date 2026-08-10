/**
 * ReadinessBar — expresión visual CANÓNICA del readiness de un Servicio.
 *
 * UN solo indicador en todo Stafly (calendario · lista · drawer · editor).
 * No existe "score", "health", "confidence", "risk" ni "completion": si algo
 * necesita mostrar madurez de un Servicio, muestra ESTE componente.
 *
 * UI-only. Sin datos propios.
 */
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { PreparationBand } from "@/lib/shifts/service-preparation";

export const READINESS_TONE: Record<
  PreparationBand,
  { bar: string; text: string; dot: string }
> = {
  ready: { bar: "bg-earning", text: "text-earning", dot: "bg-earning" },
  attention: { bar: "bg-warning", text: "text-warning", dot: "bg-warning" },
  later: { bar: "bg-primary/70", text: "text-primary", dot: "bg-primary/70" },
  closed: {
    bar: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
};

interface Props {
  value: number;
  band: PreparationBand;
  /** `inline` para cabeceras y celdas; `block` para paneles. */
  variant?: "inline" | "block";
  className?: string;
  barClassName?: string;
}

function ReadinessBarImpl({ value, band, variant = "inline", className, barClassName }: Props) {
  const tone = READINESS_TONE[band];
  return (
    <span
      className={cn(
        variant === "inline" ? "flex items-center gap-1.5" : "flex items-center gap-2 w-full",
        className,
      )}
      aria-label={`Readiness ${value}%`}
    >
      <span
        className={cn(
          "shrink-0 overflow-hidden rounded-full bg-muted",
          variant === "inline" ? "h-1.5 w-16" : "h-2 flex-1",
          barClassName,
        )}
      >
        <span
          className={cn("block h-full rounded-full transition-all", tone.bar)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
      <span
        className={cn(
          "font-bold tabular-nums",
          variant === "inline" ? "text-[11px]" : "text-[13px]",
          tone.text,
        )}
      >
        {value}%
      </span>
    </span>
  );
}

export const ReadinessBar = memo(ReadinessBarImpl);
