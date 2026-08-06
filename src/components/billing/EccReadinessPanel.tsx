/**
 * ECC — Fase 3. Panel de solo lectura: readiness, blockers, mismatches,
 * capacidades críticas, límites, overrides y dependencia legacy.
 * Única acción permitida: "Revisar preparación". No ejecuta cutover.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle2, ShieldCheck, Target } from "lucide-react";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import {
  DIFFERENCE_CLASS_LABEL,
  READINESS_LABEL,
  RESOLUTION_ACTION_LABEL,
  evaluateShadowPeriod,
  reconcileCompany,
  type Readiness,
} from "@/lib/ecc/reconciliation";

const TONE: Record<Readiness, string> = {
  READY: "bg-emerald-500/10 text-emerald-600",
  CONDITIONAL: "bg-amber-500/10 text-amber-600",
  NOT_READY: "bg-destructive/10 text-destructive",
  BLOCKED: "bg-destructive/15 text-destructive",
};

const fmt = (n: number) => (Number.isFinite(n) ? String(n) : "Sin límite");

export function EccReadinessPanel({ input }: { input: EccReadModelInput }) {
  const [reviewed, setReviewed] = useState(false);
  const rec = useMemo(() => reconcileCompany(input), [input]);
  const shadowPeriod = useMemo(() => evaluateShadowPeriod(null), []);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Preparación para cutover (ECC Fase 3 · shadow)</span>
        <Badge className={`ml-auto text-[10px] ${TONE[rec.readiness]}`} variant="outline">
          {READINESS_LABEL[rec.readiness]}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Legacy sigue gobernando el acceso. Esta vista compara y explica; no cambia ningún permiso.
      </p>

      <div className="rounded-md border p-3 space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Por qué</p>
        {(rec.readinessReasons.length ? rec.readinessReasons : ["Sin observaciones."]).map((r, i) => (
          <p key={i} className="text-xs">· {r}</p>
        ))}
      </div>

      {rec.blockers.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <p className="text-xs font-semibold">Blockers</p>
          </div>
          {rec.blockers.map((b, i) => (
            <p key={i} className="text-xs text-destructive">· {b}</p>
          ))}
        </div>
      )}

      <Separator />

      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Capacidades críticas</p>
        <div className="grid gap-1">
          {rec.criticalMatrix.map(m => (
            <div key={m.alias} className="flex items-center gap-2 text-xs">
              {m.explained ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
              )}
              <span className="flex-1 truncate">{m.label}</span>
              <span className="text-muted-foreground">
                legacy {m.legacy === null ? "n/d" : m.legacy ? "sí" : "no"} · ECC {m.ecc === null ? "n/d" : m.ecc ? "sí" : "no"}
              </span>
              <Badge variant="outline" className="text-[10px]">{m.status}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Límites</p>
        {rec.limits.map(l => (
          <div key={l.limitKey} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate">{l.label}</span>
            <span className="text-muted-foreground">
              legacy {l.legacy ?? "n/d"} · ECC {fmt(l.ecc)} · uso {l.usage ?? "n/d"}
            </span>
            <Badge variant="outline" className={`text-[10px] ${l.overLimitRisk ? "text-destructive" : ""}`}>
              {l.overLimitRisk ? "Excedido" : l.status}
            </Badge>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Overrides ({rec.overrides.length})
        </p>
        {rec.overrides.length === 0 && <p className="text-xs text-muted-foreground">Sin overrides equivalentes.</p>}
        {rec.overrides.map(o => (
          <div key={o.id} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate">{o.key}</span>
            <span className="text-muted-foreground">{o.legacySource}</span>
            <Badge variant="outline" className={`text-[10px] ${o.blocksReadiness ? "text-destructive" : ""}`}>
              {o.classification}
            </Badge>
          </div>
        ))}
      </div>

      {reviewed && (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Diferencias clasificadas ({rec.findings.length})
          </p>
          {rec.findings.length === 0 && <p className="text-xs text-muted-foreground">Sin diferencias.</p>}
          {rec.findings.map(f => (
            <div key={f.id} className="rounded-md border p-2 space-y-0.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium flex-1 truncate">{f.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  {f.classification} · {DIFFERENCE_CLASS_LABEL[f.classification]}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">{f.detail}</p>
              <p className="text-[11px] text-muted-foreground">
                Legacy: {f.legacy} · ECC: {f.ecc} · Riesgo {f.risk} · Owner {f.owner}
              </p>
              <p className="text-[11px]">
                Propuesta: <span className="font-medium">{RESOLUTION_ACTION_LABEL[f.proposal]}</span> (no ejecutada)
              </p>
            </div>
          ))}
          <div className="rounded-md border p-2 text-[11px] text-muted-foreground space-y-0.5">
            <p>Dependencia legacy: {rec.legacyDependencies.join(", ") || "ninguna"}</p>
            <p>Periodo de observación: {shadowPeriod.detail}</p>
            <p>Candidato a cutover: {rec.cutoverCandidate ? "sí (propuesto)" : "no"} — {rec.candidateReason}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setReviewed(v => !v)}>
          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
          Revisar preparación
        </Button>
        <span className="text-[11px] text-muted-foreground">El cutover no está habilitado en esta fase.</span>
      </div>
    </div>
  );
}
