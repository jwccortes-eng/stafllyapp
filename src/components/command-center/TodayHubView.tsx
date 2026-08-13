/**
 * OX-4.3 — Today Hub / Command Center sobre Operational Card System.
 *
 * Superficie operacional única (mobile + desktop) construida exclusivamente
 * con OCS: OcsShiftCard, TeamCard, KpiCard, InsightCard, ValidationCard.
 *
 * Toda la verdad operacional viene de `buildTodayHubModel` (capa pura).
 * Este componente sólo decide layout. No hay lógica de negocio aquí, no hay
 * escrituras, no se toca payroll ni RLS.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MT, MT_EYEBROW, TAP } from "@/lib/mobile/mobile-scale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCompany } from "@/hooks/useCompany";
import { useServiceRootRefs } from "@/hooks/useServiceRootRefs";
import { useTodayOperations } from "@/hooks/useTodayOperations";
import { useTodayHubPermissions } from "@/hooks/useTodayHubPermissions";

import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/feedback/notify";
import {
  InsightCard,
  KpiCard,
  OcsShiftCard,
  OperationalCard,
  TeamCard,
  ValidationCard,
} from "@/components/ocs";
import {
  buildTodayHubModel,
  type HubAlert,
  type HubAlertGroup,
  type HubAlertSeverity,
  type HubAttentionItem,
  type HubCounts,
  type HubDecisionItem,
} from "@/lib/command-center/today-hub-model";
import { ADMIN_LEX } from "@/lib/ox/lexicon";

/* ── Contadores globales (sólo lectura, tenant-scoped) ───────────────── */

function useHubCounts(companyId: string | null) {
  const [counts, setCounts] = useState<HubCounts>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setCounts({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const sb: any = supabase;
      const [hours, docs, periods] = await Promise.all([
        sb.from("time_entries").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("clock_out", null),
        sb.from("employee_documents").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("review_status", "pending"),
        sb.from("pay_periods").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("status", "open"),
      ]);
      if (cancelled) return;
      const firstErr = hours?.error || docs?.error || periods?.error;
      if (firstErr) {
        setError("No pudimos cargar los contadores operativos.");
        setCounts({});
        notifyError({
          title: "Contadores no disponibles",
          fact: "No se pudieron leer horas, documentos ni periodos abiertos.",
          consequence: "El Today Hub muestra sólo los turnos de hoy.",
          key: "today-hub-counts",
          cause: firstErr,
        });
      } else {
        setCounts({
          pendingHours: hours?.count ?? 0,
          docsPending: docs?.count ?? 0,
          openPeriods: periods?.count ?? 0,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, tick]);

  return { counts, loading, error, refresh: () => setTick((t) => t + 1) };
}

/* ── Sección ─────────────────────────────────────────────────────────── */

function Section({
  eyebrow,
  title,
  helper,
  count,
  collapsible,
  defaultOpen = true,
  children,
}: {
  eyebrow?: string;
  title: string;
  helper?: string;
  count?: number;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-2.5">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left",
          collapsible ? cn(TAP, "px-0") : "cursor-default",
        )}
        aria-expanded={collapsible ? open : undefined}
      >
        <div className="min-w-0">
          {eyebrow && <p className={cn(MT_EYEBROW, "text-muted-foreground")}>{eyebrow}</p>}
          <h2 className={cn(MT.section, "truncate")}>
            {title}
            {typeof count === "number" && count > 0 && (
              <span className="ml-2 text-muted-foreground tabular-nums">{count}</span>
            )}
          </h2>
          {helper && <p className={cn(MT.caption, "text-muted-foreground")}>{helper}</p>}
        </div>
        {collapsible && (
          <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", open && "rotate-180")} />
        )}
      </button>
      {(!collapsible || open) && <div className="space-y-2.5">{children}</div>}
    </section>
  );
}

/* ── Renderers OCS ───────────────────────────────────────────────────── */

/* ── P1 — Bandeja operativa accionable ──────────────────────────────── */

const SEVERITY_LABEL: Record<HubAlertSeverity, string> = {
  critical: "Crítico",
  attention: "Requiere acción",
  prep: "Preparación",
  info: "Contexto",
};

const SEVERITY_STATUS: Record<HubAlertSeverity, string> = {
  critical: "blocked",
  attention: "warning",
  prep: "pending",
  info: "info",
};

/**
 * Una alerta = una lectura completa en <3 s.
 * QUÉ (title) · DÓNDE (QK + cliente + sitio) · A QUIÉN (personas) ·
 * QUÉ HAGO AHORA (una sola acción principal).
 */
function AlertEntry({ alert, go }: { alert: HubAlert; go: (href: string) => void }) {
  const ctx = alert.context;
  const who =
    ctx.people.length > 0
      ? ctx.people.length <= 2
        ? ctx.people.join(" · ")
        : `${ctx.people.slice(0, 2).join(" · ")} +${ctx.people.length - 2}`
      : ctx.peopleCount > 0
        ? `${ctx.peopleCount} persona(s)`
        : "Servicio completo";

  return (
    <OperationalCard
      status={SEVERITY_STATUS[alert.severity]}
      statusLabel={SEVERITY_LABEL[alert.severity]}
      title={alert.title}
      primary={
        <div className="space-y-1.5">
          <p className={cn(MT.body)}>{alert.headline}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <ContextCell label="Dónde" value={ctx.locationName ?? ctx.clientName ?? "Sin sitio"} />
            <ContextCell label="Cuándo" value={ctx.whenLabel} />
            <ContextCell label="A quién" value={who} />
            <ContextCell label="Ahora" value={`${ctx.current} · ${ctx.ageLabel}`} />
          </dl>
        </div>
      }
      secondary={
        alert.cta
          ? alert.impact
          : `${alert.impact ?? alert.because} No tienes permiso para resolverlo.`
      }
      action={
        alert.cta
          ? { label: alert.cta.label, onClick: () => go(alert.cta!.href) }
          : undefined
      }
    />
  );
}

function ContextCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={cn(MT_EYEBROW, "text-muted-foreground")}>{label}</dt>
      <dd className={cn(MT.caption, "truncate font-medium")}>{value}</dd>
    </div>
  );
}

/** Cabecera de servicio: el contexto se dice una vez, no en cada alerta. */
function AlertGroupBlock({
  group,
  go,
}: {
  group: HubAlertGroup;
  go: (href: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
        <span className={cn(MT.body, "font-semibold")}>
          {group.serviceRef ?? group.title}
        </span>
        {group.clientName ? (
          <span className={cn(MT.caption, "text-muted-foreground")}>
            {group.clientName}
          </span>
        ) : null}
        <span className={cn(MT.caption, "text-muted-foreground")}>
          · {group.whenLabel}
        </span>
      </div>
      {group.alerts.map((a) => (
        <AlertEntry key={a.id} alert={a} go={go} />
      ))}
    </div>
  );
}

function AttentionEntry({

  item,
  go,
}: {
  item: HubAttentionItem;
  go: (href: string) => void;
}) {
  const action = item.action
    ? { label: item.action.label, onClick: () => go(item.action!.href) }
    : undefined;

  if (item.kind === "kpi") {
    return (
      <KpiCard
        label={item.headline}
        value={item.value}
        meaning={item.because}
        status={item.status}
        isEmpty={!item.action}
        emptyLabel="Sin pendientes"
        action={action}
      />
    );
  }
  return (
    <InsightCard
      recommendation={item.headline}
      because={item.because}
      impact={item.impact}
      status={item.status}
      statusLabel={item.priority === "critical" ? "Crítico" : "Requiere acción"}
      action={action}
    />
  );
}

function DecisionEntry({ item, go }: { item: HubDecisionItem; go: (href: string) => void }) {
  return (
    <ValidationCard
      title={item.title}
      subtitle={item.subtitle}
      status={item.status}
      evidence={item.evidence}
      consequence={
        item.decision
          ? item.consequence
          : `${item.consequence} No tienes permiso para decidir sobre este ítem.`
      }
      decision={
        item.decision
          ? { label: item.decision.label, onClick: () => go(item.decision!.href) }
          : undefined
      }
      alternatives={item.alternatives.map((a) => ({
        label: a.label,
        onClick: () => go(a.href),
      }))}
    />
  );
}


/* ── Vista ───────────────────────────────────────────────────────────── */

export default function TodayHubView() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { selectedCompanyId } = useCompany();
  const today = useMemo(() => new Date(), []);
  const { loading, error, shifts, employeesById, refresh } = useTodayOperations(
    selectedCompanyId ?? null,
    today,
  );
  useServiceRootRefs(shifts as any);
  const {
    permissions,
    resolved: permsResolved,
    loading: permsLoading,
    reason: permsReason,
  } = useTodayHubPermissions();
  const { counts, error: countsError, refresh: refreshCounts } = useHubCounts(
    selectedCompanyId ?? null,
  );

  /* OX-4.3.1 — feedback OX-1 cuando el resolver falla (no cuando carga). */
  useEffect(() => {
    if (permsReason === "resolver_error" || permsReason === "role_unresolved_for_tenant") {
      notifyError({
        title: "Permisos no verificados",
        fact: "No pudimos confirmar tus permisos en esta compañía.",
        consequence: "Las acciones que modifican la operación quedan ocultas.",
        key: `today-hub-perms:${permsReason}`,
      });
    }
  }, [permsReason]);

  /**
   * P1 — El modelo necesita PERSONAS y UBICACIÓN para responder "a quién
   * afecta" y "dónde". Aquí sólo se hidrata: la verdad la resuelven los
   * resolvers canónicos dentro de `buildTodayHubModel`.
   */
  const hubShifts = useMemo(
    () =>
      shifts.map((s) => ({
        ...s,
        workers: s.ops.workers.map((w) => {
          const emp = employeesById.get(w.employee_id);
          return {
            employee_id: w.employee_id,
            name: emp ? `${emp.first_name} ${emp.last_name}`.trim() : null,
            assignment_status: w.assignment_status,
            clock_state: w.clock_state,
            clock_in: w.clock_in,
            clock_out: w.clock_out,
          };
        }),
        location: {
          location_id: s.location_id,
          job_site_location_id: s.job_site_location_id,
          job_site_address: s.job_site_address,
          meeting_point: s.meeting_point,
          meeting_point_location_id: s.meeting_point_location_id,
          transportation_required: s.transportation_required,
          jobSiteV2: s.job_site_location_name
            ? { name: s.job_site_location_name }
            : null,
          // `job_site_name` ya resuelve V2 primero; sólo es venue legado
          // cuando no hay Job Site V2.
          legacyVenue:
            !s.job_site_location_name && s.job_site_name
              ? { name: s.job_site_name }
              : null,
          meetingV2: s.meeting_point_location_name
            ? { name: s.meeting_point_location_name }
            : null,
        },
      })),
    [shifts, employeesById],
  );

  const model = useMemo(
    () => buildTodayHubModel({ shifts: hubShifts as any, counts, permissions }),
    [hubShifts, counts, permissions],
  );


  const go = (href: string) => navigate(href);
  const retryAll = () => { refresh(); refreshCounts(); };


  if (loading && shifts.length === 0) {
    return (
      <div className="space-y-3 p-3 md:p-6" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 md:p-6">
        <OperationalCard
          status="failed"
          statusLabel="Error de carga"
          title="No pudimos cargar la operación de hoy"
          primary={
            <p className={cn(MT.body)}>
              No se muestran datos parciales para evitar decisiones sobre información
              incompleta.
            </p>
          }
          secondary="Reintentar es seguro: esta pantalla sólo lee información."
          action={{ label: "Reintentar", onClick: retryAll, icon: RefreshCw }}
        />
      </div>
    );
  }

  /* P1 — La bandeja manda: alertas con contexto, agrupadas por servicio.
     Los KPIs sin servicio siguen siendo items de atención. */
  // Todo lo que no es puro contexto entra a la bandeja: si una alerta se
  // genera, no puede desaparecer de la pantalla.
  const inboxGroups = model.alertGroups.filter((g) => g.severity !== "info");
  const alertIds = new Set(model.alerts.map((a) => a.id));
  const attention = model.attentionItems.filter(
    (i) =>
      !alertIds.has(i.id) &&
      (i.priority === "critical" || i.priority === "high"),
  );
  const secondaryKpis = model.attentionItems.filter(
    (i) =>
      !alertIds.has(i.id) &&
      (i.priority === "medium" || i.priority === "low"),
  );
  const inboxCount =
    inboxGroups.reduce((n, g) => n + g.alerts.length, 0) + attention.length;

  /* Bloque 1 — Bandeja operativa */
  const attentionBlock =
    inboxCount > 0 ? (
      <Section
        eyebrow="Prioridad"
        title="Atención"
        helper="Qué pasó, dónde, a quién afecta y qué hacer ahora."
        count={inboxCount}
      >
        {inboxGroups.map((group) => (
          <AlertGroupBlock key={group.shiftId} group={group} go={go} />
        ))}
        {attention.map((item) => (
          <AttentionEntry key={item.id} item={item} go={go} />
        ))}
      </Section>

    ) : (
      <Section eyebrow="Estado" title={model.emptyState.headline}>
        <OperationalCard
          status="ready"
          statusLabel="Sin riesgos activos"
          leading={
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-status-success-bg text-status-success">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          }
          title={model.emptyState.headline}
          primary={<p className={cn(MT.body)}>{model.emptyState.message}</p>}
          secondary={
            model.emptyState.nextShift
              ? `Próximo: ${model.emptyState.nextShift.title} · ${model.emptyState.nextShift.timeRange} — ${model.emptyState.nextShift.startsInLabel}.`
              : undefined
          }
          action={
            model.emptyState.nextShift
              ? {
                  label: model.emptyState.nextShift.action.label,
                  onClick: () => go(model.emptyState.nextShift!.action.href),
                }
              : undefined
          }
        />
      </Section>
    );

  /* Bloque 2 — Operaciones de hoy */
  const operationsBlock = (
    <Section
      eyebrow="Hoy"
      title="Operaciones de hoy"
      helper={`${ADMIN_LEX.EntityPlural} activos y próximos, ordenados por urgencia.`}
      count={model.activeOperations.length}
    >
      {model.activeOperations.length === 0 ? (
        <OperationalCard
          status="informational"
          statusLabel="Sin operaciones activas"
          leading={
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
            </span>
          }
          title={`No hay ${ADMIN_LEX.entityPlural} activos hoy`}
          primary={
            <p className={cn(MT.body)}>
              Todos los {ADMIN_LEX.entityPlural} de hoy están cerrados o no hay programación.
            </p>
          }
          action={{ label: "Ver programación", onClick: () => go("/app/shifts") }}
        />
      ) : (
        model.activeOperations.map((op) => (
          <OcsShiftCard
            key={op.shiftId}
            title={op.title}
            clientName={op.clientName}
            locationName={op.locationName}
            timeRange={op.timeRange}
            reference={op.reference}
            status={op.status}
            statusLabel={op.statusLabel}
            assigned={op.assigned}
            slots={op.required}
            need={op.need}
            note={op.note}
            action={
              op.action
                ? { label: op.action.label, onClick: () => go(op.action!.href) }
                : undefined
            }

            actions={op.secondary.map((s) => ({
              label: s.label,
              onClick: () => go(s.href),
            }))}
          />
        ))
      )}
    </Section>
  );

  /* Bloque 3 — Equipos en riesgo */
  const teamsBlock = model.teamSummaries.length > 0 && (
    <Section
      eyebrow="Personas"
      title="Equipos en riesgo"
      helper="Dónde falta gente, confirmación o presencia."
      count={model.teamSummaries.length}
      collapsible={isMobile}
      defaultOpen={!isMobile}
    >
      {model.teamSummaries.map((t) => (
        <TeamCard
          key={t.shiftId}
          title={t.title}
          subtitle={t.attendanceLabel ? `${t.subtitle} · ${t.attendanceLabel}` : t.subtitle}
          assigned={t.assigned}
          slots={t.required}
          confirmed={t.confirmed}
          present={t.present}
          action={
            t.action
              ? { label: t.action.label, onClick: () => go(t.action!.href) }
              : undefined
          }

        />
      ))}
    </Section>
  );

  /* Bloque 4 — Listo para cerrar */
  const closeoutBlock = (
    <Section
      eyebrow="Cierre"
      title="Listo para cerrar"
      helper="Sólo la decisión siguiente. Payroll no se toca aquí."
      count={model.closeoutItems.length}
      collapsible={isMobile}
      defaultOpen={model.closeoutItems.length > 0}
    >
      {model.closeoutItems.length === 0 ? (
        <KpiCard
          label="Cierres pendientes"
          meaning="Estado de los cierres de la operación de hoy."
          status="approved"
          isEmpty
          emptyLabel={`Ningún ${ADMIN_LEX.entity} de hoy espera revisión de cierre.`}
        />
      ) : (
        model.closeoutItems.map((item) => (
          <DecisionEntry key={item.id} item={item} go={go} />
        ))
      )}
      {secondaryKpis.map((item) => (
        <AttentionEntry key={item.id} item={item} go={go} />
      ))}
    </Section>
  );

  /* Bloque 5 — Validaciones */
  const validationBlock = model.validationItems.length > 0 && (
    <Section
      eyebrow="Decisiones"
      title="Validaciones pendientes"
      count={model.validationItems.length}
      collapsible={isMobile}
      defaultOpen={!isMobile}
    >
      {model.validationItems.map((item) => (
        <DecisionEntry key={item.id} item={item} go={go} />
      ))}
    </Section>
  );

  const countsBanner = countsError && (
    <OperationalCard
      status="warning"
      statusLabel="Datos incompletos"
      leading={
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-status-warning-bg text-status-warning">
          <AlertTriangle className="h-4 w-4" />
        </span>
      }
      title="Contadores no disponibles"
      primary={<p className={cn(MT.body)}>{countsError}</p>}
      secondary="No se muestran ceros: el dato falta, no vale cero."
      action={{ label: "Reintentar", onClick: refreshCounts, icon: RefreshCw }}
    />
  );

  /* OX-4.3.1 — banner fail-closed cuando los permisos no están verificados. */
  const permissionsBanner = !permsResolved && (
    <OperationalCard
      status={permsLoading ? "informational" : "warning"}
      statusLabel={permsLoading ? "Verificando permisos" : "Permisos no verificados"}
      leading={
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-status-warning-bg text-status-warning">
          <AlertTriangle className="h-4 w-4" />
        </span>
      }
      title={
        permsLoading
          ? "Comprobando qué puedes hacer aquí"
          : "No pudimos confirmar tus permisos"
      }
      primary={
        <p className={cn(MT.body)}>
          {permsLoading
            ? "Mientras tanto sólo se muestra información: las acciones que cambian la operación están ocultas."
            : "Para evitar acciones no autorizadas, esta vista queda en modo lectura."}
        </p>
      }
      secondary="La información mostrada corresponde únicamente a la compañía seleccionada."
    />
  );


  if (isMobile) {
    return (
      <div className="space-y-5 px-3 pb-[calc(env(safe-area-inset-bottom)+84px)] pt-1">
        {permissionsBanner}
        {countsBanner}
        {attentionBlock}
        {operationsBlock}
        {teamsBlock}
        {closeoutBlock}
        {validationBlock}

        {model.primaryAction && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 backdrop-blur">
            <p className={cn(MT.caption, "mb-1 truncate text-muted-foreground")}>
              {model.primaryAction.reason}
            </p>
            <Button
              className={cn(TAP, "w-full")}
              onClick={() => go(model.primaryAction!.href)}
            >
              {model.primaryAction.label}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 px-6 pb-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {permissionsBanner}
        {countsBanner}
        {attentionBlock}
        {operationsBlock}
        {teamsBlock}
      </div>
      <div className="space-y-6">
        {closeoutBlock}
        {validationBlock}
      </div>
    </div>
  );
}
