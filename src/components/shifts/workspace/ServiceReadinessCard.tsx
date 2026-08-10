/**
 * ServiceReadinessCard — separa visualmente las preguntas operativas del ciclo
 * de vida de un Servicio:
 *
 *   "Listo para staffing" ≠ "Listo para publicar" ≠ "Listo para Connecteam"
 *
 * UI-only. Lee de `getServiceLifecycleReadiness` y no muta nada.
 * Cada blocker se muestra con su motivo exacto y una acción que enfoca la
 * sección del mismo editor (nunca navegación a /clients o /locations).
 */
import { memo } from "react";
import { CheckCircle2, AlertTriangle, Send, FileDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusServiceSection } from "@/lib/shifts/service-publish-readiness";
import type { OperationalBlocker } from "@/lib/shifts/service-operational-readiness";
import type {
  GateResult,
  ServiceLifecycleReadiness,
} from "@/lib/shifts/service-lifecycle-readiness";
import { getLifecyclePreparation } from "@/lib/shifts/service-preparation";
import { ServicePreparationMeter } from "@/components/shifts/planner/ServicePreparationMeter";
import { NextStepCard } from "@/components/shifts/planner/NextStepCard";


interface Props {
  lifecycle: ServiceLifecycleReadiness;
}

function BlockerRow({ b }: { b: OperationalBlocker }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px]">
      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-[hsl(var(--status-pending))]" />
      <span className="min-w-0">
        <span className="font-semibold">{b.label}</span> — {b.reason}
        <button
          type="button"
          onClick={() => focusServiceSection(b.action.anchorId)}
          className="ml-1 underline font-semibold hover:opacity-80"
        >
          {b.action.label}
        </button>
      </span>
    </div>
  );
}

function GateBlock({
  gate,
  icon,
  last,
}: {
  gate: GateResult;
  icon: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-3 py-2.5",
        !last && "border-b border-border/30",
        gate.ready
          ? "bg-[hsl(142_76%_36%/0.06)]"
          : "bg-[hsl(var(--status-pending)/0.06)]",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="opacity-80 shrink-0">{icon}</span>
        <span className="text-[12px] font-semibold">{gate.statusText}</span>
        {gate.ready && (
          <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(142_76%_36%)] ml-auto" />
        )}
      </div>
      {gate.blockers.length > 0 && (
        <div className="space-y-1 mt-2">
          {gate.blockers.map((b) => (
            <BlockerRow key={b.code} b={b} />
          ))}
        </div>
      )}
      {gate.warnings.map((w) => (
        <p key={w.code} className="text-[10px] text-muted-foreground mt-1.5">
          {w.message}
        </p>
      ))}
    </div>
  );
}

function ServiceReadinessCardImpl({ lifecycle }: Props) {
  const { staff, publish, export_connecteam: exportGate } = lifecycle.gates;
  const preparation = getLifecyclePreparation(lifecycle);

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-border/40 bg-card px-3 py-2.5">
        <ServicePreparationMeter preparation={preparation} />
      </div>
      <NextStepCard preparation={preparation} />
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <GateBlock gate={staff} icon={<Users className="h-3.5 w-3.5" />} />
        <GateBlock gate={publish} icon={<Send className="h-3.5 w-3.5" />} />
        <GateBlock gate={exportGate} icon={<FileDown className="h-3.5 w-3.5" />} last />
        {exportGate.ready && (
          <p className="px-3 pb-2.5 -mt-1 text-[10px] text-muted-foreground">
            Connecteam recibirá fecha, horario, título, Job y plazas de este servicio.
          </p>
        )}
      </div>
    </div>
  );
}


export const ServiceReadinessCard = memo(ServiceReadinessCardImpl);
