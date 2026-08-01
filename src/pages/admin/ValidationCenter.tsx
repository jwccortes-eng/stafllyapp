/**
 * OX-4.4 — Centro de Validación.
 *
 * ÚNICO lugar donde se ejecutan decisiones terminales de validación
 * (aprobar horas, devolver horas, revisar cierre, aprobación final).
 * Las demás superficies muestran resumen/progreso y hacen deep-link aquí.
 *
 * Construido sobre Operational Card System (OX-4), tokens OX-2, escala OX-3
 * y feedback OX-1. No calcula payroll ni modifica horas: sólo su estado
 * de revisión. `time_entries` sigue siendo la fuente real de horas.
 */
import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Loader2, RefreshCw, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTodayHubPermissions } from "@/hooks/useTodayHubPermissions";
import { useValidationCenterData } from "@/hooks/useValidationCenterData";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { KpiCard } from "@/components/ocs/KpiCard";
import { InsightCard } from "@/components/ocs/InsightCard";
import { ValidationCard } from "@/components/ocs/ValidationCard";
import type { OcsAction } from "@/components/ocs/OperationalCard";

import { MT } from "@/lib/mobile/mobile-scale";
import { cn } from "@/lib/utils";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/feedback/notify";
import {
  buildValidationCenterModel,
  PRIORITY_LABEL,
  VALIDATION_TYPE_LABEL,
  type ValidationAction,
  type ValidationItem,
} from "@/lib/validation/validation-center-model";
import {
  executeValidationAction,
  isTerminalAction,
} from "@/lib/validation/validation-actions";

interface PendingDecision {
  item: ValidationItem;
  action: ValidationAction;
}

export default function ValidationCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany() as { selectedCompanyId: string | null };
  const { permissions, resolved, loading: permsLoading } = useTodayHubPermissions();

  const focusShiftId = searchParams.get("shiftId");
  const { data, isLoading, error, refetch, isFetching } =
    useValidationCenterData(selectedCompanyId);

  const [decision, setDecision] = useState<PendingDecision | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const model = useMemo(
    () =>
      buildValidationCenterModel({
        hours: data?.hours ?? [],
        closeouts: data?.closeouts ?? [],
        permissions,
        permissionsResolved: resolved,
        focusShiftId,
      }),
    [data, permissions, resolved, focusShiftId],
  );

  function runAction(item: ValidationItem, action: ValidationAction) {
    if (action.kind === "open_shift") {
      if (item.relatedShiftId) navigate(`/app/shift-ops?shiftId=${item.relatedShiftId}`);
      return;
    }
    if (!isTerminalAction(action.kind)) {
      notifyInfo({
        title: item.title,
        fact: item.evidence.map((e) => `${e.label}: ${e.value}`).join(" · "),
        consequence: item.requiredAction,
      });
      return;
    }
    setReason("");
    setDecision({ item, action });
  }

  async function confirmDecision() {
    if (!decision || !selectedCompanyId || !user?.id) return;
    const { item, action } = decision;
    if (action.requiresReason && !reason.trim()) {
      notifyError({
        title: "Falta el motivo",
        fact: "Esta devolución exige explicar qué debe corregirse.",
        consequence: "Sin motivo, el worker no sabrá qué cambiar.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await executeValidationAction(
        item,
        action.kind,
        { companyId: selectedCompanyId, userId: user.id },
        reason,
      );
      notifySuccess({
        title: action.label,
        fact: result.fact,
        consequence: result.consequence,
      });
      setDecision(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["validation-center"] });
    } catch (e) {
      notifyError({
        title: "No se pudo completar la decisión",
        fact: "El cambio no quedó registrado y nada fue modificado.",
        consequence: "Puedes reintentar sin riesgo de duplicar la decisión.",
        action: { label: "Reintentar", onClick: () => void confirmDecision() },
        cause: e,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function toOcsAction(item: ValidationItem, action: ValidationAction): OcsAction {
    return {
      label: action.label,
      onClick: () => runAction(item, action),
      tone: action.kind === "reject" ? "danger" : action.readOnly ? "quiet" : "default",
      disabled: model.readOnly && isTerminalAction(action.kind),
    };
  }

  function renderItem(item: ValidationItem) {
    const primary = item.primaryAction;
    return (
      <ValidationCard
        key={item.id}
        title={item.title}
        subtitle={item.subtitle}
        person={item.person}
        headline={item.headline}
        contextChips={[
          VALIDATION_TYPE_LABEL[item.validationType],
          item.priority === "urgent" ? "Urgente" : null,
        ].filter((c): c is string => !!c)}
        status={item.statusKey}
        evidence={item.evidence}
        secondaryEvidence={item.secondaryEvidence}
        humanContext={item.humanContext.map((n) => ({ label: n.label, value: n.value }))}
        conversation={item.conversation}
        consequence={primary?.consequence ?? item.requiredAction}
        decision={primary ? toOcsAction(item, primary) : undefined}
        alternatives={item.secondaryActions
          .filter((a) => !(model.readOnly && isTerminalAction(a.kind)))
          .map((a) => toOcsAction(item, a))}
        density={isMobile ? "mobile" : "desktop"}
        mode="interactive"
      />
    );
  }


  function renderSection(
    title: string,
    description: string,
    items: ValidationItem[],
    emptyLabel: string,
  ) {
    return (
      <section className="space-y-3">
        <header className="space-y-0.5">
          <h2 className={MT.title}>
            {title}
            <span className="ml-2 text-muted-foreground font-normal">{items.length}</span>
          </h2>
          <p className={cn(MT.caption, "text-muted-foreground")}>{description}</p>
        </header>
        {items.length === 0 ? (
          <p className={cn(MT.body, "text-muted-foreground rounded-2xl border border-dashed p-4")}>
            {emptyLabel}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{items.map(renderItem)}</div>
        )}
      </section>
    );
  }

  if (!selectedCompanyId) {
    return (
      <div className="p-4">
        <p className={MT.body}>Selecciona una compañía para ver sus validaciones.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Centro de Validación"
        subtitle="Único lugar donde se aprueban horas reales y cierres de turno. No calcula ni ejecuta payroll."
      />

      {focusShiftId ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 p-3">
          <p className={cn(MT.body, "min-w-0")}>
            Mostrando sólo las validaciones del turno enlazado.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("shiftId");
              setSearchParams(next, { replace: true });
            }}
          >
            <X className="h-4 w-4 mr-1.5" />
            Quitar filtro
          </Button>
        </div>
      ) : null}

      {model.readOnly ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <p className={cn(MT.label, "text-amber-900 dark:text-amber-200")}>
              Permisos no verificados
            </p>
            <p className={cn(MT.caption, "text-amber-900/80 dark:text-amber-200/80")}>
              {permsLoading
                ? "Confirmando tu rol en esta compañía. Mientras tanto el centro es de sólo lectura."
                : "No podemos confirmar tu rol aquí. Puedes revisar la evidencia, pero no decidir."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Pendientes"
          value={model.summary.pending}
          meaning="Validaciones esperando una decisión tuya."
          loading={isLoading}
          error={error ? "No se pudo cargar la cola." : null}
          onRetry={() => void refetch()}
          isEmpty={!isLoading && !error && model.summary.total === 0}
          emptyLabel="Sin validaciones en los últimos 21 días"
        />
        <KpiCard
          label="Urgentes"
          value={model.summary.urgent}
          meaning="Requieren atención hoy: evidencia faltante o excepciones."
          status={model.summary.urgent > 0 ? "critical" : "approved"}
          loading={isLoading}
          error={error ? "No se pudo cargar la cola." : null}
          onRetry={() => void refetch()}
        />
        <KpiCard
          label="Horas por aprobar"
          value={`${model.summary.hoursPendingApproval} h`}
          meaning="Horas reales fichadas que aún no entran a payroll."
          loading={isLoading}
          error={error ? "No se pudo cargar la cola." : null}
          onRetry={() => void refetch()}
        />
        <KpiCard
          label="Listos para payroll"
          value={model.summary.readyForPayroll}
          meaning="Ya aprobados. Payroll los leerá en el próximo corte."
          status="ready_for_payroll"
          loading={isLoading}
          error={error ? "No se pudo cargar la cola." : null}
          onRetry={() => void refetch()}
        />
      </div>

      {model.primaryAction ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="min-w-0">
            <p className={MT.label}>Siguiente decisión</p>
            {nextItem ? (
              <p className={cn(MT.body, "truncate")}>
                {nextItem.title}
                {nextItem.subtitle ? ` · ${nextItem.subtitle}` : ""} — {nextItem.headline}
              </p>
            ) : null}
            <p className={cn(MT.caption, "text-muted-foreground")}>
              {model.primaryAction.reason}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Actualizar
          </Button>
        </div>
      ) : null}

      {model.risks.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {model.risks.map((risk) => (
            <InsightCard
              key={risk.id}
              recommendation={risk.title}
              because={risk.detail}
              status={risk.severity === "critical" ? "critical" : "warning"}
              density={isMobile ? "mobile" : "desktop"}
              mode="readonly"
            />
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 p-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className={MT.body}>Cargando validaciones…</span>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <p className={cn(MT.label, "text-destructive")}>No se pudo cargar el centro</p>
          <p className={cn(MT.caption, "text-muted-foreground")}>
            No se muestra nada en lugar de mostrar datos incompletos.
          </p>
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="space-y-7">
          {renderSection(
            "Urgente",
            "Bloquean el cierre o el avance a payroll.",
            model.urgentItems,
            "Nada urgente ahora mismo.",
          )}
          {renderSection(
            "Pendientes",
            "Decisiones abiertas con evidencia suficiente.",
            model.pendingItems,
            "No hay validaciones pendientes.",
          )}
          {renderSection(
            "Devueltos",
            "Esperando corrección de worker o capitán. Fuera de payroll.",
            model.returnedItems,
            "Nada devuelto.",
          )}
          {renderSection(
            "Resueltos",
            "Historial reciente con decisión registrada.",
            model.resolvedItems,
            "Sin decisiones registradas en el periodo.",
          )}
        </div>
      )}

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{decision?.action.label}</DialogTitle>
            <DialogDescription>
              {decision?.item.title}
              {decision?.action.consequence ? ` — ${decision.action.consequence}` : ""}
            </DialogDescription>
          </DialogHeader>

          {decision ? (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-2">
                {decision.item.evidence.map((e) => (
                  <div key={e.label}>
                    <dt className={cn(MT.caption, "text-muted-foreground")}>{e.label}</dt>
                    <dd className={cn(MT.body, e.attention && "text-amber-600 font-medium")}>
                      {e.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className={cn(MT.caption, "text-muted-foreground")}>
                Prioridad {PRIORITY_LABEL[decision.item.priority]} · {decision.item.auditSummary}
              </p>
              {decision.action.requiresReason ? (
                <div className="space-y-1.5">
                  <label className={MT.label} htmlFor="validation-reason">
                    Motivo (obligatorio)
                  </label>
                  <Textarea
                    id="validation-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Qué debe corregirse exactamente"
                    rows={3}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setDecision(null)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              className="min-h-11"
              variant={decision?.action.kind === "reject" ? "destructive" : "default"}
              onClick={() => void confirmDecision()}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
