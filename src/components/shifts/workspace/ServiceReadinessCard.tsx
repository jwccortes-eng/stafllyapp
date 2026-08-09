/**
 * ServiceReadinessCard — separa visualmente las dos preguntas operativas:
 *
 *   "Listo para publicar"  ≠  "Listo para exportar a Connecteam"
 *
 * UI-only. Lee de `getServiceOperationalReadiness` y no muta nada.
 * Cada blocker se muestra con su motivo exacto y una acción que enfoca la
 * sección del mismo editor (nunca navegación a /clients o /locations).
 */
import { memo } from "react";
import { CheckCircle2, AlertTriangle, Send, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusServiceSection } from "@/lib/shifts/service-publish-readiness";
import {
  READINESS_COPY,
  type OperationalBlocker,
  type ServiceOperationalReadiness,
} from "@/lib/shifts/service-operational-readiness";

interface Props {
  readiness: ServiceOperationalReadiness;
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

function ServiceReadinessCardImpl({ readiness }: Props) {
  const pubBlockers = readiness.publishBlockers;
  const expBlockers = readiness.exportBlockers;

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      {/* Publicar */}
      <div
        className={cn(
          "px-3 py-2.5 border-b border-border/30",
          readiness.readyToPublish
            ? "bg-[hsl(142_76%_36%/0.06)]"
            : "bg-[hsl(var(--status-pending)/0.06)]",
        )}
      >
        <div className="flex items-center gap-2">
          <Send className="h-3.5 w-3.5 opacity-80 shrink-0" />
          <span className="text-[12px] font-semibold">
            {readiness.readyToPublish
              ? READINESS_COPY.publishReady
              : READINESS_COPY.publishBlocked(pubBlockers.length)}
          </span>
          {readiness.readyToPublish && (
            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(142_76%_36%)] ml-auto" />
          )}
        </div>
        {pubBlockers.length > 0 && (
          <div className="space-y-1 mt-2">
            {pubBlockers.map((b) => (
              <BlockerRow key={b.code} b={b} />
            ))}
          </div>
        )}
      </div>

      {/* Exportar a Connecteam */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileDown className="h-3.5 w-3.5 opacity-80 shrink-0" />
          <span className="text-[12px] font-semibold">
            {readiness.readyToExportConnecteam
              ? READINESS_COPY.exportReady
              : READINESS_COPY.exportBlocked(expBlockers.length)}
          </span>
          {readiness.readyToExportConnecteam && (
            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(142_76%_36%)] ml-auto" />
          )}
        </div>
        {expBlockers.length > 0 ? (
          <div className="space-y-1 mt-2">
            {expBlockers.map((b) => (
              <BlockerRow key={b.code} b={b} />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-1">
            Connecteam recibirá fecha, horario, título, Job y plazas de este servicio.
          </p>
        )}
        {readiness.warnings
          .filter((w) => w.scope === "export")
          .map((w) => (
            <p key={w.code} className="text-[10px] text-muted-foreground mt-1.5">
              {w.message}
            </p>
          ))}
      </div>
    </div>
  );
}

export const ServiceReadinessCard = memo(ServiceReadinessCardImpl);
