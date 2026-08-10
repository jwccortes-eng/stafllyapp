/**
 * ServiceCopilotPanel — el bloque principal del editor.
 *
 *   SIGUIENTE PASO   → UNA sola recomendación
 *   POR QUÉ          → la explicación, no solo la alerta
 *   CHECKLIST        → lectura, nunca edición
 *
 * UI-only: consume `getServiceCopilot` y no muta nada.
 */
import { memo } from "react";
import { ArrowRight, Check, CircleDashed, AlertTriangle, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusServiceSection } from "@/lib/shifts/service-publish-readiness";
import { ReadinessBar } from "./ReadinessBar";
import type { ChecklistState, ServiceCopilotResult } from "@/lib/shifts/service-copilot";

const STATE_ICON: Record<ChecklistState, React.ReactNode> = {
  done: <Check className="h-3 w-3 text-earning" />,
  pending: <CircleDashed className="h-3 w-3 text-muted-foreground/70" />,
  attention: <AlertTriangle className="h-3 w-3 text-warning" />,
  na: <Minus className="h-3 w-3 text-muted-foreground/40" />,
};

const STATE_TEXT: Record<ChecklistState, string> = {
  done: "text-foreground",
  pending: "text-muted-foreground",
  attention: "text-warning font-semibold",
  na: "text-muted-foreground/50",
};

function ServiceCopilotPanelImpl({ copilot }: { copilot: ServiceCopilotResult }) {
  const { nextStep, checklist } = copilot;
  const actionable = Boolean(nextStep.anchorId);

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      {/* Readiness — único indicador */}
      <div className="px-3.5 pt-3 pb-2.5 border-b border-border/30">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Readiness
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {copilot.bandLabel} · {copilot.stageLabel}
          </span>
        </div>
        <ReadinessBar value={copilot.readiness} band={copilot.band} variant="block" />
      </div>

      {/* Siguiente paso — UNA sola recomendación */}
      <div className="px-3.5 py-3 border-b border-border/30 bg-primary/[0.04]">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Siguiente paso
        </p>
        <div className="flex items-start justify-between gap-2 mt-1">
          <p className="text-[14px] font-bold font-heading leading-tight">{nextStep.label}</p>
          {actionable && (
            <button
              type="button"
              onClick={() => focusServiceSection(nextStep.anchorId!)}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground hover:opacity-90"
            >
              Ir <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-1.5">
          <span className="font-semibold text-foreground/70">Por qué: </span>
          {nextStep.why}
        </p>
      </div>

      {/* Checklist — solo lectura */}
      <ul className="px-3.5 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {checklist.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5 text-[11px] min-w-0">
            <span className="shrink-0">{STATE_ICON[c.state]}</span>
            <span className={cn("truncate", STATE_TEXT[c.state])}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const ServiceCopilotPanel = memo(ServiceCopilotPanelImpl);
