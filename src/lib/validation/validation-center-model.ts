/**
 * OX-4.4 — Modelo puro del Centro de Validación.
 *
 * Única fuente de derivación de la cola de validaciones. No hace fetch,
 * no muta, no conoce React y no calcula payroll.
 *
 * Reglas duras:
 *  - Payroll sigue leyendo horas reales de `time_entries`. Este modelo NO
 *    calcula rates, overtime, ni horas programadas. Las horas mostradas son
 *    horas reales derivadas de fichajes (entrada/salida/descanso).
 *  - `time_entries` y `shift_closeout_reports` son responsabilidades
 *    SEPARADAS: horas reales vs evidencia operativa del cierre. Un item
 *    nunca mezcla ambas fuentes.
 *  - Permisos fail-closed: sin permisos resueltos no hay acciones.
 */

import {
  resolveHubPermissions,
  type HubPermissions,
  type ResolvedHubPermissions,
} from "@/lib/command-center/today-hub-model";
import type { StatusKey } from "@/lib/status/status-registry";

/* ── Tipos de validación ─────────────────────────────────────────────── */

export type ValidationType =
  /** Horas reales fichadas pendientes de aprobación. Fuente: time_entries. */
  | "hours_approval"
  /** Cierre operacional enviado por capitán. Fuente: shift_closeout_reports. */
  | "shift_closeout"
  /** Falta evidencia para decidir (p. ej. sin salida registrada). */
  | "evidence_review"
  /** Incidencia reportada en el cierre. */
  | "incident_review"
  /** Corrección solicitada, esperando al worker/capitán. */
  | "correction_requested"
  /** Cierre escalado o con seguimiento requerido. */
  | "exception_review"
  /** Turno operacionalmente listo para avanzar hacia payroll. */
  | "ready_for_payroll";

/** Fuente de datos del item. Nunca se mezclan en un mismo item. */
export type ValidationSource = "time_entries" | "shift_closeout_reports";

export type ValidationStatus =
  | "pending"
  | "under_review"
  | "correction_requested"
  | "approved"
  | "rejected"
  | "resolved"
  | "ready_for_payroll";

export type ValidationPriority = "urgent" | "high" | "normal" | "low";

export type ValidationActionKind =
  | "approve"
  | "reject"
  | "request_correction"
  | "view_evidence"
  | "comment"
  | "assign"
  | "mark_resolved"
  | "open_shift"
  | "review_hours";

export interface ValidationEvidence {
  label: string;
  value: string;
  /** Marca el dato que motiva la revisión. */
  attention?: boolean;
}

/* ── OX-4.4.1 — Capa humana ──────────────────────────────────────────── */

/** Persona sobre la que se decide. Null cuando la decisión es del turno. */
export interface ValidationPerson {
  name: string;
  avatarUrl: string | null;
  role: string | null;
}

/** Contexto operativo reconocible: turno, cliente, cuándo. */
export interface ValidationContext {
  shiftTitle: string | null;
  clientName: string | null;
  /** Ya formateada: "31 de julio". */
  dateLabel: string | null;
  /** Ya formateado: "08:00–16:00". */
  timeRange: string | null;
}

export type ValidationHumanRole =
  | "created_by"
  | "supervised_by"
  | "requested_correction"
  | "awaiting"
  | "updated";

/** Dato humano real. Nunca se inventa: si no hay dato, no hay entrada. */
export interface ValidationHumanNote {
  kind: ValidationHumanRole;
  label: string;
  value: string;
  at?: string | null;
}

/** Mensaje real ya existente en el registro. No es un chat nuevo. */
export interface ValidationMessage {
  id: string;
  author: string;
  /** Papel de quien habla, en lenguaje operativo. */
  authorRole: string;
  body: string;
  at: string | null;
  tone: "worker" | "supervisor" | "client" | "system";
}


export interface ValidationItemPermissions {
  canApprove: boolean;
  canReject: boolean;
  canRequestCorrection: boolean;
  canResolve: boolean;
  canAssign: boolean;
  canComment: boolean;
  canViewEvidence: boolean;
}

export const NO_ITEM_PERMISSIONS: ValidationItemPermissions = {
  canApprove: false,
  canReject: false,
  canRequestCorrection: false,
  canResolve: false,
  canAssign: false,
  canComment: false,
  canViewEvidence: false,
};

export interface ValidationAction {
  kind: ValidationActionKind;
  label: string;
  /** Consecuencia visible antes de decidir. */
  consequence?: string;
  /** Sólo informativa/navegación: no escribe nada. */
  readOnly?: boolean;
  /** Requiere motivo escrito obligatorio. */
  requiresReason?: boolean;
}

export interface ValidationItem {
  /** Estable: `<source>:<recordId>`. */
  id: string;
  source: ValidationSource;
  /** Id del registro real en su tabla de origen. */
  recordId: string;
  validationType: ValidationType;
  /** Identidad visible: persona o turno. Nunca un código técnico. */
  title: string;
  subtitle: string | null;
  /** Decisión pendiente en una frase legible en <3s. */
  headline: string;
  /** Persona sobre la que se decide, cuando aplica. */
  person: ValidationPerson | null;
  /** Turno · cliente · fecha. */
  context: ValidationContext;
  relatedShiftId: string | null;
  relatedWorkerId: string | null;
  status: ValidationStatus;
  /** Clave del STATUS_REGISTRY. Nunca mapas cromáticos locales. */
  statusKey: StatusKey;
  priority: ValidationPriority;
  /** Evidencia principal: la que sostiene la decisión. */
  evidence: ValidationEvidence[];
  /** Evidencia de apoyo. Se muestra colapsada. */
  secondaryEvidence: ValidationEvidence[];
  /** Personas implicadas y última actualización. Sólo datos reales. */
  humanContext: ValidationHumanNote[];
  /** Comentarios ya registrados en el propio flujo. No es un chat nuevo. */
  conversation: ValidationMessage[];
  /** Qué debe pasar para cerrar este item, en una frase. */
  requiredAction: string;
  assignedTo: string | null;
  dueAt: string | null;
  permissions: ValidationItemPermissions;
  auditSummary: string;
  /** Acción principal única. */
  primaryAction: ValidationAction | null;
  /** Acciones secundarias, van a menú contextual. */
  secondaryActions: ValidationAction[];
}


export interface ValidationSummary {
  total: number;
  pending: number;
  urgent: number;
  returned: number;
  resolved: number;
  /** Horas reales pendientes de aprobar (suma de fichajes cerrados). */
  hoursPendingApproval: number;
  /** Turnos con cierre esperando revisión. */
  closeoutsPendingReview: number;
  /** Turnos que ya pueden avanzar hacia payroll. */
  readyForPayroll: number;
  /** Items sin evidencia suficiente para decidir. */
  missingEvidence: number;
}

export interface ValidationRisk {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
}

export interface ValidationCenterModel {
  pendingItems: ValidationItem[];
  urgentItems: ValidationItem[];
  returnedItems: ValidationItem[];
  resolvedItems: ValidationItem[];
  summary: ValidationSummary;
  /** Acción sugerida a nivel de centro. Null si no hay nada que decidir. */
  primaryAction: {
    label: string;
    /** Item al que apunta la acción. */
    itemId: string | null;
    reason: string;
  } | null;
  risks: ValidationRisk[];
  /** Fail-closed: false ⇒ toda la superficie es lectura. */
  readOnly: boolean;
}

/* ── Entradas ────────────────────────────────────────────────────────── */

/** Contexto operativo compartido por ambas fuentes. Todo opcional y real. */
export interface ShiftContextInput {
  shift_title?: string | null;
  client_name?: string | null;
  /** Fecha ISO (YYYY-MM-DD) del turno. */
  shift_date?: string | null;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
}

export interface HoursEntryInput extends ShiftContextInput {
  id: string;
  employee_id: string | null;
  worker_name: string | null;
  worker_avatar_url?: string | null;
  worker_role?: string | null;
  shift_id: string | null;
  shift_label?: string | null;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number | null;
  /** pending | approved | rejected (estado de revisión, nunca valor de hora). */
  status: string | null;
  approved_at?: string | null;
  approved_by_name?: string | null;
  /** Comentario real del fichaje (worker o quien lo registró). */
  notes?: string | null;
  /** manual | qr | kiosk … origen del fichaje. */
  entry_source?: string | null;
  /** Responsable operativo del turno, si está definido. */
  shift_admin_name?: string | null;
}

export interface CloseoutInput extends ShiftContextInput {
  id: string;
  shift_id: string | null;
  shift_label?: string | null;
  status: string | null;
  review_status: string | null;
  final_approval_status: string | null;
  incident_count: number | null;
  no_show_count: number | null;
  late_count: number | null;
  staff_count_reported: number | null;
  notes: string | null;
  submitted_at: string | null;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
  /** Quién envió el cierre (capitán / supervisor). */
  submitted_by_name?: string | null;
  /** Rol declarado de quien cerró. */
  submitted_role?: string | null;
  submitted_avatar_url?: string | null;
  review_notes?: string | null;
  client_feedback?: string | null;
  final_approval_notes?: string | null;
  final_approved_by_name?: string | null;
  final_approved_at?: string | null;
  uniform_ok?: boolean | null;
  updated_at?: string | null;

}

export interface ValidationCenterInput {
  hours: HoursEntryInput[];
  closeouts: CloseoutInput[];
  permissions?: HubPermissions;
  /** Fail-closed: si el resolver no terminó, todo es lectura. */
  permissionsResolved?: boolean;
  now?: Date;
  /** Filtro de foco por deep-link. */
  focusShiftId?: string | null;
}

/* ── Helpers puros ───────────────────────────────────────────────────── */

const HOUR_MS = 3_600_000;

/** Horas reales de fichaje. Nunca horas programadas. */
export function realHours(entry: HoursEntryInput): number | null {
  if (!entry.clock_in || !entry.clock_out) return null;
  const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const h = ms / HOUR_MS - (entry.break_minutes ?? 0) / 60;
  return Math.round(Math.max(0, h) * 100) / 100;
}

function hoursSinceIso(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / HOUR_MS;
}

function addHoursIso(iso: string | null, hours: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + hours * HOUR_MS).toISOString();
}

const STATUS_KEY_BY_STATUS: Record<ValidationStatus, StatusKey> = {
  pending: "pending",
  under_review: "under_review",
  correction_requested: "correction_requested",
  approved: "approved",
  rejected: "rejected",
  resolved: "resolved",
  ready_for_payroll: "ready_for_payroll",
};

const PRIORITY_ORDER: Record<ValidationPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const ACTIONABLE: ValidationStatus[] = ["pending", "under_review"];
const RETURNED: ValidationStatus[] = ["correction_requested", "rejected"];

function workerLabel(name: string | null | undefined): string {
  return (name ?? "").trim() || "Worker";
}

function shiftLabel(item: { shift_label?: string | null; shift_id: string | null }): string | null {
  return (item.shift_label ?? "").trim() || null;
}

/* ── Constructores por tipo ──────────────────────────────────────────── */

function permsForHours(p: ResolvedHubPermissions): ValidationItemPermissions {
  return {
    canApprove: p.canApproveHours,
    canReject: p.canApproveHours,
    canRequestCorrection: p.canApproveHours,
    canResolve: false,
    canAssign: p.canManageAttendance,
    canComment: p.canAccessValidations,
    canViewEvidence: p.canAccessValidations,
  };
}

function permsForCloseout(p: ResolvedHubPermissions): ValidationItemPermissions {
  return {
    canApprove: p.canReviewCloseout,
    canReject: p.canReviewCloseout,
    canRequestCorrection: p.canReviewCloseout,
    canResolve: p.canReviewCloseout,
    canAssign: p.canOperate,
    canComment: p.canAccessValidations,
    canViewEvidence: p.canAccessValidations,
  };
}

function buildHoursItem(
  e: HoursEntryInput,
  p: ResolvedHubPermissions,
  now: Date,
): ValidationItem {
  const raw = (e.status ?? "pending").toLowerCase();
  const hours = realHours(e);
  const missingClockOut = !!e.clock_in && !e.clock_out;
  const name = workerLabel(e.worker_name);
  const perms = permsForHours(p);

  // 1. Corrección solicitada — esperando al worker, no es decisión nuestra.
  if (raw === "rejected") {
    return {
      id: `time_entries:${e.id}`,
      source: "time_entries",
      recordId: e.id,
      validationType: "correction_requested",
      title: `Corrección solicitada — ${name}`,
      subtitle: shiftLabel(e),
      relatedShiftId: e.shift_id,
      relatedWorkerId: e.employee_id,
      status: "correction_requested",
      statusKey: STATUS_KEY_BY_STATUS.correction_requested,
      priority: "high",
      evidence: [
        { label: "Horas reales", value: hours === null ? "Sin salida" : `${hours} h`, attention: hours === null },
        { label: "Estado", value: "Devuelto para corrección", attention: true },
      ],
      requiredAction: "El fichaje debe corregirse antes de volver a revisión.",
      assignedTo: name,
      dueAt: addHoursIso(e.clock_in, 48),
      permissions: perms,
      auditSummary: "Devolución registrada en auditoría. Fuera de payroll hasta corregirse.",
      primaryAction: perms.canApprove
        ? { kind: "approve", label: "Aprobar horas corregidas", consequence: "Quedan listas para payroll." }
        : { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      secondaryActions: [
        { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
        { kind: "open_shift", label: "Abrir turno", readOnly: true },
      ],
    };
  }

  // 2. Aprobado — listo para payroll.
  if (raw === "approved") {
    return {
      id: `time_entries:${e.id}`,
      source: "time_entries",
      recordId: e.id,
      validationType: "ready_for_payroll",
      title: `Horas aprobadas — ${name}`,
      subtitle: shiftLabel(e),
      relatedShiftId: e.shift_id,
      relatedWorkerId: e.employee_id,
      status: "ready_for_payroll",
      statusKey: STATUS_KEY_BY_STATUS.ready_for_payroll,
      priority: "low",
      evidence: [
        { label: "Horas reales", value: hours === null ? "Sin salida" : `${hours} h` },
      ],
      requiredAction: "Nada pendiente. Payroll leerá estas horas reales.",
      assignedTo: null,
      dueAt: null,
      permissions: perms,
      auditSummary: "Aprobación registrada con autor y fecha.",
      primaryAction: { kind: "review_hours", label: "Ver horas", readOnly: true },
      secondaryActions: [{ kind: "open_shift", label: "Abrir turno", readOnly: true }],
    };
  }

  // 3. Sin salida registrada — falta evidencia para decidir.
  if (missingClockOut) {
    const openFor = hoursSinceIso(e.clock_in, now) ?? 0;
    return {
      id: `time_entries:${e.id}`,
      source: "time_entries",
      recordId: e.id,
      validationType: "evidence_review",
      title: `Sin salida registrada — ${name}`,
      subtitle: shiftLabel(e),
      relatedShiftId: e.shift_id,
      relatedWorkerId: e.employee_id,
      status: "under_review",
      statusKey: STATUS_KEY_BY_STATUS.under_review,
      priority: openFor >= 12 ? "urgent" : "high",
      evidence: [
        { label: "Entrada", value: e.clock_in ? new Date(e.clock_in).toLocaleString("es") : "—" },
        { label: "Salida", value: "No registrada", attention: true },
        { label: "Abierto hace", value: `${Math.max(0, Math.round(openFor))} h`, attention: openFor >= 12 },
      ],
      requiredAction: "Registrar la salida real antes de aprobar. Stafly no inventa horas.",
      assignedTo: name,
      dueAt: addHoursIso(e.clock_in, 12),
      permissions: perms,
      auditSummary: "Sin decisión terminal registrada.",
      primaryAction: perms.canRequestCorrection
        ? {
            kind: "request_correction",
            label: "Solicitar corrección",
            consequence: "El fichaje queda fuera de payroll hasta corregirse.",
            requiresReason: true,
          }
        : { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      secondaryActions: [
        { kind: "review_hours", label: "Revisar horas", readOnly: true },
        { kind: "open_shift", label: "Abrir turno", readOnly: true },
      ],
    };
  }

  // 4. Pendiente de aprobación con evidencia completa.
  return {
    id: `time_entries:${e.id}`,
    source: "time_entries",
    recordId: e.id,
    validationType: "hours_approval",
    title: `Aprobar horas — ${name}`,
    subtitle: shiftLabel(e),
    relatedShiftId: e.shift_id,
    relatedWorkerId: e.employee_id,
    status: "pending",
    statusKey: STATUS_KEY_BY_STATUS.pending,
    priority: (hoursSinceIso(e.clock_out, now) ?? 0) >= 48 ? "high" : "normal",
    evidence: [
      { label: "Horas reales", value: `${hours ?? 0} h` },
      { label: "Entrada", value: e.clock_in ? new Date(e.clock_in).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "—" },
      { label: "Salida", value: e.clock_out ? new Date(e.clock_out).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "—" },
      { label: "Descanso", value: `${e.break_minutes ?? 0} min` },
    ],
    requiredAction: "Aprobar o devolver estas horas reales.",
    assignedTo: null,
    dueAt: addHoursIso(e.clock_out, 48),
    permissions: perms,
    auditSummary: "Sin decisión terminal registrada.",
    primaryAction: perms.canApprove
      ? {
          kind: "approve",
          label: "Aprobar horas",
          consequence: "Este turno podrá avanzar hacia payroll con horas reales.",
        }
      : { kind: "review_hours", label: "Ver horas", readOnly: true },
    secondaryActions: [
      {
        kind: "request_correction",
        label: "Solicitar corrección",
        consequence: "Queda fuera de payroll hasta corregirse.",
        requiresReason: true,
      },
      { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      { kind: "open_shift", label: "Abrir turno", readOnly: true },
    ],
  };
}

function buildCloseoutItem(
  c: CloseoutInput,
  p: ResolvedHubPermissions,
  now: Date,
): ValidationItem | null {
  const status = (c.status ?? "draft").toLowerCase();
  if (status === "draft") return null; // aún no es una decisión

  const review = (c.review_status ?? "").toLowerCase();
  const final = (c.final_approval_status ?? "").toLowerCase();
  const incidents = (c.incident_count ?? 0) + (c.no_show_count ?? 0);
  const perms = permsForCloseout(p);
  const label = shiftLabel(c) ?? "Turno";
  const age = hoursSinceIso(c.submitted_at, now) ?? 0;

  const baseEvidence: ValidationEvidence[] = [
    { label: "Personal reportado", value: String(c.staff_count_reported ?? 0) },
    { label: "Incidencias", value: String(c.incident_count ?? 0), attention: (c.incident_count ?? 0) > 0 },
    { label: "No-shows", value: String(c.no_show_count ?? 0), attention: (c.no_show_count ?? 0) > 0 },
    { label: "Tardanzas", value: String(c.late_count ?? 0), attention: (c.late_count ?? 0) > 0 },
  ];

  const common = {
    id: `shift_closeout_reports:${c.id}`,
    source: "shift_closeout_reports" as const,
    recordId: c.id,
    relatedShiftId: c.shift_id,
    relatedWorkerId: null,
    subtitle: c.notes?.trim() || null,
    permissions: perms,
    evidence: baseEvidence,
  };

  // Excepción / seguimiento escalado.
  if (review === "escalated" || review === "needs_followup") {
    return {
      ...common,
      validationType: "exception_review",
      title: `Excepción de cierre — ${label}`,
      status: "under_review",
      statusKey: STATUS_KEY_BY_STATUS.under_review,
      priority: review === "escalated" ? "urgent" : "high",
      requiredAction: "Resolver el seguimiento antes de dar el cierre por bueno.",
      assignedTo: c.reviewer_name ?? null,
      dueAt: addHoursIso(c.submitted_at, 24),
      auditSummary: `Revisión previa: ${review}. Historial conservado en el reporte de cierre.`,
      primaryAction: perms.canResolve
        ? { kind: "mark_resolved", label: "Marcar resuelto", consequence: "El cierre queda aprobado y auditado." }
        : { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      secondaryActions: [
        { kind: "reject", label: "Rechazar cierre", requiresReason: true, consequence: "El capitán deberá reenviar el cierre." },
        { kind: "open_shift", label: "Abrir turno", readOnly: true },
      ],
    };
  }

  // Rechazado — devuelto al capitán.
  if (status === "rejected" || review === "rejected") {
    return {
      ...common,
      validationType: "correction_requested",
      title: `Cierre devuelto — ${label}`,
      status: "rejected",
      statusKey: STATUS_KEY_BY_STATUS.rejected,
      priority: "high",
      requiredAction: "El capitán debe reenviar el cierre con la evidencia corregida.",
      assignedTo: null,
      dueAt: null,
      auditSummary: "Rechazo registrado con revisor y fecha.",
      primaryAction: { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      secondaryActions: [{ kind: "open_shift", label: "Abrir turno", readOnly: true }],
    };
  }

  // Revisado y aprobado.
  if (status === "reviewed" && review === "approved") {
    const ready = final === "approved";
    return {
      ...common,
      validationType: ready ? "ready_for_payroll" : "shift_closeout",
      title: ready ? `Cierre listo para payroll — ${label}` : `Aprobación final pendiente — ${label}`,
      status: ready ? "ready_for_payroll" : "under_review",
      statusKey: ready ? STATUS_KEY_BY_STATUS.ready_for_payroll : STATUS_KEY_BY_STATUS.under_review,
      priority: ready ? "low" : "normal",
      requiredAction: ready
        ? "Nada pendiente. El turno está operacionalmente listo."
        : "Falta la firma final de disponibilidad operativa.",
      assignedTo: c.reviewer_name ?? null,
      dueAt: ready ? null : addHoursIso(c.submitted_at, 48),
      auditSummary: "Revisión de cierre registrada con revisor y fecha.",
      primaryAction: ready
        ? { kind: "open_shift", label: "Abrir turno", readOnly: true }
        : perms.canApprove
          ? { kind: "approve", label: "Firmar aprobación final", consequence: "Marca el turno como listo. No paga ni recalcula payroll." }
          : { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      secondaryActions: [{ kind: "open_shift", label: "Abrir turno", readOnly: true }],
    };
  }

  // Incidencia sin revisar.
  if (incidents > 0) {
    return {
      ...common,
      validationType: "incident_review",
      title: `Incidencia en el turno — ${label}`,
      status: "pending",
      statusKey: STATUS_KEY_BY_STATUS.pending,
      priority: (c.no_show_count ?? 0) > 0 ? "urgent" : "high",
      requiredAction: "Revisar la incidencia reportada y dejar constancia.",
      assignedTo: null,
      dueAt: addHoursIso(c.submitted_at, 24),
      auditSummary: "Reporte de cierre enviado por el capitán. Sin decisión terminal.",
      primaryAction: perms.canResolve
        ? { kind: "mark_resolved", label: "Marcar resuelto", consequence: "La incidencia queda cerrada; no afecta otras validaciones." }
        : { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      secondaryActions: [
        { kind: "request_correction", label: "Solicitar corrección", requiresReason: true, consequence: "El capitán deberá reenviar el cierre." },
        { kind: "open_shift", label: "Abrir turno", readOnly: true },
      ],
    };
  }

  // Cierre enviado, esperando revisión.
  return {
    ...common,
    validationType: "shift_closeout",
    title: `Revisar cierre — ${label}`,
    status: "pending",
    statusKey: STATUS_KEY_BY_STATUS.pending,
    priority: age >= 24 ? "high" : "normal",
    requiredAction: "Revisar la evidencia del cierre y aprobar o devolver.",
    assignedTo: null,
    dueAt: addHoursIso(c.submitted_at, 24),
    auditSummary: "Reporte de cierre enviado por el capitán. Sin decisión terminal.",
    primaryAction: perms.canApprove
      ? {
          kind: "approve",
          label: "Aprobar cierre",
          consequence: "Registra la evidencia como válida. No modifica el turno ni payroll.",
        }
      : { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
    secondaryActions: [
      { kind: "reject", label: "Rechazar cierre", requiresReason: true, consequence: "El capitán deberá reenviar el cierre." },
      { kind: "view_evidence", label: "Ver evidencia", readOnly: true },
      { kind: "open_shift", label: "Abrir turno", readOnly: true },
    ],
  };
}

/* ── Modelo ──────────────────────────────────────────────────────────── */

function sortItems(a: ValidationItem, b: ValidationItem): number {
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (p !== 0) return p;
  const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
  return da - db;
}

export function buildValidationCenterModel(
  input: ValidationCenterInput,
): ValidationCenterModel {
  const now = input.now ?? new Date();
  const resolved = input.permissionsResolved === true;
  // Fail-closed: sin resolver de permisos confirmado, todo es lectura.
  const perms = resolved
    ? resolveHubPermissions(input.permissions)
    : resolveHubPermissions(undefined);

  const focus = input.focusShiftId ?? null;
  const inFocus = (shiftId: string | null) => !focus || shiftId === focus;

  const items: ValidationItem[] = [];

  for (const e of input.hours) {
    if (!inFocus(e.shift_id)) continue;
    items.push(buildHoursItem(e, perms, now));
  }
  for (const c of input.closeouts) {
    if (!inFocus(c.shift_id)) continue;
    const item = buildCloseoutItem(c, perms, now);
    if (item) items.push(item);
  }

  const actionable = items.filter((i) => ACTIONABLE.includes(i.status));
  const urgentItems = actionable.filter((i) => i.priority === "urgent").sort(sortItems);
  const pendingItems = actionable.filter((i) => i.priority !== "urgent").sort(sortItems);
  const returnedItems = items.filter((i) => RETURNED.includes(i.status)).sort(sortItems);
  const resolvedItems = items
    .filter((i) => !ACTIONABLE.includes(i.status) && !RETURNED.includes(i.status))
    .sort(sortItems);

  const hoursPendingApproval = input.hours
    .filter((e) => inFocus(e.shift_id) && (e.status ?? "pending").toLowerCase() === "pending" && e.clock_out)
    .reduce((sum, e) => sum + (realHours(e) ?? 0), 0);

  const summary: ValidationSummary = {
    total: items.length,
    pending: actionable.length,
    urgent: urgentItems.length,
    returned: returnedItems.length,
    resolved: resolvedItems.length,
    hoursPendingApproval: Math.round(hoursPendingApproval * 100) / 100,
    closeoutsPendingReview: actionable.filter(
      (i) => i.source === "shift_closeout_reports" && i.validationType === "shift_closeout",
    ).length,
    readyForPayroll: items.filter((i) => i.status === "ready_for_payroll").length,
    missingEvidence: items.filter((i) => i.validationType === "evidence_review").length,
  };

  const head = urgentItems[0] ?? pendingItems[0] ?? null;
  const canDecide = head?.primaryAction && head.primaryAction.readOnly !== true;

  const primaryAction = head
    ? {
        label: canDecide ? head.primaryAction!.label : "Revisar validaciones",
        itemId: head.id,
        reason: canDecide
          ? head.requiredAction
          : "No tienes permisos para decidir. Puedes revisar la evidencia.",
      }
    : null;

  const risks: ValidationRisk[] = [];
  if (summary.missingEvidence > 0) {
    risks.push({
      id: "missing-evidence",
      title: "Fichajes sin salida registrada",
      detail: `${summary.missingEvidence} registro(s) no tienen salida. Stafly no completa horas automáticamente.`,
      severity: "critical",
    });
  }
  if (summary.returned > 0) {
    risks.push({
      id: "returned",
      title: "Correcciones esperando respuesta",
      detail: `${summary.returned} item(s) están fuera de payroll hasta que se corrijan.`,
      severity: "warning",
    });
  }
  if (!resolved) {
    risks.push({
      id: "permissions",
      title: "Permisos no verificados",
      detail: "Mostrando el centro en modo lectura hasta confirmar tu rol en esta compañía.",
      severity: "warning",
    });
  }

  return {
    pendingItems,
    urgentItems,
    returnedItems,
    resolvedItems,
    summary,
    primaryAction,
    risks,
    readOnly: !resolved,
  };
}

export const VALIDATION_TYPE_LABEL: Record<ValidationType, string> = {
  hours_approval: "Aprobación de horas",
  shift_closeout: "Cierre de turno",
  evidence_review: "Revisión de evidencia",
  incident_review: "Incidencia",
  correction_requested: "Corrección solicitada",
  exception_review: "Excepción",
  ready_for_payroll: "Listo para payroll",
};

export const PRIORITY_LABEL: Record<ValidationPriority, string> = {
  urgent: "Urgente",
  high: "Alta",
  normal: "Normal",
  low: "Baja",
};
