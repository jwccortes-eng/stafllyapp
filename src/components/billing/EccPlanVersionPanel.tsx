/**
 * ECC — Fase 2. Panel de solo lectura: plan version canónica, capacidades,
 * límites, overrides, fuentes, contradicciones legacy vs ECC y readiness.
 * No edita nada y no gobierna ningún gate.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle2, FileStack, ShieldAlert } from "lucide-react";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import { buildShadowReport, type ShadowStatus } from "@/lib/ecc/legacy-mapping";
import { ENTITLEMENT_SOURCE_LABEL } from "@/lib/ecc/entitlements";

const STATUS_LABEL: Record<ShadowStatus, string> = {
  match: "Coincide",
  mismatch: "Diferencia",
  unknown: "Sin dato",
  missing_mapping: "Sin mapeo",
  legacy_only: "Sólo legacy",
  ecc_only: "Sólo ECC",
};

const STATUS_TONE: Record<ShadowStatus, string> = {
  match: "bg-muted text-muted-foreground",
  mismatch: "bg-destructive/10 text-destructive",
  unknown: "bg-muted text-muted-foreground",
  missing_mapping: "bg-amber-500/10 text-amber-600",
  legacy_only: "bg-amber-500/10 text-amber-600",
  ecc_only: "bg-primary/10 text-primary",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? String(n) : "Sin límite");

export function EccPlanVersionPanel({ input }: { input: EccReadModelInput }) {
  const [showAll, setShowAll] = useState(false);
  const report = useMemo(() => buildShadowReport(input), [input]);
  const plan = report.access.planVersion;

  const rows = showAll
    ? report.capabilities
    : report.capabilities.filter(r => r.status !== "match" && r.status !== "unknown");

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <FileStack className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Plan version y entitlements canónicos (ECC Fase 2 · shadow)</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {report.cutoverReady ? "Listo para cutover" : "Cutover bloqueado"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Versión de plan">
          <span className="font-mono text-xs">{plan ? `${plan.planKey} v${plan.version}` : "—"}</span>
          <p className="text-[11px] text-muted-foreground mt-1">{plan?.status ?? "sin versión resuelta"}</p>
        </Field>
        <Field label="Checksum">
          <span className="font-mono text-[11px]">{plan?.checksum ?? "—"}</span>
        </Field>
        <Field label="Vigencia">
          <span className="text-xs">
            {plan ? `${plan.effectiveFrom} → ${plan.effectiveUntil ?? "vigente"}` : "—"}
          </span>
        </Field>
        <Field label="Plan legacy">
          <span className="font-mono text-xs">{report.planCodeLegacy}</span>
          <p className="text-[11px] text-muted-foreground mt-1">companies.plan_code (sigue gobernando)</p>
        </Field>
      </div>

      <Separator />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["match", "mismatch", "legacy_only", "ecc_only"] as ShadowStatus[]).map(s => (
          <div key={s} className="rounded-md border p-2">
            <p className="text-[11px] text-muted-foreground">{STATUS_LABEL[s]}</p>
            <p className="text-lg font-bold">{report.counts[s]}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold mb-2">Límites canónicos</p>
        <div className="space-y-1">
          {report.limits.map(l => (
            <div key={l.limitKey} className="flex items-center gap-2 text-xs">
              <span className="font-mono">{l.limitKey}</span>
              <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[l.status]}`}>{STATUS_LABEL[l.status]}</Badge>
              <span className="text-muted-foreground ml-auto">
                legacy {l.legacy ?? "—"} · ECC {fmt(l.ecc)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {report.access.overridesApplied.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5" /> Overrides aplicados
          </p>
          <div className="space-y-1">
            {report.access.overridesApplied.map(o => (
              <div key={o.id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{o.key}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {typeof o.value === "boolean" ? (o.value ? "concede" : "revoca") : `límite ${o.value}`}
                  </Badge>
                  <span className="text-muted-foreground ml-auto">
                    hasta {o.effectiveUntil ?? "sin vencimiento"}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1">{o.reason}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  aprobado por {o.approvedBy ?? "—"} · prioridad {o.priority}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">Capacidades (legacy vs ECC)</p>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAll(v => !v)}>
            {showAll ? "Ver sólo diferencias" : `Ver todas (${report.capabilities.length})`}
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Sin diferencias entre el gate legacy y el contrato canónico.
          </p>
        ) : (
          <div className="space-y-1">
            {rows.map(r => (
              <div key={r.capabilityKey} className="rounded-md border p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono">{r.capabilityKey}</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</Badge>
                  <span className="text-muted-foreground ml-auto">
                    legacy {r.legacy === null ? "—" : r.legacy ? "sí" : "no"} · ECC {r.ecc ? "sí" : "no"}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1">{r.eccReason}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{r.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {report.missingMappings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          <p className="text-xs font-semibold flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Mapeos faltantes ({report.missingMappings.length})
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 font-mono">{report.missingMappings.join(", ")}</p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold mb-1">Dependencias legacy restantes</p>
        <p className="text-[11px] text-muted-foreground font-mono">{report.legacyDependencies.join(" · ")}</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Fuentes de entitlement: {Object.values(ENTITLEMENT_SOURCE_LABEL).join(" · ")}
        </p>
      </div>
    </div>
  );
}
