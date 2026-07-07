/**
 * OpsHome — Unified Operations Cockpit (/app/ops)
 *
 * Spanish-first, mobile-first, desktop-friendly single-screen cockpit that
 * composes existing operational signals into 9 action cards. This page is a
 * pure SHELL that reuses existing hooks (`useTodayOperations`) and deep-links
 * to the canonical destination pages. It never writes and never computes
 * payroll.
 *
 * Hard rules:
 *  - No writes anywhere. No RLS/auth/edge/tenant changes.
 *  - No new business logic beyond safe presentational derivations.
 *  - Scheduled hours are NEVER worked hours. Payroll source stays
 *    Connecteam/reconciliation — surfaced via PayrollSourceGuardrailBanner.
 */
import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  RefreshCw,
  Repeat,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useTodayOperations, type TodayOpsShift } from "@/hooks/useTodayOperations";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PayrollSourceGuardrailBanner } from "@/components/payroll/PayrollSourceGuardrailBanner";
import Upcoming60Sheet from "@/components/ops/Upcoming60Sheet";

type CardTone = "ok" | "attention" | "urgent" | "info" | "muted";

interface OpsCardProps {
  title: string;
  count: number | string;
  hint?: string;
  tone?: CardTone;
  icon: React.ReactNode;
  to: string;
  cta?: string;
  empty?: string;
  footer?: React.ReactNode;
}

const TONE: Record<CardTone, { ring: string; badge: string; num: string }> = {
  ok:        { ring: "border-emerald-300/50 dark:border-emerald-400/20", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", num: "text-emerald-700 dark:text-emerald-300" },
  attention: { ring: "border-amber-300/60 dark:border-amber-400/30",     badge: "bg-amber-500/10 text-amber-800 dark:text-amber-200",       num: "text-amber-700 dark:text-amber-200" },
  urgent:    { ring: "border-destructive/40",                            badge: "bg-destructive/10 text-destructive",                       num: "text-destructive" },
  info:      { ring: "border-primary/30",                                badge: "bg-primary/10 text-primary",                               num: "text-primary" },
  muted:     { ring: "border-border/60",                                 badge: "bg-muted text-muted-foreground",                           num: "text-foreground" },
};

function OpsCard({ title, count, hint, tone = "muted", icon, to, cta = "Abrir", empty, footer }: OpsCardProps) {
  const t = TONE[tone];
  const isEmpty = count === 0 || count === "0";
  return (
    <Link
      to={to}
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card p-4 transition-all hover:bg-accent/40 hover:shadow-sm min-h-[128px]",
        t.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", t.badge)}>
            {icon}
          </span>
          <span className="text-[13px] font-semibold text-foreground truncate">{title}</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn("text-3xl font-bold tabular-nums leading-none", t.num)}>{count}</span>
        {hint && <span className="text-[11px] text-muted-foreground truncate">{hint}</span>}
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {isEmpty && empty ? empty : cta}
        </span>
        {footer}
      </div>
    </Link>
  );
}

function CockpitSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {caption && <span className="text-[11px] text-muted-foreground">{caption}</span>}
      </div>
      {children}
    </section>
  );
}

/** Presentational: shift missing operational fields. Read-only derivation. */
function isIncompleteShift(s: TodayOpsShift): boolean {
  const missingLocation = !s.location_id && !s.job_site_name;
  const missingMeeting = !s.meeting_point_location_id && !s.meeting_point;
  const missingClient = !s.client_id && !s.client_name;
  // pay_rate not present in TodayOpsShift; incomplete = missing site OR meeting OR client
  return missingLocation || missingMeeting || missingClient;
}

export default function OpsHome() {
  const navigate = useNavigate();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  const todayOps = useTodayOperations(selectedCompanyId ?? null, today);
  const tomorrowOps = useTodayOperations(selectedCompanyId ?? null, tomorrow);

  // Lightweight, safe read-only query for today's rejected assignments.
  // Scoped to today's shift ids that already loaded — one small IN() query.
  const [rejectedCount, setRejectedCount] = useState<number | null>(null);
  const [upcomingSheetOpen, setUpcomingSheetOpen] = useState(false);
  const todayShiftIdsKey = todayOps.shifts.map((s) => s.id).join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = todayShiftIdsKey ? todayShiftIdsKey.split(",") : [];
    if (!selectedCompanyId || ids.length === 0) {
      setRejectedCount(0);
      return;
    }
    (async () => {
      const { count, error } = await supabase
        .from("shift_assignments")
        .select("id", { count: "exact", head: true })
        .in("shift_id", ids)
        .eq("status", "rejected");
      if (cancelled) return;
      setRejectedCount(error ? null : (count ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, todayShiftIdsKey]);

  const t = todayOps.totals;

  // Derive counts safely from already-loaded state — no extra heavy queries.
  const acceptedCount = t.confirmed;
  const pendingCount = Math.max(t.assigned - t.confirmed, 0);
  const needsCloseout = todayOps.shifts.filter((s) => s.ops.bucket === "needs_closeout").length;
  const urgentReplacements = todayOps.shifts.filter(
    (s) => s.ops.bucket === "needs_staff" && s.publication_status === "published",
  ).length;
  const incompleteToday = todayOps.shifts.filter(isIncompleteShift).length;
  const incompleteTomorrow = tomorrowOps.shifts.filter(isIncompleteShift).length;
  const lateOrNoShow = t.not_clocked_in + t.missing_clock_outs;
  const hoursToReview = t.open_clocks + t.missing_clock_outs;

  const anyLoading = todayOps.loading || tomorrowOps.loading;
  const todayLabel = format(today, "EEEE d 'de' MMMM", { locale: es });

  // Sprint 3: "Próximos 60 min" — presentational derivation from already-loaded
  // today's shifts. No new query. Uses date + start_time text as-is.
  const upcoming60 = useMemo(() => {
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 60_000);
    const items = todayOps.shifts.filter((s) => {
      const start = new Date(`${s.date}T${s.start_time}`);
      return start >= now && start <= in60;
    });
    const covered = items.filter((s) => s.ops.assigned_active >= (s.slots ?? 1)).length;
    const needsAttention = items.length - covered;
    return { total: items.length, covered, needsAttention };
  }, [todayOps.shifts]);


  return (
    <div className="space-y-5 max-w-[1400px]">
      <PageHeader
        variant="3"
        title="Operaciones"
        subtitle="Centro principal para revisar cobertura, asistencia, cierre y payroll review."
        rightSlot={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => navigate("/app/shifts")}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Programación
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => {
                todayOps.refresh();
                tomorrowOps.refresh();
              }}
              title="Actualizar"
            >
              <RefreshCw className={cn("h-4 w-4", anyLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* Mini operational header: company + date + short guardrail */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-semibold text-foreground">
          <ShieldCheck className="h-3 w-3 text-primary" />
          {selectedCompany?.name ?? "Sin compañía"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 capitalize">
          <CalendarDays className="h-3 w-3" />
          {todayLabel}
        </span>
        <PayrollSourceGuardrailBanner variant="compact" />
      </div>

      {!selectedCompanyId ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-16 text-center">
          <p className="text-sm font-semibold text-foreground">Sin compañía seleccionada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Elige una compañía en la barra superior para ver la operación.
          </p>
        </div>
      ) : (
        <>
          {/* Cobertura */}
          <CockpitSection
            title="Cobertura"
            caption={anyLoading ? "Cargando…" : `${t.shifts} hoy · ${tomorrowOps.totals.shifts} mañana`}
          >
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <OpsCard
                title="Turnos de hoy"
                count={t.shifts}
                hint={`${t.assigned}/${t.required} slots`}
                tone={t.shifts === 0 ? "muted" : t.assigned < t.required ? "attention" : "ok"}
                icon={<CalendarDays className="h-4 w-4" />}
                to="/app/shifts?when=today"
                cta="Ver hoy"
                empty="Sin turnos hoy"
              />
              <OpsCard
                title="Turnos de mañana"
                count={tomorrowOps.totals.shifts}
                hint={`${tomorrowOps.totals.assigned}/${tomorrowOps.totals.required} slots`}
                tone={
                  tomorrowOps.totals.shifts === 0
                    ? "muted"
                    : tomorrowOps.totals.assigned < tomorrowOps.totals.required
                    ? "attention"
                    : "ok"
                }
                icon={<CalendarDays className="h-4 w-4" />}
                to="/app/shifts?when=tomorrow"
                cta="Ver mañana"
                empty="Sin turnos mañana"
              />
              <OpsCard
                title="Necesitan staff"
                count={t.needs_staff}
                hint={t.needs_staff > 0 ? "Slots abiertos" : "Todo cubierto"}
                tone={t.needs_staff > 0 ? "attention" : "ok"}
                icon={<UserPlus className="h-4 w-4" />}
                to="/app/staffing-center?filter=needs-staffing"
                cta="Ir a staffing"
                empty="Todo cubierto"
              />
              <OpsCard
                title="Reemplazos urgentes"
                count={urgentReplacements}
                hint={urgentReplacements > 0 ? "Publicados sin personal" : "Sin urgencias"}
                tone={urgentReplacements > 0 ? "urgent" : "ok"}
                icon={<Repeat className="h-4 w-4" />}
                to="/app/staffing-center?filter=needs-staffing"
                cta="Buscar cobertura"
                empty="Sin urgencias"
              />
            </div>
          </CockpitSection>

          {/* Próximos 60 min */}
          <CockpitSection
            title="Próximos 60 minutos"
            caption={upcoming60.total > 0 ? `${upcoming60.total} turnos iniciando pronto` : undefined}
          >
            {upcoming60.total === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground">
                  No hay turnos iniciando en los próximos 60 minutos.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 grid-cols-3">
                  <OpsCard
                    title="Turnos próximos"
                    count={upcoming60.total}
                    hint="Inician en ≤ 60 min"
                    tone="info"
                    icon={<Clock className="h-4 w-4" />}
                    to="/app/shifts?when=today"
                    cta="Ver hoy"
                  />
                  <OpsCard
                    title="Con cobertura"
                    count={upcoming60.covered}
                    hint="Slots completos"
                    tone={upcoming60.covered === upcoming60.total ? "ok" : "muted"}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    to="/app/daily-ops?when=today"
                    cta="Operación diaria"
                  />
                  <OpsCard
                    title="Necesitan atención"
                    count={upcoming60.needsAttention}
                    hint={upcoming60.needsAttention > 0 ? "Slots abiertos" : "Todo cubierto"}
                    tone={upcoming60.needsAttention > 0 ? "urgent" : "ok"}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    to="/app/staffing-center?filter=needs-staffing"
                    cta="Buscar cobertura"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setUpcomingSheetOpen(true)}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Revisar próximos turnos
                  </Button>
                </div>
              </>
            )}
          </CockpitSection>


          {/* Asistencia */}
          <CockpitSection title="Asistencia" caption="Estado en tiempo real de hoy">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <OpsCard
                title="Aceptados / Pendientes / Rechazados"
                count={`${acceptedCount} / ${pendingCount} / ${rejectedCount ?? "—"}`}
                hint={`${t.assigned} asignados hoy`}
                tone={pendingCount > 0 || (rejectedCount ?? 0) > 0 ? "attention" : "ok"}
                icon={<UserCheck className="h-4 w-4" />}
                to="/app/daily-ops?when=today"
                cta="Ver operación diaria"
                empty="Sin asignaciones"
                footer={
                  rejectedCount === null ? (
                    <Badge variant="outline" className="text-[10px] h-5">
                      rechazados no disponibles
                    </Badge>
                  ) : null
                }
              />
              <OpsCard
                title="Fichados ahora"
                count={t.clocked_in_now}
                hint={`${t.open_clocks} clocks abiertos`}
                tone={t.clocked_in_now > 0 ? "info" : "muted"}
                icon={<Clock className="h-4 w-4" />}
                to="/app/timeclock?when=today&filter=open"
                cta="Abrir reloj"
                empty="Nadie fichado"
              />
              <OpsCard
                title="No-shows / tardanzas"
                count={lateOrNoShow}
                hint={
                  lateOrNoShow > 0
                    ? `${t.not_clocked_in} sin entrada · ${t.missing_clock_outs} sin salida`
                    : "Sin alertas"
                }
                tone={lateOrNoShow > 0 ? "urgent" : "ok"}
                icon={<AlertTriangle className="h-4 w-4" />}
                to="/app/attendance?when=today&filter=no-shows"
                cta="Ver asistencia"
                empty="Sin alertas"
              />
              <OpsCard
                title="Turnos incompletos"
                count={incompleteToday}
                hint={
                  incompleteTomorrow > 0
                    ? `+${incompleteTomorrow} mañana · rate no disponible en esta vista`
                    : "Rate no disponible en esta vista todavía"
                }
                tone={incompleteToday > 0 ? "attention" : "ok"}
                icon={<ClipboardList className="h-4 w-4" />}
                to="/app/shifts?filter=incomplete"
                cta="Revisar detalles"
                empty="Todos completos"
                footer={
                  incompleteToday > 0 ? (
                    <Badge variant="outline" className="text-[10px] h-5">
                      falta sitio · meeting · cliente
                    </Badge>
                  ) : null
                }
              />
            </div>
          </CockpitSection>

          {/* Cierre y Payroll */}
          <CockpitSection title="Cierre y Payroll" caption="Validación operativa — sin cálculo nativo de pago">
            <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
              <OpsCard
                title="Pendientes de closeout"
                count={needsCloseout}
                hint={needsCloseout > 0 ? "Turnos con clock abierto tras el fin" : "Todo cerrado"}
                tone={needsCloseout > 0 ? "attention" : "ok"}
                icon={<CheckCircle2 className="h-4 w-4" />}
                to="/app/payroll-review-queue"
                cta="Ir al Centro de Validación"
                empty="Todo cerrado"
              />
              <OpsCard
                title="Horas por revisar"
                count={hoursToReview}
                hint={
                  hoursToReview > 0
                    ? `${t.open_clocks} abiertos · ${t.missing_clock_outs} sin salida`
                    : "Nada pendiente"
                }
                tone={hoursToReview > 0 ? "attention" : "ok"}
                icon={<ClipboardCheck className="h-4 w-4" />}
                to="/app/payroll-review-queue"
                cta="Revisar horas"
                empty="Nada pendiente"
              />
              <OpsCard
                title="Reconciliación payroll"
                count={t.shifts > 0 ? "Connecteam" : "—"}
                hint="Fuente actual de pago"
                tone="info"
                icon={<Users className="h-4 w-4" />}
                to="/app/payroll-reconciliation"
                cta="Abrir reconciliación"
                empty="Sin datos"
              />
            </div>

            <PayrollSourceGuardrailBanner className="mt-1" />
          </CockpitSection>
        </>
      )}
    </div>
  );
}
