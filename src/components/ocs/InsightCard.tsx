/**
 * OX-4 — InsightCard.
 * Responde: "¿Qué recomienda el sistema?"
 *
 * No muestra datos crudos: muestra lectura, motivo y acción recomendada.
 */
import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT } from "@/lib/mobile/mobile-scale";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { StatusKey } from "@/lib/status/status-registry";

export interface InsightCardProps {
  /** Recomendación en una frase accionable. */
  recommendation: string;
  /** Por qué el sistema lo recomienda. */
  because: string;
  /** Qué pasa si no se actúa. */
  impact?: string | null;
  /** Confianza 0-1; se muestra como texto, no como color. */
  confidence?: number | null;
  status?: StatusKey | (string & {});
  statusLabel?: string;
  /** Acción recomendada. */
  action?: OcsAction;
  /** Descartar / ver detalle. */
  actions?: OcsAction[];
  onClick?: () => void;
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}

function confidenceLabel(value: number) {
  if (value >= 0.8) return "Confianza alta";
  if (value >= 0.5) return "Confianza media";
  return "Confianza baja";
}

export function InsightCard({
  recommendation,
  because,
  impact,
  confidence,
  status = "informational",
  statusLabel = "Recomendación",
  action,
  actions,
  onClick,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  className,
}: InsightCardProps) {
  return (
    <OperationalCard
      status={status}
      statusLabel={statusLabel}
      statusAside={
        typeof confidence === "number" ? confidenceLabel(confidence) : undefined
      }
      leading={
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <Sparkles className="h-4 w-4" />
        </span>
      }
      title={recommendation}
      primary={<p className={cn(MT.body)}>{because}</p>}
      secondary={impact ?? undefined}
      action={action}
      actions={actions}
      onClick={onClick}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`Recomendación del sistema: ${recommendation}`}
    />
  );
}
