/**
 * OX-4 — ValidationCard.
 * Responde: "¿Qué decisión debo tomar?"
 *
 * Contrato: nunca es solo información. Requiere al menos una acción
 * (`approve` o `action`). Muestra evidencia y consecuencia de decidir.
 */
import * as React from "react";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT } from "@/lib/mobile/mobile-scale";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { StatusKey } from "@/lib/status/status-registry";

export interface ValidationEvidenceItem {
  label: string;
  value: React.ReactNode;
  /** Marca el dato que motiva la revisión. */
  attention?: boolean;
}

export interface ValidationCardProps {
  /** Qué hay que decidir, en una frase. */
  title: string;
  subtitle?: string | null;
  status?: StatusKey | (string & {});
  statusLabel?: string;
  /** Evidencia que sostiene la decisión. */
  evidence?: ValidationEvidenceItem[];
  /** Consecuencia de aprobar o rechazar. Obligatoria para decidir informado. */
  consequence: string;
  /** Decisión afirmativa. Obligatoria. */
  decision?: OcsAction;
  /** Decisiones alternativas (rechazar, ajustar, escalar). */
  alternatives?: OcsAction[];
  onClick?: () => void;
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}

export function ValidationCard({
  title,
  subtitle,
  status = "needs_review",
  statusLabel,
  evidence = [],
  consequence,
  decision,
  alternatives,
  onClick,
  variant = "standard",
  mode = "interactive",
  density = "auto",
  className,
}: ValidationCardProps) {
  return (
    <OperationalCard
      status={status}
      statusLabel={statusLabel}
      leading={
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <Scale className="h-4 w-4" />
        </span>
      }
      title={title}
      subtitle={subtitle ?? undefined}
      primary={
        evidence.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {evidence.map((item) => (
              <div
                key={item.label}
                className="flex items-baseline justify-between gap-2 min-w-0"
              >
                <dt className={cn(MT.caption, "text-muted-foreground truncate")}>
                  {item.label}
                </dt>
                <dd
                  className={cn(
                    MT.body,
                    "font-semibold tabular-nums shrink-0",
                    item.attention && "text-status-warning"
                  )}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : undefined
      }
      secondary={consequence}
      action={decision}
      actions={alternatives}
      onClick={onClick}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`Decisión pendiente: ${title}`}
    />
  );
}
