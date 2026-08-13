/**
 * OX-4.3 — Modelo puro del Today Hub / Command Center.
 *
 * Responde una sola pregunta: ¿qué necesita mi atención hoy y cuál es la
 * siguiente mejor acción?
 *
 * Puro: sin React, sin Supabase, sin escrituras. Sólo transforma los datos
 * que ya produce `useTodayOperations` (+ contadores existentes) en la verdad
 * operacional que consumen mobile y desktop por igual.
 *
 * Reglas duras:
 *  - No inventa reglas de negocio nuevas: reusa buckets y estados existentes.
 *  - Nunca convierte horas programadas en horas trabajadas.
 *  - Nunca produce "ceros silenciosos": si no hay dato, hay frase.
 */

/* ── Entradas ────────────────────────────────────────────────────────── */

import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { readAttendance } from "./attendance-semantics";
import { ADMIN_LEX } from "@/lib/ox/lexicon";
import {
  serviceDeepLink,
  hoursDeepLink,
  timeclockDeepLink,
  type ServiceStage,
} from "./deep-link";
import {
  resolveShiftPublicationTruth,
  type ShiftTruthShiftInput,
} from "@/lib/shifts/publication-truth";
import {
  resolveServiceLocationTruth,
  type ServiceLocationInput,
} from "@/lib/shifts/service-location";


export interface HubShiftOpsLike {
  bucket: string;
  alert_level?: string;
  required: number;
  assigned_active: number;
  confirmed: number;
  clocked_in: number;
  open_clocks: number;
  missing_clock_outs: number;
  /** Sin fichaje de entrada. NO equivale a no-show (OX-4.3.1). */
  not_started: number;
  /** Evidencia explícita de no-show. Hoy no la produce ninguna fuente. */
  confirmed_no_shows?: number | null;
}


export interface HubShiftLike {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  slots?: number | null;
  shift_code?: string | null;
  shift_ref?: string | null;
  client_name?: string | null;
  job_site_name?: string | null;
  meeting_point?: string | null;
  meeting_point_location_name?: string | null;
  pending_claims?: number;
  transport?: {
    required: boolean;
    missing_driver: boolean;
    capacity_short: boolean;
  } | null;
  ops: HubShiftOpsLike;
}

/** Contadores globales ya existentes (tenant-scoped, sólo lectura). */
export interface HubCounts {
  /** Horas / fichajes pendientes de revisión antes de payroll. */
  pendingHours?: number | null;
  /** Documentos pendientes de revisión (no bloqueante). */
  docsPending?: number | null;
  /** Periodos de pago abiertos. */
  openPeriods?: number | null;
}

export type HubRole = "manager" | "dispatcher" | "captain" | "payroll";

/**
 * OX-4.3.1 — Capacidades explícitas del Today Hub.
 * Default fail-closed: si una capacidad no viene, es `false`.
 */
export interface HubPermissions {
  /** Completar equipo / asignar workers. */
  canAssign?: boolean;
  /** Confirmar equipo (contactar / confirmar asistencia comprometida). */
  canConfirmTeam?: boolean;
  /** Operar turno (Shift Ops). */
  canOperate?: boolean;
  /** Cerrar turno. */
  canClose?: boolean;
  /** Revisar cierre operacional. */
  canReviewCloseout?: boolean;
  /** Aprobar horas antes de payroll. */
  canApproveHours?: boolean;
  /** Acceder al Centro de Validación. */
  canAccessValidations?: boolean;
  /** Gestionar workers (documentos, elegibilidad). */
  canManageWorkers?: boolean;
  /** Gestionar asistencia / fichajes. */
  canManageAttendance?: boolean;
}

export type ResolvedHubPermissions = Required<HubPermissions>;

/** Fail-closed: ninguna acción privilegiada disponible. */
export const NO_HUB_PERMISSIONS: ResolvedHubPermissions = {
  canAssign: false,
  canConfirmTeam: false,
  canOperate: false,
  canClose: false,
  canReviewCloseout: false,
  canApproveHours: false,
  canAccessValidations: false,
  canManageWorkers: false,
  canManageAttendance: false,
};

/** Sólo para tests / superficies con permisos ya validados. */
export const FULL_HUB_PERMISSIONS: ResolvedHubPermissions = {
  canAssign: true,
  canConfirmTeam: true,
  canOperate: true,
  canClose: true,
  canReviewCloseout: true,
  canApproveHours: true,
  canAccessValidations: true,
  canManageWorkers: true,
  canManageAttendance: true,
};

export function resolveHubPermissions(
  p: HubPermissions | undefined,
): ResolvedHubPermissions {
  return resolvePermissions(p);
}

function resolvePermissions(p: HubPermissions | undefined): ResolvedHubPermissions {
  // Fail-closed por diseño: ausente/undefined ⇒ sin acceso.
  return {
    canAssign: p?.canAssign === true,
    canConfirmTeam: p?.canConfirmTeam === true,
    canOperate: p?.canOperate === true,
    canClose: p?.canClose === true,
    canReviewCloseout: p?.canReviewCloseout === true,
    canApproveHours: p?.canApproveHours === true,
    canAccessValidations: p?.canAccessValidations === true,
    canManageWorkers: p?.canManageWorkers === true,
    canManageAttendance: p?.canManageAttendance === true,
  };
}


export interface TodayHubInput {
  shifts: HubShiftLike[];
  now?: Date;
  counts?: HubCounts;
  role?: HubRole;
  permissions?: HubPermissions;
}

/* ── Salidas ─────────────────────────────────────────────────────────── */

export type HubPriority = "critical" | "high" | "medium" | "low";

export const PRIORITY_WEIGHT: Record<HubPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface HubLink {
  label: string;
  href: string;
}

export interface HubAttentionItem {
  id: string;
  /** `risk` → InsightCard · `validation` → ValidationCard · `kpi` → KpiCard */
  kind: "risk" | "validation" | "kpi";
  priority: HubPriority;
  status: string;
  /** Lectura accionable en una frase. */
  headline: string;
  /** Por qué el sistema lo señala. */
  because: string;
  /** Qué pasa si no se actúa. */
  impact?: string;
  /** Sólo para `kpi`: valor ya formateado con unidad. */
  value?: string;
  action?: HubLink;
  alternatives?: HubLink[];
  shiftId?: string;
}

export interface HubOperation {
  shiftId: string;
  title: string;
  clientName?: string | null;
  locationName?: string | null;
  timeRange: string;
  reference?: string | null;
  status: string;
  statusLabel: string;
  required: number;
  assigned: number;
  need: string;
  note?: string;
  priority: HubPriority;
  /** Ausente ⇒ el usuario no tiene permiso para actuar (fail-closed). */
  action?: HubLink;
  secondary: HubLink[];
}

export interface HubTeamSummary {
  shiftId: string;
  title: string;
  subtitle: string;
  required: number;
  assigned: number;
  confirmed: number;
  present: number;
  priority: HubPriority;
  /** Lectura de asistencia (OX-4.3.1): nunca asume no-show. */
  attendanceLabel?: string;
  action?: HubLink;
}

export interface HubDecisionItem {
  id: string;
  shiftId?: string;
  title: string;
  subtitle: string;
  status: string;
  evidence: Array<{ label: string; value: string; attention?: boolean }>;
  consequence: string;
  decision?: HubLink;
  alternatives: HubLink[];
  priority: HubPriority;
}


export interface HubEmptyState {
  calm: boolean;
  headline: string;
  message: string;
  nextShift?: {
    shiftId: string;
    title: string;
    timeRange: string;
    startsInLabel: string;
    action: HubLink;
  };
}

export interface TodayHubModel {
  attentionItems: HubAttentionItem[];
  activeOperations: HubOperation[];
  teamSummaries: HubTeamSummary[];
  closeoutItems: HubDecisionItem[];
  validationItems: HubDecisionItem[];
  emptyState: HubEmptyState;
  primaryAction: (HubLink & { reason: string }) | null;
}

/* ── Rutas canónicas (deep links, sin menús intermedios) ─────────────── */

const ROUTES = {
  shiftOps: (id: string) => `/app/shift-ops?id=${id}`,
  closeout: "/app/daily-close",
  hours: (id?: string) =>
    id ? `/app/payroll-review-queue?shiftId=${id}` : "/app/payroll-review-queue",
  timeclock: (id: string) => `/app/timeclock?shiftId=${id}`,
  documents: "/app/documents",
};

/* ── Helpers puros ───────────────────────────────────────────────────── */

export function hhmm(time: string | null | undefined): string {
  if (!time) return "--:--";
  return time.slice(0, 5);
}

export function timeRangeLabel(shift: HubShiftLike): string {
  return `${hhmm(shift.start_time)}–${hhmm(shift.end_time)}`;
}

function startDate(shift: HubShiftLike): Date {
  return new Date(`${shift.date}T${shift.start_time}`);
}

export function minutesUntilStart(shift: HubShiftLike, now: Date): number {
  return Math.round((startDate(shift).getTime() - now.getTime()) / 60_000);
}

function startsInLabel(minutes: number): string {
  if (minutes <= 0) return "ya comenzó";
  if (minutes < 60) return `comienza en ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `comienza en ${h} h` : `comienza en ${h} h ${m} min`;
}

function sortByPriority<T extends { priority: HubPriority }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority],
  );
}

/** Sesgo de rol: sólo reordena, nunca oculta ni cambia la verdad. */
function roleBoost(role: HubRole | undefined, kind: string): number {
  if (!role) return 0;
  const map: Record<HubRole, string[]> = {
    manager: [],
    dispatcher: ["coverage", "unconfirmed", "replacement", "transport"],
    captain: ["attendance", "no_show", "late"],
    payroll: ["hours", "closeout", "open_clock"],
  };
  return map[role].includes(kind) ? -0.5 : 0;
}

/* ── Derivación ──────────────────────────────────────────────────────── */

export function buildTodayHubModel(input: TodayHubInput): TodayHubModel {
  const now = input.now ?? new Date();
  const role = input.role;
  const perms = resolvePermissions(input.permissions);


  const attention: Array<HubAttentionItem & { _boost: number }> = [];
  const operations: HubOperation[] = [];
  const teams: HubTeamSummary[] = [];
  const closeouts: HubDecisionItem[] = [];
  const validations: HubDecisionItem[] = [];

  for (const shift of input.shifts) {
    const ops = shift.ops;
    const required = ops.required || shift.slots || 0;
    const assigned = ops.assigned_active;
    const missing = Math.max(0, required - assigned);
    const mins = minutesUntilStart(shift, now);
    const range = timeRangeLabel(shift);
    const where =
      shift.job_site_name ??
      shift.meeting_point_location_name ??
      shift.meeting_point ??
      null;

    const push = (
      item: Omit<HubAttentionItem, "id"> & { id: string; kind: HubAttentionItem["kind"] },
      boostKind: string,
    ) => attention.push({ ...item, _boost: roleBoost(role, boostKind) });

    /* — Asistencia: NUNCA se asume no-show (OX-4.3.1) — */
    const attendance = readAttendance({
      bucket: ops.bucket,
      assigned,
      clockedIn: ops.clocked_in,
      notStarted: ops.not_started,
      minutesUntilStart: mins,
      confirmedNoShows: ops.confirmed_no_shows ?? null,
    });
    if (
      attendance &&
      (attendance.state === "no_show_confirmed" ||
        attendance.state === "missing_checkin" ||
        attendance.state === "awaiting_checkin")
    ) {
      push(
        {
          id: `${shift.id}:attendance`,
          kind: "risk",
          priority: attendance.priority,
          status: attendance.status,
          headline: `${attendance.label} — ${attendance.count} en ${shift.title}`,
          because: `${attendance.detail} Turno ${range}.`,
          impact:
            attendance.state === "no_show_confirmed"
              ? "Cobertura real menor a la comprometida con el cliente."
              : "La cobertura real aún no está confirmada en sitio.",
          action: perms.canManageAttendance
            ? { label: "Revisar asistencia", href: ROUTES.shiftOps(shift.id) }
            : undefined,
          shiftId: shift.id,
        },
        attendance.state === "no_show_confirmed" ? "no_show" : "attendance",
      );
    }


    /* — Cobertura incompleta — */
    if (missing > 0 && ops.bucket !== "closed") {
      const critical = mins <= 60;
      push(
        {
          id: `${shift.id}:coverage`,
          kind: "risk",
          priority: critical ? "critical" : mins <= 24 * 60 ? "high" : "medium",
          status: assigned === 0 ? "blocked" : "missing",
          headline: `Faltan ${missing} de ${required} en ${shift.title}`,
          because: `${range}${where ? ` · ${where}` : ""} — ${startsInLabel(mins)}.`,
          impact: "El turno no puede considerarse cubierto.",
          action: perms.canAssign
            ? { label: "Completar equipo", href: ROUTES.shiftOps(shift.id) }
            : undefined,
          shiftId: shift.id,
        },
        "coverage",
      );
    }

    /* — Sin confirmar antes de empezar — */
    const unconfirmed = Math.max(0, assigned - ops.confirmed);
    if (unconfirmed > 0 && mins > 0 && mins <= 12 * 60) {
      push(
        {
          id: `${shift.id}:unconfirmed`,
          kind: "risk",
          priority: "high",
          status: "pending",
          headline: `${unconfirmed} sin confirmar en ${shift.title}`,
          because: `El turno ${startsInLabel(mins)} y aún no responden.`,
          impact: "Riesgo de arrancar sin equipo completo.",
          action: perms.canConfirmTeam
            ? { label: "Contactar pendientes", href: ROUTES.shiftOps(shift.id) }
            : undefined,

          shiftId: shift.id,
        },
        "unconfirmed",
      );
    }

    /* — Transporte — */
    if (shift.transport?.missing_driver) {
      push(
        {
          id: `${shift.id}:driver`,
          kind: "risk",
          priority: "high",
          status: "warning",
          headline: `Sin conductor asignado en ${shift.title}`,
          because: "El turno requiere transporte y no hay conductor.",
          impact: "El equipo puede no llegar al punto de encuentro.",
          action: perms.canAssign
            ? { label: "Asignar conductor", href: ROUTES.shiftOps(shift.id) }
            : undefined,
          shiftId: shift.id,
        },
        "transport",
      );
    }

    /* — Fichajes abiertos sin salida — */
    if (ops.missing_clock_outs > 0) {
      push(
        {
          id: `${shift.id}:open-clock`,
          kind: "risk",
          priority: "high",
          status: "late",
          headline: `${ops.missing_clock_outs} fichajes sin salida en ${shift.title}`,
          because: "El turno terminó y los relojes siguen abiertos.",
          impact: "Las horas no pueden revisarse hasta cerrarlos.",
          action: perms.canManageAttendance
            ? { label: "Cerrar clock-out", href: ROUTES.timeclock(shift.id) }
            : undefined,
          shiftId: shift.id,
        },
        "open_clock",
      );
    }

    /* — Solicitudes pendientes (decisión) — */
    if ((shift.pending_claims ?? 0) > 0) {
      validations.push({
        id: `${shift.id}:claims`,
        shiftId: shift.id,
        title: `${shift.pending_claims} solicitudes por revisar`,
        subtitle: `${shift.title} · ${range}`,
        status: "needs_review",
        evidence: [
          { label: "Cupos", value: `${assigned}/${required}`, attention: missing > 0 },
          { label: "Solicitudes", value: String(shift.pending_claims), attention: true },
        ],
        consequence: "Aceptar una solicitud ocupa un cupo del turno.",
        decision: perms.canAssign
          ? { label: "Revisar solicitudes", href: ROUTES.shiftOps(shift.id) }
          : undefined,
        alternatives: [],
        priority: missing > 0 ? "high" : "medium",
      });
    }

    /* — Cierre pendiente — */
    if (ops.bucket === "needs_closeout") {
      closeouts.push({
        id: `${shift.id}:closeout`,
        shiftId: shift.id,
        title: `Cierre pendiente — ${shift.title}`,
        subtitle: `${range}${where ? ` · ${where}` : ""}`,
        status: ops.missing_clock_outs > 0 ? "warning" : "needs_review",
        evidence: [
          { label: "Asistencia", value: `${ops.clocked_in}/${assigned}` },
          {
            label: "Sin salida",
            value:
              ops.missing_clock_outs > 0
                ? String(ops.missing_clock_outs)
                : "Ninguno",
            attention: ops.missing_clock_outs > 0,
          },
        ],
        consequence:
          "Revisar el cierre no modifica payroll. La validación final se hace en Centro de Validación.",
        decision:
          perms.canReviewCloseout || perms.canClose
            ? { label: "Revisar cierre", href: ROUTES.closeout }
            : perms.canOperate
              ? { label: "Ver detalles", href: ROUTES.shiftOps(shift.id) }
              : undefined,
        alternatives:
          perms.canApproveHours || perms.canAccessValidations
            ? [{ label: "Revisar horas", href: ROUTES.hours(shift.id) }]
            : [],
        priority: ops.missing_clock_outs > 0 ? "high" : "medium",
      });
    }


    /* — Operaciones de hoy — */
    if (ops.bucket !== "closed") {
      const { status, statusLabel, need, action, priority } = operationState(
        shift,
        missing,
        unconfirmed,
        mins,
        perms,
      );
      operations.push({
        shiftId: shift.id,
        title: shift.title,
        clientName: shift.client_name ?? null,
        locationName: where,
        timeRange: range,
        reference: getShiftDisplayIdentity(shift).primaryRefKind === "none" ? null : getShiftDisplayIdentity(shift).primaryRef,
        status,
        statusLabel,
        required,
        assigned,
        need,
        note:
          ops.clocked_in > 0
            ? `${ops.clocked_in} con fichaje · ${ops.open_clocks} reloj(es) abierto(s)`
            : undefined,
        priority,
        action,
        secondary: perms.canOperate
          ? [{ label: "Ver detalles", href: ROUTES.shiftOps(shift.id) }]
          : [],
      });
    }

    /* — Equipos en riesgo — */
    if (missing > 0 || unconfirmed > 0 || ops.not_started > 0) {
      const teamAction: HubLink | undefined =
        missing > 0
          ? perms.canAssign
            ? { label: "Completar equipo", href: ROUTES.shiftOps(shift.id) }
            : undefined
          : attendance &&
              (attendance.state === "missing_checkin" ||
                attendance.state === "no_show_confirmed" ||
                attendance.state === "awaiting_checkin")
            ? perms.canManageAttendance
              ? { label: "Revisar asistencia", href: ROUTES.shiftOps(shift.id) }
              : undefined
            : perms.canConfirmTeam
              ? { label: "Contactar pendientes", href: ROUTES.shiftOps(shift.id) }
              : undefined;
      teams.push({
        shiftId: shift.id,
        title: `Equipo — ${shift.title}`,
        subtitle: `${range}${shift.client_name ? ` · ${shift.client_name}` : ""}`,
        required,
        assigned,
        confirmed: ops.confirmed,
        present: ops.clocked_in,
        priority: missing > 0 ? (mins <= 60 ? "critical" : "high") : "high",
        attendanceLabel: attendance?.label,
        action: teamAction,
      });

    }
  }

  /* — Contadores globales como KPIs accionables (nunca ceros mudos) — */
  const counts = input.counts ?? {};
  if (
    (perms.canApproveHours || perms.canAccessValidations) &&
    typeof counts.pendingHours === "number"
  ) {
    attention.push({
      id: "counts:hours",
      kind: "kpi",
      priority: counts.pendingHours > 0 ? "high" : "low",
      status: counts.pendingHours > 0 ? "needs_review" : "approved",
      headline: "Horas pendientes de revisión",
      value:
        counts.pendingHours > 0
          ? `${counts.pendingHours} fichajes`
          : "Sin pendientes",
      because:
        counts.pendingHours > 0
          ? `${counts.pendingHours} fichajes esperan revisión antes de payroll.`
          : "No hay horas pendientes de revisión.",
      action:
        counts.pendingHours > 0 && perms.canAccessValidations
          ? { label: "Revisar horas", href: ROUTES.hours() }
          : undefined,
      _boost: roleBoost(role, "hours"),
    } as HubAttentionItem & { _boost: number });
  }
  if (
    perms.canManageWorkers &&
    typeof counts.docsPending === "number" &&
    counts.docsPending > 0
  ) {
    attention.push({
      id: "counts:docs",
      kind: "kpi",
      priority: "low",
      status: "documents_pending",
      headline: "Documentos por revisar",
      value: `${counts.docsPending} documentos`,
      because: "No bloquean la operación de hoy, pero sí la elegibilidad futura.",
      action: { label: "Abrir documentos", href: ROUTES.documents },
      _boost: 0,
    } as HubAttentionItem & { _boost: number });
  }


  const attentionItems = attention
    .sort(
      (a, b) =>
        PRIORITY_WEIGHT[a.priority] + a._boost -
        (PRIORITY_WEIGHT[b.priority] + b._boost),
    )
    .map(({ _boost, ...item }) => item);

  const activeOperations = sortByPriority(operations);
  const teamSummaries = sortByPriority(teams);
  const closeoutItems = sortByPriority(closeouts);
  const validationItems = sortByPriority(validations);

  /* — Estado sin riesgos — */
  const hasRisk = attentionItems.some(
    (i) => i.priority === "critical" || i.priority === "high",
  );
  const upcoming = input.shifts
    .filter((s) => minutesUntilStart(s, now) > 0 && s.ops.bucket !== "closed")
    .sort((a, b) => minutesUntilStart(a, now) - minutesUntilStart(b, now))[0];

  const emptyState: HubEmptyState = {
    calm: !hasRisk,
    headline: input.shifts.length === 0 ? "Sin turnos hoy" : "Todo bajo control",
    message:
      input.shifts.length === 0
        ? "No hay operaciones programadas para hoy. Programa un turno o revisa mañana."
        : `Los ${ADMIN_LEX.entityPlural} de hoy están cubiertos y no hay acciones urgentes.`,
    nextShift:
      upcoming && perms.canOperate
        ? {
            shiftId: upcoming.id,
            title: upcoming.title,
            timeRange: timeRangeLabel(upcoming),
            startsInLabel: startsInLabel(minutesUntilStart(upcoming, now)),
            action: { label: "Ver turno", href: ROUTES.shiftOps(upcoming.id) },
          }
        : undefined,
  };

  const top = attentionItems.find((i) => i.action);
  const primaryAction = top?.action
    ? { ...top.action, reason: top.headline }
    : upcoming && perms.canOperate
      ? {
          label: "Ver próximo turno",
          href: ROUTES.shiftOps(upcoming.id),
          reason: `${upcoming.title} ${startsInLabel(minutesUntilStart(upcoming, now))}`,
        }
      : null;


  return {
    attentionItems,
    activeOperations,
    teamSummaries,
    closeoutItems,
    validationItems,
    emptyState,
    primaryAction,
  };
}

function operationState(
  shift: HubShiftLike,
  missing: number,
  unconfirmed: number,
  mins: number,
  perms: ResolvedHubPermissions,
): {
  status: string;
  statusLabel: string;
  need: string;
  action?: HubLink;
  priority: HubPriority;
} {
  const ops = shift.ops;
  const href = ROUTES.shiftOps(shift.id);
  const viewLink: HubLink | undefined = perms.canOperate
    ? { label: "Ver detalles", href }
    : undefined;

  if (ops.bucket === "needs_closeout") {
    return {
      status: "needs_review",
      statusLabel: "Listo para cerrar",
      need:
        ops.missing_clock_outs > 0
          ? `${ops.missing_clock_outs} fichajes sin salida antes de cerrar.`
          : "El turno terminó: falta revisar el cierre.",
      action:
        perms.canClose || perms.canReviewCloseout
          ? { label: "Revisar cierre", href: ROUTES.closeout }
          : viewLink,
      priority: "medium",
    };
  }
  if (ops.bucket === "in_progress") {
    const attendance = readAttendance({
      bucket: ops.bucket,
      assigned: ops.assigned_active,
      clockedIn: ops.clocked_in,
      notStarted: ops.not_started,
      minutesUntilStart: mins,
      confirmedNoShows: ops.confirmed_no_shows ?? null,
    });
    return {
      status: "in_progress",
      statusLabel: "En curso",
      need: attendance
        ? attendance.detail
        : `${ops.clocked_in} de ${ops.assigned_active} en sitio.`,
      action: perms.canOperate
        ? { label: "Operar turno", href }
        : undefined,
      priority:
        attendance?.state === "no_show_confirmed"
          ? "critical"
          : attendance?.state === "missing_checkin"
            ? "high"
            : "medium",
    };
  }
  if (missing > 0) {
    return {
      status: ops.assigned_active === 0 ? "blocked" : "missing",
      statusLabel: `Faltan ${missing}`,
      need: `Cubrir ${missing} cupo(s) antes de ${hhmm(shift.start_time)}.`,
      action: perms.canAssign
        ? { label: "Completar equipo", href }
        : viewLink,
      priority: mins <= 60 ? "critical" : "high",
    };
  }
  if (unconfirmed > 0) {
    return {
      status: "pending",
      statusLabel: `${unconfirmed} sin confirmar`,
      need: `${unconfirmed} de ${ops.assigned_active} aún no confirman.`,
      action: perms.canConfirmTeam
        ? { label: "Confirmar equipo", href }
        : viewLink,
      priority: mins <= 12 * 60 ? "high" : "medium",
    };
  }
  return {
    status: "ready",
    statusLabel: "Equipo completo",
    need: "Sin acciones pendientes. Listo para operar.",
    action: perms.canOperate ? { label: "Operar turno", href } : undefined,
    priority: "low",
  };
}

