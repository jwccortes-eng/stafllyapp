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


/**
 * Persona del turno tal como la produce `deriveShiftOpsState` + nombre ya
 * resuelto por el llamador. Permite que la alerta diga A QUIÉN afecta.
 */
export interface HubWorkerLike {
  employee_id: string;
  name?: string | null;
  assignment_status?: string | null;
  /** none | open | closed | missing_out | unlinked */
  clock_state?: string | null;
  clock_in?: string | null;
  clock_out?: string | null;
  response_status?: string | null;
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
  /** Estado de publicación crudo. Si viene, se evalúa Publication Truth. */
  publication_status?: string | null;
  status?: string | null;
  claimable?: boolean | null;
  /**
   * Entrada del resolver canónico de ubicación. SÓLO si el llamador la
   * hidrata se evalúa la alerta de ubicación: sin datos no se inventa un
   * "Falta ubicación" (regla dura contra falsos positivos).
   */
  location?: ServiceLocationInput | null;
  /** Personas del turno, para nombrar a quién afecta cada alerta. */
  workers?: HubWorkerLike[];
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

/**
 * P1 — Bandeja operativa. Severidad visual del Command Center.
 *  - critical  : rompe el servicio ahora (cobertura, no-show, sin ubicación).
 *  - attention : se degrada si nadie actúa hoy.
 *  - prep      : preparación previa (confirmaciones, publicación).
 *  - info      : contexto, sin acción obligatoria.
 */
export type HubAlertSeverity = "critical" | "attention" | "prep" | "info";

/** Tipos canónicos de incidencia. Uno por causa raíz, nunca por pantalla. */
export type HubAlertType =
  | "coverage_gap"
  | "unconfirmed_team"
  | "attendance_risk"
  | "missing_clock_out"
  | "missing_driver"
  | "not_published"
  | "missing_destination"
  | "missing_meeting_point";

/**
 * Contexto obligatorio de toda alerta. Responde en <3 s:
 * QUÉ pasó · DÓNDE · A QUIÉN afecta · CUÁNDO.
 */
export interface HubAlertContext {
  /** Referencia canónica visible (QK-00xxxx). Nunca el UUID. */
  serviceRef: string | null;
  /** Cliente del servicio. */
  clientName: string | null;
  /** Sitio / punto de encuentro legible. */
  locationName: string | null;
  /** "Hoy" · "Mañana" · "Ayer" · "12 mar". */
  dateLabel: string;
  /** "08:00–16:00". */
  timeLabel: string;
  /** "Hoy · 08:00–16:00". */
  whenLabel: string;
  /** Antigüedad humana: "hace 32 min" / "en 2 h". */
  ageLabel: string;
  /** Personas afectadas, ya nombradas. Vacío si es del servicio completo. */
  people: string[];
  /** Cuántas personas afecta. 0 = afecta al servicio. */
  peopleCount: number;
  /** Qué se esperaba. */
  expected: string;
  /** Qué está pasando realmente. */
  current: string;
}

export interface HubAlert {
  id: string;
  shiftId: string;
  type: HubAlertType;
  severity: HubAlertSeverity;
  priority: HubPriority;
  status: string;
  /** Título corto y humano: "Cobertura incompleta". */
  title: string;
  /** Lectura accionable en una frase. */
  headline: string;
  /** Por qué el sistema lo señala. */
  because: string;
  /** Qué pasa si no se actúa. */
  impact?: string;
  context: HubAlertContext;
  /** Etapa exacta del Service Command Center donde se resuelve. */
  stage: ServiceStage;
  /** ÚNICA acción principal. Ausente ⇒ sin permiso (fail-closed). */
  cta?: HubLink;
  secondary: HubLink[];
}

/** Alertas del mismo servicio, agrupadas para no repetir contexto. */
export interface HubAlertGroup {
  shiftId: string;
  serviceRef: string | null;
  title: string;
  clientName: string | null;
  whenLabel: string;
  locationName: string | null;
  severity: HubAlertSeverity;
  priority: HubPriority;
  alerts: HubAlert[];
  /** Acción principal del grupo = CTA de la alerta más severa. */
  action?: HubLink;
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
  /** Presente en items derivados de una alerta operativa. */
  context?: HubAlertContext;
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
  /** Bandeja operativa: toda incidencia con contexto y una acción. */
  alerts: HubAlert[];
  /** Las mismas alertas agrupadas por servicio. */
  alertGroups: HubAlertGroup[];
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
  /** Deep link a la etapa exacta del Service Command Center. */
  shiftOps: (id: string, stage: ServiceStage = "summary", focus?: string | null) =>
    serviceDeepLink({ shiftId: id, stage, focusEmployeeId: focus ?? null }),
  closeout: "/app/daily-close",
  hours: (id?: string) => hoursDeepLink(id ?? null),
  timeclock: (id: string, focus?: string | null) => timeclockDeepLink(id, focus ?? null),
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

/* ── Contexto humano de la alerta (P1 — Action-Driven Command Center) ── */

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "Hoy" · "Mañana" · "Ayer" · "12 mar". Nunca una fecha ISO cruda. */
export function dateLabelFor(date: string, now: Date): string {
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = toKey(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (date === today) return "Hoy";
  if (date === toKey(tomorrow)) return "Mañana";
  if (date === toKey(yesterday)) return "Ayer";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${d} ${MONTHS_ES[m - 1]}`;
}

/** Antigüedad humana: "hace 32 min" cuando ya pasó, "en 2 h" si falta. */
export function ageLabelFor(minutesUntil: number): string {
  const abs = Math.abs(minutesUntil);
  const unit =
    abs < 60
      ? `${abs} min`
      : abs < 24 * 60
        ? `${Math.floor(abs / 60)} h`
        : `${Math.floor(abs / (24 * 60))} d`;
  if (minutesUntil === 0) return "ahora";
  return minutesUntil < 0 ? `hace ${unit}` : `en ${unit}`;
}

/** Nombres legibles de las personas afectadas, sin inventar identidades. */
function peopleNames(workers: HubWorkerLike[] | undefined, ids: string[]): string[] {
  if (!workers?.length) return [];
  return ids
    .map((id) => workers.find((w) => w.employee_id === id))
    .map((w) => (w?.name ?? "").trim())
    .filter((n) => n.length > 0);
}

/** Severidad visual derivada de la prioridad operativa. */
const SEVERITY_BY_PRIORITY: Record<HubPriority, HubAlertSeverity> = {
  critical: "critical",
  high: "attention",
  medium: "prep",
  low: "info",
};

const SEVERITY_WEIGHT: Record<HubAlertSeverity, number> = {
  critical: 0,
  attention: 1,
  prep: 2,
  info: 3,
};


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


  /** Metadatos que convierten un item de atención en alerta de bandeja. */
  type AlertMeta = {
    type: HubAlertType;
    title: string;
    stage: ServiceStage;
    severity: HubAlertSeverity;
  };
  const attention: Array<
    HubAttentionItem & { _boost: number; _alert?: AlertMeta }
  > = [];
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

    /* — Identidad y contexto humano compartidos por todas las alertas — */
    const identity = getShiftDisplayIdentity(shift);
    const serviceRef =
      identity.primaryRefKind === "none" ? null : identity.primaryRef;
    const dateLabel = dateLabelFor(shift.date, now);
    const baseContext: HubAlertContext = {
      serviceRef,
      clientName: shift.client_name ?? null,
      locationName: where,
      dateLabel,
      timeLabel: range,
      whenLabel: `${dateLabel} · ${range}`,
      ageLabel: ageLabelFor(mins),
      people: [],
      peopleCount: 0,
      expected: "",
      current: "",
    };

    const push = (
      item: Omit<HubAttentionItem, "id"> & { id: string; kind: HubAttentionItem["kind"] },
      boostKind: string,
      alert?: {
        type: HubAlertType;
        title: string;
        stage: ServiceStage;
        severity?: HubAlertSeverity;
        context: Partial<HubAlertContext>;
      },
    ) =>
      attention.push({
        ...item,
        context: alert ? { ...baseContext, ...alert.context } : undefined,
        _boost: roleBoost(role, boostKind),
        _alert: alert
          ? {
              type: alert.type,
              title: alert.title,
              stage: alert.stage,
              severity: alert.severity ?? SEVERITY_BY_PRIORITY[item.priority],
            }
          : undefined,
      });


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
      // A QUIÉN afecta: personas activas sin fichaje de entrada.
      const pendingIds = (shift.workers ?? [])
        .filter((w) => (w.clock_state ?? "none") === "none")
        .map((w) => w.employee_id);
      const names = peopleNames(shift.workers, pendingIds);
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
            ? {
                label:
                  attendance.state === "no_show_confirmed"
                    ? "Reemplazar"
                    : "Revisar asistencia",
                href: ROUTES.shiftOps(
                  shift.id,
                  "attendance",
                  pendingIds.length === 1 ? pendingIds[0] : null,
                ),
              }
            : undefined,
          shiftId: shift.id,
        },
        attendance.state === "no_show_confirmed" ? "no_show" : "attendance",
        {
          type: "attendance_risk",
          title: attendance.label,
          stage: "attendance",
          context: {
            people: names,
            peopleCount: attendance.count,
            expected: `Check-in a las ${hhmm(shift.start_time)}`,
            current:
              attendance.state === "no_show_confirmed"
                ? `${attendance.count} ausencia(s) confirmada(s)`
                : `${attendance.count} sin fichaje de entrada`,
          },
        },
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
            ? { label: "Completar equipo", href: ROUTES.shiftOps(shift.id, "team") }
            : undefined,
          shiftId: shift.id,
        },
        "coverage",
        {
          type: "coverage_gap",
          title: "Cobertura incompleta",
          stage: "team",
          context: {
            peopleCount: 0,
            expected: `${required} persona(s) asignada(s)`,
            current: `${assigned} de ${required} · faltan ${missing}`,
          },
        },
      );
    }

    /* — Sin confirmar antes de empezar — */
    const unconfirmed = Math.max(0, assigned - ops.confirmed);
    if (unconfirmed > 0 && mins > 0 && mins <= 12 * 60) {
      const pendingIds = (shift.workers ?? [])
        .filter(
          (w) =>
            !["confirmed", "accepted"].includes(
              String(w.assignment_status ?? "").toLowerCase(),
            ),
        )
        .map((w) => w.employee_id);
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
            ? {
                label: "Contactar pendientes",
                href: ROUTES.shiftOps(
                  shift.id,
                  "team",
                  pendingIds.length === 1 ? pendingIds[0] : null,
                ),
              }
            : undefined,

          shiftId: shift.id,
        },
        "unconfirmed",
        {
          type: "unconfirmed_team",
          title: "Equipo sin confirmar",
          stage: "team",
          severity: "prep",
          context: {
            people: peopleNames(shift.workers, pendingIds),
            peopleCount: unconfirmed,
            expected: `${assigned} confirmación(es) antes de ${hhmm(shift.start_time)}`,
            current: `${ops.confirmed} de ${assigned} confirmados`,
          },
        },
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
            ? { label: "Asignar conductor", href: ROUTES.shiftOps(shift.id, "operation") }
            : undefined,
          shiftId: shift.id,
        },
        "transport",
        {
          type: "missing_driver",
          title: "Sin conductor",
          stage: "operation",
          context: {
            peopleCount: 0,
            expected: "1 conductor asignado",
            current: "Sin conductor",
          },
        },
      );
    }

    /* — Fichajes abiertos sin salida — */
    if (ops.missing_clock_outs > 0) {
      const openIds = (shift.workers ?? [])
        .filter((w) => (w.clock_state ?? "") === "missing_out")
        .map((w) => w.employee_id);
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
            ? {
                label: "Cerrar clock-out",
                href: ROUTES.timeclock(
                  shift.id,
                  openIds.length === 1 ? openIds[0] : null,
                ),
              }
            : undefined,
          shiftId: shift.id,
        },
        "open_clock",
        {
          type: "missing_clock_out",
          title: "Fichajes sin salida",
          stage: "time",
          context: {
            people: peopleNames(shift.workers, openIds),
            peopleCount: ops.missing_clock_outs,
            expected: `Clock-out a las ${hhmm(shift.end_time)}`,
            current: `${ops.missing_clock_outs} reloj(es) abierto(s)`,
          },
        },
      );
    }

    /* — Publicación pendiente (Publication Truth, resolver canónico) — */
    if (shift.publication_status !== undefined && assigned > 0) {
      const truth = resolveShiftPublicationTruth({
        shift: {
          id: shift.id,
          slots: shift.slots ?? null,
          status: shift.status ?? null,
          publication_status: shift.publication_status ?? null,
          claimable: shift.claimable ?? null,
        } as ShiftTruthShiftInput,
        assignments: (shift.workers ?? []).map((w) => ({
          status: w.assignment_status ?? "assigned",
          response_status: w.response_status ?? null,
        })) as never,
      });
      if (!truth.is_published && !truth.is_cancelled) {
        push(
          {
            id: `${shift.id}:not-published`,
            kind: "risk",
            priority: mins <= 12 * 60 ? "high" : "medium",
            status: "draft",
            headline: `${shift.title} asignado pero sin publicar`,
            because:
              truth.admin_blocking_reason ??
              "El equipo está asignado internamente y el servicio no está publicado.",
            impact: "Nadie del equipo ve este servicio en su portal.",
            action: perms.canOperate
              ? { label: "Publicar", href: ROUTES.shiftOps(shift.id, "summary") }
              : undefined,
            shiftId: shift.id,
          },
          "coverage",
          {
            type: "not_published",
            title: "Sin publicar",
            stage: "summary",
            severity: mins <= 12 * 60 ? "attention" : "prep",
            context: {
              peopleCount: assigned,
              expected: "Servicio publicado y visible para el equipo",
              current: truth.admin_label,
            },
          },
        );
      }
    }

    /* — Ubicación (Location Truth). Sólo si el llamador hidrató la entrada:
         sin datos NO se declara "falta ubicación" (anti falso positivo). — */
    if (shift.location) {
      const loc = resolveServiceLocationTruth(shift.location);
      if (loc.destinationStatus === "MISSING_DESTINATION") {
        push(
          {
            id: `${shift.id}:destination`,
            kind: "risk",
            priority: mins <= 4 * 60 ? "critical" : "high",
            status: "blocked",
            headline: `Sin destino operativo en ${shift.title}`,
            because: "El servicio no tiene sitio, dirección ni punto declarado.",
            impact: "El equipo no sabe a dónde ir.",
            action: perms.canOperate
              ? { label: "Definir ubicación", href: ROUTES.shiftOps(shift.id, "operation") }
              : undefined,
            shiftId: shift.id,
          },
          "coverage",
          {
            type: "missing_destination",
            title: "Falta ubicación",
            stage: "operation",
            context: {
              peopleCount: assigned,
              expected: "Un destino operativo declarado",
              current: "Sin destino",
            },
          },
        );
      } else if (loc.meetingPointMissing) {
        push(
          {
            id: `${shift.id}:meeting-point`,
            kind: "risk",
            priority: "medium",
            status: "warning",
            headline: `Falta punto de encuentro en ${shift.title}`,
            because: "El servicio requiere transporte y no hay punto de encuentro.",
            impact: "El equipo no sabe dónde abordar.",
            action: perms.canOperate
              ? { label: "Definir punto", href: ROUTES.shiftOps(shift.id, "operation") }
              : undefined,
            shiftId: shift.id,
          },
          "transport",
          {
            type: "missing_meeting_point",
            title: "Sin punto de encuentro",
            stage: "operation",
            severity: "prep",
            context: {
              peopleCount: assigned,
              expected: "Punto de encuentro declarado",
              current: "Sin punto de encuentro",
            },
          },
        );
      }
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


  const sortedAttention = attention.sort(
    (a, b) =>
      PRIORITY_WEIGHT[a.priority] + a._boost -
      (PRIORITY_WEIGHT[b.priority] + b._boost),
  );

  /* — Bandeja operativa: proyección de los mismos items, con contexto —
     No hay una segunda derivación: las alertas SON los items de atención
     que declararon metadatos de alerta. Una sola verdad, dos formatos. */
  const alerts: HubAlert[] = sortedAttention
    .filter((a) => a._alert && a.shiftId && a.context)
    .map((a) => ({
      id: a.id,
      shiftId: a.shiftId!,
      type: a._alert!.type,
      severity: a._alert!.severity,
      priority: a.priority,
      status: a.status,
      title: a._alert!.title,
      headline: a.headline,
      because: a.because,
      impact: a.impact,
      context: a.context!,
      stage: a._alert!.stage,
      cta: a.action,
      secondary: a.alternatives ?? [],
    }));

  const groupIndex = new Map<string, HubAlertGroup>();
  for (const alert of alerts) {
    const shift = input.shifts.find((s) => s.id === alert.shiftId);
    const existing = groupIndex.get(alert.shiftId);
    if (existing) {
      existing.alerts.push(alert);
      if (SEVERITY_WEIGHT[alert.severity] < SEVERITY_WEIGHT[existing.severity]) {
        existing.severity = alert.severity;
        existing.priority = alert.priority;
        existing.action = alert.cta ?? existing.action;
      }
      continue;
    }
    groupIndex.set(alert.shiftId, {
      shiftId: alert.shiftId,
      serviceRef: alert.context.serviceRef,
      title: shift?.title ?? alert.context.serviceRef ?? "Servicio",
      clientName: alert.context.clientName,
      whenLabel: alert.context.whenLabel,
      locationName: alert.context.locationName,
      severity: alert.severity,
      priority: alert.priority,
      alerts: [alert],
      action: alert.cta,
    });
  }
  const alertGroups = [...groupIndex.values()].sort(
    (a, b) => SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity],
  );

  const attentionItems = sortedAttention.map(
    ({ _boost, _alert, ...item }) => item,
  );


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
    alerts,
    alertGroups,
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

