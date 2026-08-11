/**
 * LiveShiftBoard — "Turno en vivo".
 *
 * Read-only composition panel that turns an active shift into a calm,
 * grouped command board. Workers are split by operational state so
 * admins/captains can scan the shift in 5 seconds without jumping
 * across Daily Ops, Time Clock, Attendance or Shift Detail.
 *
 * Hard rules:
 *  - NEVER writes. No time_entries, no payroll, no notifications.
 *  - Scheduled hours are never represented as worked hours.
 *  - Realtime subscribes to time_entries scoped to this shift only.
 *  - Spanish-first.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { deriveAttendanceTruth } from "@/lib/shifts/attendance-truth";
import { differenceInMinutes, format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  ShieldCheck,
  UserMinus,
  UserRound,
  UserX,
  Car,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { IdentityBadges } from "@/components/employee/IdentityBadges";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { isEmployeeDriver } from "./types";
import type { Assignment, Employee } from "./types";
import { CorrectionRequestDialog } from "./corrections/CorrectionRequestDialog";
import type { CorrectionType } from "@/lib/shifts/time-corrections";

interface Props {
  shiftId: string;
  companyId: string;
  shiftDate: string;          // yyyy-MM-dd
  startTime: string;          // HH:mm[:ss]
  endTime: string;            // HH:mm[:ss]
  slots: number;
  assignments: Assignment[];  // pre-loaded by parent
  employees: Employee[];      // pre-loaded by parent
  shiftAdminId?: string | null;
  /** When true, render "Corregir fichaje" actions on each worker card. */
  canManage?: boolean;
  className?: string;
}

type TE = {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
};

type WorkerRow = {
  employee: Employee;
  assignmentStatus: string;       // pending | confirmed | accepted | rejected | removed | extra
  responseStatus?: string | null;
  clockIn: string | null;
  clockOut: string | null;
  isAdmin: boolean;
  isDriver: boolean;
  bucket:
    | "active"
    | "no_clockin"
    | "missing_clockout"
    | "completed"
    | "pending"
    | "rejected"
    | "extra";
  warning?: string;
};

const CLOSEOUT_GRACE_MIN = 30;

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "HH:mm"); } catch { return "—"; }
}

export function LiveShiftBoard({
  shiftId, companyId, shiftDate, startTime, endTime, slots,
  assignments, employees, shiftAdminId, canManage = false, className,
}: Props) {
  const [entries, setEntries] = useState<TE[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch time_entries scoped to this shift only (no payroll touch).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out")
        .eq("shift_id", shiftId)
        .in("status", ["pending", "approved"]);
      if (cancelled) return;
      setEntries((data ?? []) as TE[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [shiftId]);

  // Realtime: refetch on any change to time_entries for this shift.
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`live-shift-${shiftId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `shift_id=eq.${shiftId}`,
        },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [shiftId]);

  // When realtime ticks, refetch entries.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("id, employee_id, shift_id, clock_in, clock_out")
        .eq("shift_id", shiftId)
        .in("status", ["pending", "approved"]);
      if (cancelled) return;
      setEntries((data ?? []) as TE[]);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const shiftEnd = useMemo(() => {
    const start = new Date(`${shiftDate}T${startTime}`);
    const end = new Date(`${shiftDate}T${endTime}`);
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
    return end;
  }, [shiftDate, startTime, endTime]);
  const pastEnd = differenceInMinutes(now, shiftEnd) > 0;

  const empById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const shiftAsgns = useMemo(
    () => assignments.filter((a) => a.shift_id === shiftId),
    [assignments, shiftId],
  );
  const teByEmp = useMemo(() => {
    const m = new Map<string, TE>();
    for (const e of entries) {
      const prev = m.get(e.employee_id);
      if (!prev || (e.clock_in && (!prev.clock_in || e.clock_in < prev.clock_in))) {
        m.set(e.employee_id, e);
      }
    }
    return m;
  }, [entries]);

  const rows: WorkerRow[] = useMemo(() => {
    const out: WorkerRow[] = [];
    const assignedEmpIds = new Set(shiftAsgns.map((a) => a.employee_id));

    for (const a of shiftAsgns) {
      const emp = empById.get(a.employee_id);
      if (!emp) continue;
      const te = teByEmp.get(a.employee_id);
      const isAdmin = shiftAdminId === a.employee_id;
      const isDriver = isEmployeeDriver(emp);
      const respStatus = (a as any).response_status ?? null;

      let bucket: WorkerRow["bucket"] = "pending";
      let warning: string | undefined;

      if (a.status === "rejected" || a.status === "removed") {
        bucket = "rejected";
      } else if (te?.clock_in && te?.clock_out) {
        bucket = "completed";
      } else if (te?.clock_in && !te?.clock_out) {
        if (
          pastEnd &&
          differenceInMinutes(now, shiftEnd) > CLOSEOUT_GRACE_MIN
        ) {
          bucket = "missing_clockout";
          warning = "Sin salida";
        } else {
          bucket = "active";
        }
      } else if (a.status === "confirmed" || a.status === "accepted") {
        if (now >= new Date(`${shiftDate}T${startTime}`)) {
          bucket = "no_clockin";
          warning = "Falta clock-in";
        } else {
          bucket = "pending";
        }
      } else {
        bucket = "pending";
      }

      out.push({
        employee: emp,
        assignmentStatus: a.status,
        responseStatus: respStatus,
        clockIn: te?.clock_in ?? null,
        clockOut: te?.clock_out ?? null,
        isAdmin,
        isDriver,
        bucket,
        warning,
      });
    }

    // Extras: time_entries linked to this shift for employees NOT assigned.
    for (const te of entries) {
      if (assignedEmpIds.has(te.employee_id)) continue;
      const emp = empById.get(te.employee_id);
      if (!emp) continue;
      out.push({
        employee: emp,
        assignmentStatus: "extra",
        responseStatus: null,
        clockIn: te.clock_in,
        clockOut: te.clock_out,
        isAdmin: false,
        isDriver: isEmployeeDriver(emp),
        bucket: "extra",
        warning: "Extra sin asignar",
      });
    }
    return out;
  }, [shiftAsgns, teByEmp, entries, empById, shiftAdminId, shiftDate, startTime, shiftEnd, pastEnd]);

  const groups = useMemo(() => {
    const g: Record<WorkerRow["bucket"], WorkerRow[]> = {
      active: [], no_clockin: [], missing_clockout: [],
      completed: [], pending: [], rejected: [], extra: [],
    };
    for (const r of rows) g[r.bucket].push(r);
    return g;
  }, [rows]);

  // P0-C · TRUTHFUL COUNTERS — todos los números salen del derivador canónico
  // (`attendance-truth`), nunca de conteos auto-declarados ni de agrupaciones
  // visuales. "Fichados" = personas con clock_in real, incluidas las que ya
  // salieron; por eso nunca puede verse "0 fichados / 2 salidas".
  const truth = useMemo(
    () =>
      deriveAttendanceTruth({
        assignments: shiftAsgns.map((a) => ({
          id: (a as any).id ?? a.employee_id,
          employee_id: a.employee_id,
          status: a.status,
          response_status: (a as any).response_status ?? null,
          attendance_status: (a as any).attendance_status ?? null,
        })),
        entries: entries.map((e) => ({
          id: (e as any).id ?? `${e.employee_id}-${e.clock_in}`,
          employee_id: e.employee_id,
          clock_in: e.clock_in,
          clock_out: e.clock_out,
          status: (e as any).status ?? null,
        })),
        windowStartsAt: `${shiftDate}T${startTime}`,
        windowEndsAt: shiftEnd,
        graceMinutes: CLOSEOUT_GRACE_MIN,
        now,
      }),
    [shiftAsgns, entries, shiftDate, startTime, shiftEnd, now],
  );

  const counts = useMemo(() => {
    const c = truth.counts;
    return {
      required: slots ?? 0,
      asignados: c.expected,
      confirmados: c.confirmed,
      fichados: c.clockedIn,
      salidas: c.clockOuts,
      faltaSalida: c.missingClockOut,
      noLlegaron: c.noClockIn,
      extras: c.extras,
      incidencias: c.incidents,
    };
  }, [truth, slots]);

  const nextAction = useMemo(() => {
    if (counts.noLlegaron > 0) {
      return {
        tone: "warning" as const,
        icon: AlertTriangle,
        text: `${counts.noLlegaron} sin fichar`,
      };
    }
    if (counts.faltaSalida > 0) {
      return {
        tone: "warning" as const,
        icon: Clock,
        text: `Equipo fichado · pendiente salida de ${counts.faltaSalida} ${counts.faltaSalida === 1 ? "persona" : "personas"}`,
      };
    }
    if (counts.extras > 0) {
      return {
        tone: "warning" as const,
        icon: Sparkles,
        text: `Hay ${counts.extras} extra${counts.extras === 1 ? "" : "s"} sin asignar`,
      };
    }
    if (counts.asignados < counts.required) {
      return {
        tone: "warning" as const,
        icon: UserMinus,
        text: `Faltan ${counts.required - counts.asignados} de ${counts.required} asignaciones`,
      };
    }
    if (counts.asignados > 0 && counts.fichados + counts.salidas === counts.asignados) {
      // All assigned workers have either clocked out or are still active.
      // If everyone is already out, the shift is ready to be closed — do NOT
      // require pastEnd, the captain may legitimately close earlier than the
      // scheduled end_time (worker finished early, event ended early, etc.).
      if (counts.salidas === counts.asignados) {
        return {
          tone: "success" as const,
          icon: ShieldCheck,
          text: "Todas las salidas registradas · envía el cierre",
        };
      }
      return {
        tone: "info" as const,
        icon: CheckCircle2,
        text: "Todo el equipo está fichado",
      };
    }

    return {
      tone: "neutral" as const,
      icon: Clock,
      text: "Operación en curso",
    };
  }, [counts, pastEnd]);

  return (
    <div className={cn("rounded-2xl border border-border/50 bg-card overflow-hidden", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-2 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
            <span className="relative block h-2 w-2 rounded-full bg-primary" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Turno en vivo
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Solo lectura · sin tocar payroll
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-px bg-border/40">
        <SummaryCell label="Requeridos" value={counts.required} />
        <SummaryCell label="Asignados" value={counts.asignados} />
        <SummaryCell label="Confirmados" value={counts.confirmados} />
        <SummaryCell label="Fichados" value={counts.fichados} tone={counts.fichados > 0 ? "info" : "neutral"} />
        <SummaryCell label="Salidas" value={counts.salidas} tone={counts.salidas > 0 ? "success" : "neutral"} />
        <SummaryCell label="Falta salida" value={counts.faltaSalida} tone={counts.faltaSalida > 0 ? "danger" : "neutral"} />
        <SummaryCell label="No fichados" value={counts.noLlegaron} tone={counts.noLlegaron > 0 ? "warning" : "neutral"} />
        <SummaryCell label="Extras" value={counts.extras} tone={counts.extras > 0 ? "warning" : "neutral"} />
        <SummaryCell label="Incidencias" value={counts.incidencias} tone={counts.incidencias > 0 ? "danger" : "neutral"} />
      </div>

      {/* Next action strip */}
      <NextActionStrip {...nextAction} />

      {/* Worker groups */}
      <div className="px-3 py-3 space-y-3">
        <Group title="Activos ahora" tone="info" rows={groups.active} loading={loading} emptyHint="Aún nadie fichado." />
        <Group title="Falta clock-in" tone="warning" rows={groups.no_clockin} emptyHint={null} />
        <Group title="Falta clock-out" tone="danger" rows={groups.missing_clockout} emptyHint={null} />
        <Group title="Completados" tone="success" rows={groups.completed} emptyHint={null} />
        <Group title="Pendientes / sin confirmar" tone="neutral" rows={groups.pending} emptyHint={null} />
        <Group title="Extras detectados" tone="warning" rows={groups.extra} emptyHint={null} />
        <Group title="Rechazados" tone="neutral" muted rows={groups.rejected} emptyHint={null} />
      </div>
    </div>
  );
}

function SummaryCell({
  label, value, tone = "neutral",
}: {
  label: string; value: number;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const map = {
    neutral: "text-foreground",
    info: "text-primary",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
  }[tone];
  return (
    <div className="bg-card px-2 py-2 text-center">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight">
        {label}
      </div>
      <div className={cn("text-base font-bold tabular-nums mt-0.5", map)}>{value}</div>
    </div>
  );
}

function NextActionStrip({
  tone, icon: Icon, text,
}: {
  tone: "danger" | "warning" | "info" | "success" | "neutral";
  icon: any;
  text: string;
}) {
  const map = {
    danger: "bg-destructive/10 text-destructive border-destructive/30",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    info: "bg-primary/10 text-primary border-primary/30",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    neutral: "bg-muted/40 text-muted-foreground border-border/40",
  }[tone];
  return (
    <div className={cn("px-4 py-2.5 border-y flex items-center gap-2", map)}>
      <Icon className="h-4 w-4 shrink-0" />
      <p className="text-xs font-semibold">{text}</p>
    </div>
  );
}

function Group({
  title, tone, rows, emptyHint, loading, muted,
}: {
  title: string;
  tone: "info" | "warning" | "danger" | "success" | "neutral";
  rows: WorkerRow[];
  emptyHint: string | null;
  loading?: boolean;
  muted?: boolean;
}) {
  if (rows.length === 0 && !emptyHint) return null;
  const toneDot = {
    info: "bg-primary",
    warning: "bg-amber-500",
    danger: "bg-destructive",
    success: "bg-emerald-500",
    neutral: "bg-muted-foreground/50",
  }[tone];
  return (
    <section className={cn(muted && "opacity-70")}>
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", toneDot)} />
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 rounded-full">
          {rows.length}
        </Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground px-2 py-1.5">
          {loading ? "Cargando…" : emptyHint}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {rows.map((r) => (
            <WorkerCard key={`${r.employee.id}-${r.assignmentStatus}`} row={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function WorkerCard({ row }: { row: WorkerRow }) {
  const { employee: e, clockIn, clockOut, isAdmin, isDriver, warning, bucket, assignmentStatus } = row;
  const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "—";

  const phoneHref = e.phone_number
    ? `tel:${e.phone_number.replace(/\D+/g, "")}`
    : null;
  const waHref = e.phone_number
    ? `https://wa.me/${e.phone_number.replace(/\D+/g, "")}`
    : null;

  return (
    <div className="rounded-xl border border-border/40 bg-card px-2.5 py-2 flex items-center gap-2.5">
      <EmployeeAvatar
        firstName={e.first_name ?? ""}
        lastName={e.last_name ?? ""}
        avatarUrl={(e as any).avatar_url}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-xs font-semibold truncate">{name}</p>
          {isAdmin && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 rounded-full bg-primary/10 text-primary border-primary/30">
              <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> Admin
            </Badge>
          )}
          {isDriver && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 rounded-full">
              <Car className="h-2.5 w-2.5 mr-0.5" /> Driver
            </Badge>
          )}
          {bucket === "extra" && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Extra
            </Badge>
          )}
          {assignmentStatus === "rejected" && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 rounded-full bg-destructive/10 text-destructive border-destructive/30">
              <UserX className="h-2.5 w-2.5 mr-0.5" /> Rechazó
            </Badge>
          )}
          <IdentityBadges employee={e} size="xs" />
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          <Clock className="h-2.5 w-2.5" />
          <span>{fmtTime(clockIn)}</span>
          <span className="opacity-50">→</span>
          <span className={cn(!clockOut && clockIn && "text-amber-600 dark:text-amber-400 font-semibold")}>
            {clockOut ? fmtTime(clockOut) : clockIn ? "Falta salida" : "—"}
          </span>
          {clockIn && clockOut && (() => {
            try {
              const mins = differenceInMinutes(parseISO(clockOut), parseISO(clockIn));
              if (mins <= 0) return null;
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return (
                <span className="ml-1 px-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold">
                  {h > 0 ? `${h}h ${m}m` : `${m}m`}
                </span>
              );
            } catch { return null; }
          })()}
        </div>
        {warning && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5 flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> {warning}
          </p>
        )}
      </div>
      {phoneHref && (
        <div className="flex items-center gap-0.5">
          <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Llamar">
            <a href={phoneHref}>
              <Phone className="h-3.5 w-3.5" />
            </a>
          </Button>
          {waHref && (
            <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="WhatsApp">
              <a href={waHref} target="_blank" rel="noreferrer">
                <UserRound className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
