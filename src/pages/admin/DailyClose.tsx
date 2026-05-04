import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, addDays, subDays, startOfDay, endOfDay, isToday, isFuture } from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  CalendarCheck2,
  AlertTriangle,
  FileWarning,
  Wallet,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

/**
 * /app/daily-close — Phase 1 (read-only, no writes).
 *
 * Reads:
 *   - time_entries  (clock_in, clock_out, status)
 *   - scheduled_shifts (date, deleted_at, slots, status, publication_status)
 *   - shift_assignments (shift_id, status, attendance_status)
 *
 * Strict no-write:
 *   - No "Mark Closed" button.
 *   - No mutations to time_entries / scheduled_shifts / shift_assignments / payroll.
 *   - No notifications.
 *   - No daily_close table created.
 *   - Documents + Incidents intentionally rendered as "Pendiente de conectar".
 */

type CheckStatus = "ok" | "review" | "pending_source" | "neutral";

interface SectionState {
  status: CheckStatus;
  primary: string; // big number / phrase
  detail: string;  // 1-line explanation
  examples?: string[]; // up to 2
  href?: string;
  ctaLabel?: string;
}

const STATUS_TONE: Record<CheckStatus, { dot: string; ring: string; iconBg: string; chip: string; label: string; icon: typeof CheckCircle2 }> = {
  ok: {
    dot: "bg-emerald-500",
    ring: "ring-1 ring-emerald-500/20",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    label: "OK",
    icon: CheckCircle2,
  },
  review: {
    dot: "bg-amber-500",
    ring: "ring-1 ring-amber-500/30",
    iconBg: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    label: "Revisar",
    icon: AlertCircle,
  },
  pending_source: {
    dot: "bg-muted-foreground/40",
    ring: "ring-1 ring-border",
    iconBg: "bg-muted text-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
    label: "Pendiente",
    icon: CircleDashed,
  },
  neutral: {
    dot: "bg-muted-foreground/40",
    ring: "ring-1 ring-border",
    iconBg: "bg-muted text-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
    label: "—",
    icon: CircleDashed,
  },
};

type DayState = "open" | "needs_review" | "ready";

const DAY_STATE_STYLE: Record<DayState, { label: string; chip: string }> = {
  open: { label: "Abierto", chip: "bg-muted text-muted-foreground border-border" },
  needs_review: {
    label: "Necesita revisión",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  ready: {
    label: "Listo para revisión de payroll",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
};

interface SnapshotData {
  loading: boolean;
  error: string | null;
  attendance: SectionState;
  shifts: SectionState;
  staffing: SectionState;
}

function emptySection(): SectionState {
  return { status: "neutral", primary: "—", detail: "Cargando…" };
}

export default function DailyClose() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [date, setDate] = useState<Date>(new Date());
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [snap, setSnap] = useState<SnapshotData>({
    loading: true,
    error: null,
    attendance: emptySection(),
    shifts: emptySection(),
    staffing: emptySection(),
  });

  const dayKey = useMemo(() => format(date, "yyyy-MM-dd"), [date]);
  const isCurrent = isToday(date);
  const isUpcoming = isFuture(startOfDay(date)) && !isCurrent;

  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId) {
      setSnap({
        loading: false,
        error: null,
        attendance: { status: "neutral", primary: "—", detail: "Selecciona una empresa." },
        shifts: { status: "neutral", primary: "—", detail: "Selecciona una empresa." },
        staffing: { status: "neutral", primary: "—", detail: "Selecciona una empresa." },
      });
      return;
    }

    setSnap((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const dayStart = startOfDay(date).toISOString();
        const dayEnd = endOfDay(date).toISOString();

        // 1) Time entries with clock_in inside the selected day.
        const { data: entries, error: errEntries } = await supabase
          .from("time_entries")
          .select("id, employee_id, clock_in, clock_out, status, shift_id")
          .eq("company_id", selectedCompanyId)
          .gte("clock_in", dayStart)
          .lte("clock_in", dayEnd);

        if (errEntries) throw errEntries;

        // 2) Shifts of the day.
        const { data: shifts, error: errShifts } = await supabase
          .from("scheduled_shifts")
          .select("id, title, slots, status, publication_status, deleted_at, start_time")
          .eq("company_id", selectedCompanyId)
          .eq("date", dayKey)
          .is("deleted_at", null);

        if (errShifts) throw errShifts;

        const shiftIds = (shifts ?? []).map((s) => s.id);

        // 3) Active assignments for those shifts.
        let assignments: Array<{ shift_id: string; status: string }> = [];
        if (shiftIds.length > 0) {
          const { data: asg, error: errAsg } = await supabase
            .from("shift_assignments")
            .select("shift_id, status")
            .in("shift_id", shiftIds);
          if (errAsg) throw errAsg;
          assignments = asg ?? [];
        }

        if (cancelled) return;

        // ---- Attendance ----
        const totalEntries = entries?.length ?? 0;
        const openEntries = (entries ?? []).filter((e) => e.clock_out === null);
        const openCount = openEntries.length;

        const attendance: SectionState = (() => {
          if (totalEntries === 0) {
            return {
              status: isUpcoming ? "neutral" : "ok",
              primary: "0",
              detail: isUpcoming
                ? "Día futuro. Sin asistencia aún."
                : "No hay asistencia registrada en este día.",
              href: "/app/timeclock",
              ctaLabel: "Ver timeclock",
            };
          }
          if (openCount > 0) {
            return {
              status: "review",
              primary: `${openCount} sin cerrar`,
              detail: `${totalEntries} clock-ins · ${openCount} sin clock-out.`,
              examples: openEntries.slice(0, 2).map((e) => `Entry ${e.id.slice(0, 8)} · desde ${format(new Date(e.clock_in), "p")}`),
              href: "/app/timeclock",
              ctaLabel: "Ver entradas abiertas",
            };
          }
          return {
            status: "ok",
            primary: `${totalEntries}`,
            detail: "Todas las entradas tienen clock-out.",
            href: "/app/timeclock",
            ctaLabel: "Ver timeclock",
          };
        })();

        // ---- Shifts ----
        const shiftRows = shifts ?? [];
        const shiftsTotal = shiftRows.length;
        const shiftsCancelled = shiftRows.filter((s) => s.status === "cancelled").length;
        const shiftsActive = shiftRows.filter((s) => s.status !== "cancelled");

        const shiftsSection: SectionState = (() => {
          if (shiftsTotal === 0) {
            return {
              status: "neutral",
              primary: "0",
              detail: "Sin turnos programados este día.",
              href: "/app/shifts",
              ctaLabel: "Ver turnos",
            };
          }
          return {
            status: "ok",
            primary: `${shiftsTotal}`,
            detail: shiftsCancelled > 0
              ? `${shiftsActive.length} activos · ${shiftsCancelled} cancelados.`
              : `${shiftsActive.length} turnos activos.`,
            examples: shiftRows.slice(0, 2).map((s) => `${s.title} · ${s.start_time?.slice(0, 5) ?? ""}`),
            href: "/app/shifts",
            ctaLabel: "Ver turnos",
          };
        })();

        // ---- Staffing ----
        // Active assignments per shift; gap = slots - active.
        const ACTIVE_STATUSES = new Set(["pending", "accepted", "confirmed"]);
        const activeByShift = new Map<string, number>();
        for (const a of assignments) {
          if (ACTIVE_STATUSES.has(a.status)) {
            activeByShift.set(a.shift_id, (activeByShift.get(a.shift_id) ?? 0) + 1);
          }
        }

        const gaps: Array<{ title: string; gap: number; slots: number }> = [];
        for (const s of shiftsActive) {
          const slots = s.slots ?? 0;
          const active = activeByShift.get(s.id) ?? 0;
          if (slots > 0 && active < slots) {
            gaps.push({ title: s.title, gap: slots - active, slots });
          } else if (slots === 0 && active === 0) {
            gaps.push({ title: s.title, gap: 0, slots: 0 });
          }
        }

        const totalGapSlots = gaps.reduce((acc, g) => acc + g.gap, 0);
        const unstaffedShifts = gaps.filter((g) => g.gap === g.slots && g.slots > 0).length;

        const staffing: SectionState = (() => {
          if (shiftsActive.length === 0) {
            return {
              status: "neutral",
              primary: "—",
              detail: "Sin turnos activos para evaluar.",
              href: "/app/shifts",
              ctaLabel: "Ver turnos",
            };
          }
          if (gaps.length === 0) {
            return {
              status: "ok",
              primary: "Cubierto",
              detail: `${shiftsActive.length} turnos cubiertos al 100%.`,
              href: "/app/shifts",
              ctaLabel: "Ver turnos",
            };
          }
          return {
            status: "review",
            primary: `${gaps.length} con gaps`,
            detail: unstaffedShifts > 0
              ? `${unstaffedShifts} turnos sin nadie · ${totalGapSlots} cupos abiertos.`
              : `${totalGapSlots} cupos abiertos.`,
            examples: gaps.slice(0, 2).map((g) => `${g.title} · ${g.gap}/${g.slots} sin cubrir`),
            href: "/app/shifts",
            ctaLabel: "Abrir staffing",
          };
        })();

        setSnap({
          loading: false,
          error: null,
          attendance,
          shifts: shiftsSection,
          staffing,
        });
      } catch (err: any) {
        if (!cancelled) {
          setSnap((s) => ({ ...s, loading: false, error: err?.message ?? "Error cargando datos" }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, dayKey, date, isUpcoming]);

  // Static (Phase 1) — sources not yet wired.
  const incidents: SectionState = {
    status: "pending_source",
    primary: "Pendiente",
    detail: "Pendiente de conectar fuente confiable de incidentes.",
  };
  const documents: SectionState = {
    status: "pending_source",
    primary: "Pendiente",
    detail: "Pendiente de conectar señal de documentos por día trabajado.",
    href: "/app/documents",
    ctaLabel: "Ver documentos",
  };

  // Payroll readiness — derived from attendance (real time_entries only).
  const payroll: SectionState = useMemo(() => {
    if (snap.loading) return { status: "neutral", primary: "—", detail: "Calculando…" };
    if (snap.attendance.status === "review") {
      return {
        status: "review",
        primary: "Faltan validaciones",
        detail: "Hay clock-ins sin cerrar. Cierra entradas antes de revisar payroll.",
        href: "/app/timeclock",
        ctaLabel: "Cerrar entradas",
      };
    }
    if (snap.attendance.primary === "0" && !isUpcoming) {
      return {
        status: "neutral",
        primary: "Sin actividad",
        detail: "No hay time_entries reales en este día.",
      };
    }
    if (snap.attendance.status === "ok" && snap.staffing.status !== "review") {
      return {
        status: "ok",
        primary: "Datos suficientes",
        detail: "time_entries del día completas. Listo para revisión manual de payroll.",
        href: "/app/payroll-reconciliation",
        ctaLabel: "Ir a reconciliación",
      };
    }
    return {
      status: "review",
      primary: "Faltan validaciones",
      detail: "Hay turnos con staffing incompleto que pueden requerir validación de asistencia.",
      href: "/app/payroll-reconciliation",
      ctaLabel: "Ir a reconciliación",
    };
  }, [snap.loading, snap.attendance, snap.staffing, isUpcoming]);

  const dayState: DayState = useMemo(() => {
    if (snap.loading) return "open";
    if (isCurrent || isUpcoming) {
      // Current/future day stays Open unless blockers exist.
      const hasBlocker = [snap.attendance, snap.staffing].some((s) => s.status === "review");
      return hasBlocker ? "needs_review" : "open";
    }
    // Past day:
    const hasBlocker = [snap.attendance, snap.staffing, payroll].some((s) => s.status === "review");
    if (hasBlocker) return "needs_review";
    return "ready";
  }, [snap.loading, snap.attendance, snap.staffing, payroll, isCurrent, isUpcoming]);

  const dayStateStyle = DAY_STATE_STYLE[dayState];

  // Section count for header summary
  const allSections = [snap.shifts, snap.staffing, snap.attendance, incidents, documents, payroll];
  const okCount = allSections.filter((s) => s.status === "ok").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Operación diaria
              <Badge variant="outline" className="ml-1 border-dashed text-[10px]">
                Fase 1 · Solo lectura
              </Badge>
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Cierre diario
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {format(date, "EEEE d 'de' MMMM 'de' yyyy")}
              {selectedCompany?.name ? ` · ${selectedCompany.name}` : ""}
            </p>
          </div>

          {/* Date controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDate((d) => subDays(d, 1))}
              aria-label="Día anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("min-w-[200px] justify-start text-left font-normal")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "PP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) {
                      setDate(d);
                      setPopoverOpen(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDate((d) => addDays(d, 1))}
              aria-label="Día siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant={isCurrent ? "default" : "ghost"}
              size="sm"
              onClick={() => setDate(new Date())}
            >
              Hoy
            </Button>
          </div>
        </div>

        {/* Day state hero */}
        <Card className="mb-12 overflow-hidden">
          <div className="flex flex-col gap-5 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <div className={cn("rounded-xl p-3", STATUS_TONE[dayState === "ready" ? "ok" : dayState === "needs_review" ? "review" : "neutral"].iconBg)}>
                {dayState === "ready" ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : dayState === "needs_review" ? (
                  <AlertCircle className="h-6 w-6" />
                ) : (
                  <CircleDashed className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge variant="outline" className={cn("font-medium", dayStateStyle.chip)}>
                    {dayStateStyle.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {okCount} / {allSections.length} secciones OK
                  </span>
                </div>
                <h2 className="font-display text-xl font-semibold">
                  {dayState === "ready" && "El día tiene datos suficientes para revisión de payroll."}
                  {dayState === "needs_review" && "El día tiene validaciones pendientes."}
                  {dayState === "open" && (isUpcoming
                    ? "Día futuro. Sin actividad operativa aún."
                    : "El día está en curso. Aún no se evalúa cierre.")}
                </h2>
                <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                  Esta vista es solo lectura. No cierra payroll, no modifica time_entries, no manda notificaciones.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <Button asChild variant="outline">
                <Link to="/app/needs-attention">
                  Ver Needs Attention
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>

        {/* Error */}
        {snap.error && (
          <Card className="mb-6 border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">
              Error cargando datos: {snap.error}
            </CardContent>
          </Card>
        )}

        {/* Checklist */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <CheckCard
            title="Turnos"
            category="Programación"
            icon={CalendarCheck2}
            state={snap.shifts}
            loading={snap.loading}
          />
          <CheckCard
            title="Staffing"
            category="Cobertura"
            icon={Users}
            state={snap.staffing}
            loading={snap.loading}
          />
          <CheckCard
            title="Asistencia"
            category="Tiempo y asistencia"
            icon={Clock}
            state={snap.attendance}
            loading={snap.loading}
          />
          <CheckCard
            title="Incidentes"
            category="Operaciones"
            icon={AlertTriangle}
            state={incidents}
            loading={false}
          />
          <CheckCard
            title="Documentos"
            category="Cumplimiento"
            icon={FileWarning}
            state={documents}
            loading={false}
          />
          <CheckCard
            title="Payroll readiness"
            category="Revisión de payroll"
            icon={Wallet}
            state={payroll}
            loading={snap.loading}
            footnote="Se basa solo en time_entries reales. Nunca usa scheduled hours."
          />
        </div>

        {/* Footer */}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Fase 1 · Solo lectura · Sin escrituras · Sin sello "Closed" todavía.
        </p>
      </div>
    </div>
  );
}

function CheckCard({
  title,
  category,
  icon: Icon,
  state,
  loading,
  footnote,
}: {
  title: string;
  category: string;
  icon: typeof Clock;
  state: SectionState;
  loading: boolean;
  footnote?: string;
}) {
  const tone = STATUS_TONE[state.status];
  const StatusIcon = tone.icon;

  return (
    <Card className={cn("overflow-hidden bg-card transition-all", tone.ring)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("rounded-lg p-2", tone.iconBg)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {tone.label}
            </span>
          </div>
        </div>
        <div className="mt-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {category}
          </div>
          <CardTitle className="mt-1 text-base font-semibold leading-snug">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div>
          <div className="font-mono text-xl font-semibold tabular-nums">
            {loading ? "…" : state.primary}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{state.detail}</p>
        </div>

        {state.examples && state.examples.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-dashed border-border/60 bg-muted/30 p-2.5">
            {state.examples.slice(0, 2).map((ex, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("h-1 w-1 rounded-full opacity-60", tone.dot)} />
                <span className="truncate">{ex}</span>
              </div>
            ))}
          </div>
        )}

        {state.href && state.ctaLabel && (
          <Button asChild variant="outline" size="sm" className="w-full justify-between">
            <Link to={state.href}>
              {state.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}

        {footnote && (
          <p className="text-[11px] text-muted-foreground/80">{footnote}</p>
        )}
      </CardContent>
    </Card>
  );
}
