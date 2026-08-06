/**
 * Fase 0 — Panel de verdad comercial de una empresa (solo lectura).
 * No muestra vencimientos, cobros ni facturación que no existan.
 */
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ShieldQuestion } from "lucide-react";
import type { CompanyTruth } from "@/lib/billing/company-truth";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

const COMMERCIAL_TONE: Record<CompanyTruth["commercial"]["state"], string> = {
  not_configured: "border-muted-foreground/30 text-muted-foreground",
  manual: "border-primary/40 text-primary",
  legacy_subscription: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  inconsistent: "border-destructive/50 text-destructive",
};

export function CompanyTruthPanel({ truth }: { truth: CompanyTruth }) {
  const { entitlements: ent, subscription: sub } = truth;
  const limitText = (n: number) => (Number.isFinite(n) ? String(n) : "Sin límite");

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Plan efectivo (gobierna acceso)">
          <Badge className="bg-primary/10 text-primary border-0 font-bold">{truth.effectivePlanLabel}</Badge>
          <p className="text-[11px] text-muted-foreground mt-1 font-mono">{truth.planSource}</p>
        </Field>
        <Field label="Acceso">
          <Badge variant="outline" className={truth.access.state === "active" ? "border-chart-1/40 text-chart-1" : "border-destructive/40 text-destructive"}>
            {truth.access.label}
          </Badge>
          <p className="text-[11px] text-muted-foreground mt-1">{truth.access.reason}</p>
        </Field>
        <Field label="Estado comercial">
          <Badge variant="outline" className={COMMERCIAL_TONE[truth.commercial.state]}>{truth.commercial.label}</Badge>
          <p className="text-[11px] text-muted-foreground mt-1">{truth.commercial.detail}</p>
        </Field>
        <Field label="Aprobación">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ShieldQuestion className="h-3.5 w-3.5" />
            <span className="text-xs">{truth.approval.label}</span>
          </span>
          <p className="text-[11px] text-muted-foreground mt-1">Sin estados draft / needs_review / approved / rejected.</p>
        </Field>
      </div>

      <Separator />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Subscription registrada">
          {sub ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
              {sub.plan ?? "—"} · {sub.status ?? "—"}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">Sin subscription</span>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">No gobierna entitlements.</p>
        </Field>
        <Field label="Cliente de pago">
          <span className="text-xs font-mono text-muted-foreground">{sub?.stripe_customer_id || "No configurado"}</span>
        </Field>
        <Field label="Límite de empleados">
          <span>{ent.limits.employeeCount} / {limitText(ent.limits.maxEmployees)}</span>
        </Field>
        <Field label="Límite de usuarios admin">
          <span>{ent.limits.userCount} / {limitText(ent.limits.maxAdmins)}</span>
        </Field>
      </div>

      <Separator />

      <div className="space-y-2">
        <Field label={`Módulos heredados del plan (${ent.inherited.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {ent.inherited.map(m => (
              <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
            ))}
          </div>
        </Field>
        {ent.added.length > 0 && (
          <Field label={`Módulos añadidos fuera del plan (${ent.added.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {ent.added.map(m => (
                <Badge key={m} variant="outline" className="text-[10px] border-primary/40 text-primary">{m}</Badge>
              ))}
            </div>
          </Field>
        )}
        {ent.removedAttempted.length > 0 && (
          <Field label={`Módulos desactivados que el plan sigue concediendo (${ent.removedAttempted.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {ent.removedAttempted.map(m => (
                <Badge key={m} variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">{m}</Badge>
              ))}
            </div>
          </Field>
        )}
      </div>

      {truth.contradictions.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
              Contradicciones detectadas ({truth.contradictions.length})
            </p>
            {truth.contradictions.map(x => (
              <div key={x.code} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-3.5 w-3.5 ${x.severity === "alta" ? "text-destructive" : "text-amber-500"}`} />
                  <span className="text-sm font-medium">{x.title}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">Severidad {x.severity}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{x.detail}</p>
                <p className="text-xs text-muted-foreground">Recomendación: {x.recommendation}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
