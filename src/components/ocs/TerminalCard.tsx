/**
 * OX-4.5 — TerminalCard: cierre visible de una acción operativa.
 *
 * Después de cerrar, aprobar o completar algo, la pantalla debe cambiar.
 * Esta card confirma qué ocurrió, con qué evidencia, cuál es la consecuencia
 * y qué sigue. Presentacional pura.
 */
import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT } from "@/lib/mobile/mobile-scale";
import { OperationalCard, type OcsAction } from "./OperationalCard";
import type { OcsDensity, OcsMode, OcsVariant } from "./tokens";
import type { TerminalState } from "@/lib/ox/terminal-state";

export interface TerminalCardProps {
  terminal: TerminalState;
  /** Identidad de lo que se cerró: turno, worker, periodo. */
  subtitle?: React.ReactNode;
  /** Siguiente paso navegable. Nunca ejecuta la acción de nuevo. */
  action?: OcsAction;
  actions?: OcsAction[];
  variant?: OcsVariant;
  mode?: OcsMode;
  density?: OcsDensity;
  className?: string;
}

export function TerminalCard({
  terminal,
  subtitle,
  action,
  actions,
  variant = "standard",
  mode = "readonly",
  density = "auto",
  className,
}: TerminalCardProps) {
  return (
    <OperationalCard
      status={terminal.statusKey}
      leading={
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-status-success/10">
          <CheckCircle2 className="h-5 w-5 text-status-success" aria-hidden />
        </span>
      }
      title={terminal.title}
      subtitle={subtitle}
      context={terminal.facts.map((fact, i) => (
        <span
          key={i}
          className="rounded-md bg-muted px-2 py-0.5 tabular-nums"
        >
          {fact}
        </span>
      ))}
      primary={<p className={MT.body}>{terminal.consequence}</p>}
      secondary={
        terminal.next ? (
          <span className={cn(MT.caption)}>Qué sigue: {terminal.next}</span>
        ) : undefined
      }
      action={action}
      actions={actions}
      variant={variant}
      mode={mode}
      density={density}
      className={className}
      aria-label={`${terminal.title}. ${terminal.consequence}`}
    />
  );
}
