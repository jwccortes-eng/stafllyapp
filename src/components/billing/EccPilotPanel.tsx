/**
 * ECC — Fase 4B. Panel del piloto real (solo lectura).
 *
 * Muestra quién gobierna el acceso, con qué confianza y con qué comparación
 * contra legacy. Sólo QA Testing puede estar en `ecc_pilot`; cualquier otra
 * compañía se muestra explícitamente como `legacy_only`.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, RotateCcw, Radar } from "lucide-react";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import { PILOT_MODE_LABEL, QA_TESTING_COMPANY_ID } from "@/lib/ecc/pilot";
import {
  LIVE_ALERT_LABEL,
  PILOT_REGISTRY_LIVE,
  PILOT_REGISTRY_ROLLED_BACK,
  rollbackEccPilot,
  runEccPilot,
  type ConfidenceLevel,
} from "@/lib/ecc/pilot-live";

const CONFIDENCE_TONE: Record<ConfidenceLevel, string> = {
  HIGH: "bg-emerald-500/10 text-emerald-600",
  MEDIUM: "bg-amber-500/10 text-amber-600",
  LOW: "bg-destructive/10 text-destructive",
};

export function EccPilotPanel({ input }: { input: EccReadModelInput }) {
  const [rolledBack, setRolledBack] = useState(false);
  const isPilot = input.company.id === QA_TESTING_COMPANY_ID;

  const run = useMemo(
    () =>
      runEccPilot(input, {
        companyVersion: input.company.version ?? null,
        currentVersion: input.company.version ?? null,
        usage: undefined,
        registry: rolledBack ? PILOT_REGISTRY_ROLLED_BACK : PILOT_REGISTRY_LIVE,
      }),
    [input, rolledBack],
  );

  const rollback = rolledBack ? rollbackEccPilot(input.company.id, "manual") : null;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Piloto ECC (Fase 4B)</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {PILOT_MODE_LABEL[run.mode]}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        {isPilot
          ? "Esta compañía resuelve su acceso con el ECC. Legacy se sigue calculando en paralelo y puede restaurarse al instante."
          : "Esta compañía no está en el piloto: el acceso lo gobierna legacy. El ECC sólo observa."}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {(["HIGH", "MEDIUM", "LOW"] as ConfidenceLevel[]).map(level => (
          <div key={level} className="rounded-md border p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confianza {level}</p>
            <p className="text-lg font-semibold">{run.confidenceCounts[level]}</p>
          </div>
        ))}
      </div>

      {run.alerts.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            <p className="text-xs font-semibold">Alertas ({run.alerts.length})</p>
          </div>
          {run.alerts.slice(0, 6).map((a, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">
              · {LIVE_ALERT_LABEL[a.code]} — {a.subject}: {a.detail}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Decisiones por superficie ({run.decisions.length}) · desajustes {run.mismatches.length} · fallbacks {run.fallbacks.length}
        </p>
        {run.decisions.map(d => (
          <div key={d.surface} className="rounded-md border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-2 text-xs">
              {d.legacyDecision === d.eccDecision ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
              )}
              <span className="flex-1 truncate">{d.surface}</span>
              <span className="text-muted-foreground">
                legacy {d.legacyDecision === null ? "n/d" : d.legacyDecision ? "sí" : "no"} · ECC{" "}
                {d.eccDecision === null ? "n/d" : d.eccDecision ? "sí" : "no"}
              </span>
              <Badge variant="outline" className="text-[10px]">
                gobierna {d.governedBy}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${CONFIDENCE_TONE[d.confidence]}`}>
                {d.confidence}
              </Badge>
            </div>
            <p className="mt-0.5 pl-5 text-[10px] text-muted-foreground">
              {d.capability ?? "sin capability"} · plan {d.planVersion ?? "n/d"} · {d.dependencyResult} · límite {d.limitResult}
              {d.fallback ? ` · fallback: ${d.fallbackReason}` : ""}
            </p>
          </div>
        ))}
      </div>

      {isPilot && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setRolledBack(v => !v)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {rolledBack ? "Reactivar piloto" : "Revertir a legacy"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {rollback ? rollback.detail : `Aprobado por ${run.approvedBy ?? "n/d"} · ${run.activatedAt ?? "sin activar"}`}
          </span>
        </div>
      )}
    </div>
  );
}
