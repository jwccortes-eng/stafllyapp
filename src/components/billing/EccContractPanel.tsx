/**
 * ECC — Fase 1. Vista de solo lectura del contrato comercial efectivo.
 * No edita nada y no gobierna ningún gate: es shadow sobre las fuentes reales.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ChevronDown, ChevronRight, Layers, ShieldCheck } from "lucide-react";
import {
  BILLING_READINESS_LABEL,
  BILLING_REQUIREMENT_LABEL,
  SOURCE_LABEL,
  compareWithLegacy,
  getCommercialContractReadModel,
  type EccReadModelInput,
} from "@/lib/ecc/commercial-read-model";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function EccContractPanel({ input }: { input: EccReadModelInput }) {
  const [showAll, setShowAll] = useState(false);
  const model = useMemo(() => getCommercialContractReadModel(input), [input]);
  const diffs = useMemo(() => compareWithLegacy(model, input), [model, input]);

  const caps = Object.values(model.effectiveEntitlements);
  const visible = showAll ? caps : caps.filter(c => c.contradiction || c.override);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Contrato comercial efectivo (ECC · solo lectura)</span>
        <Badge variant="outline" className="text-[10px] ml-auto">v{model.version ?? "—"}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Plan efectivo">
          <Badge className="bg-primary/10 text-primary border-0 font-bold">{model.effectivePlanLabel}</Badge>
          <p className="text-[11px] text-muted-foreground mt-1 font-mono">{SOURCE_LABEL[model.planSource]}</p>
        </Field>
        <Field label="Aprobación">
          <span className="text-sm">{model.approvalState.value}</span>
          <p className="text-[11px] text-muted-foreground mt-1">{model.approvalState.reason}</p>
        </Field>
        <Field label="Acceso">
          <span className="text-sm">{model.accessState.value}</span>
          <p className="text-[11px] text-muted-foreground mt-1">{model.accessState.reason}</p>
        </Field>
        <Field label="Condición comercial">
          <span className="text-sm">{model.commercialState.value}</span>
          <p className="text-[11px] text-muted-foreground mt-1">{model.commercialState.reason}</p>
        </Field>
      </div>

      <Separator />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Billing readiness">
          <Badge variant="outline">{BILLING_READINESS_LABEL[model.billingReadiness.state]}</Badge>
          <p className="text-[11px] text-muted-foreground mt-1">{model.billingReadiness.detail}</p>
        </Field>
        <Field label="Falta para facturar">
          <p className="text-[11px] text-muted-foreground">
            {model.billingReadiness.missing.map(m => BILLING_REQUIREMENT_LABEL[m]).join(" · ")}
          </p>
        </Field>
        <Field label="Límite de empleados">
          <span>
            {model.effectiveLimits.max_employees.current} /{" "}
            {Number.isFinite(model.effectiveLimits.max_employees.value)
              ? model.effectiveLimits.max_employees.value
              : "Sin límite"}
          </span>
          <p className="text-[11px] text-muted-foreground mt-1 font-mono">
            {SOURCE_LABEL[model.limitSources.max_employees]}
          </p>
        </Field>
        <Field label="Límite de admins">
          <span>
            {model.effectiveLimits.max_admins.current} /{" "}
            {Number.isFinite(model.effectiveLimits.max_admins.value)
              ? model.effectiveLimits.max_admins.value
              : "Sin límite"}
          </span>
          <p className="text-[11px] text-muted-foreground mt-1 font-mono">
            {SOURCE_LABEL[model.limitSources.max_admins]}
          </p>
        </Field>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Entitlements con fuente ({visible.length}/{caps.length})
          </p>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] ml-auto" onClick={() => setShowAll(v => !v)}>
            {showAll ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
            {showAll ? "Ver sólo overrides" : "Ver todos"}
          </Button>
        </div>
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin overrides ni contradicciones de módulo.</p>
        ) : (
          <div className="space-y-1.5">
            {visible.map(c => (
              <div key={c.key} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.key}</span>
                  <Badge variant="outline" className="text-[10px]">{c.enabled ? "enabled" : "disabled"}</Badge>
                  <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[c.source]}</Badge>
                  <Badge variant="outline" className="text-[10px] ml-auto">confianza {c.confidence}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{c.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {model.contradictions.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
              Contradicciones ({model.contradictions.length})
            </p>
            {model.contradictions.map(x => (
              <div key={x.code} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-3.5 w-3.5 ${x.severity === "alta" ? "text-destructive" : "text-amber-500"}`} />
                  <span className="text-sm font-medium">{x.title}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{x.severity}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{x.detail}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {x.sources.map(s => SOURCE_LABEL[s]).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Shadow vs legacy">
          {diffs.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Sin diferencias con el gate actual
            </span>
          ) : (
            <div className="space-y-1">
              {diffs.map(d => (
                <p key={`${d.kind}-${d.key}`} className="text-[11px] text-muted-foreground">
                  {d.key}: legacy {d.legacy} · ECC {d.ecc}
                </p>
              ))}
            </div>
          )}
        </Field>
        <Field label="Dependencias legacy">
          <p className="text-[11px] text-muted-foreground">{model.legacySources.join(" · ")}</p>
        </Field>
        <Field label="Acceso legal preservado">
          <Badge variant="outline" className={model.legalAccessPreserved ? "border-chart-1/40 text-chart-1" : "border-destructive/40 text-destructive"}>
            {model.legalAccessPreserved ? "Sí" : "No"}
          </Badge>
          <p className="text-[11px] text-muted-foreground mt-1">
            Lectura, histórico de payroll, documentos y exportación nunca se bloquean.
          </p>
        </Field>
      </div>

      {model.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          {model.warnings.map(w => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
