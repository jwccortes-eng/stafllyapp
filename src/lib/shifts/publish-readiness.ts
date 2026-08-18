/**
 * PUBLISH READINESS — SSOT PHASE 2 (espejo puro del backend).
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin BD, sin escrituras, sin efectos.
 *
 * AUTORIDAD FINAL: `public.service_publish_readiness(shift_id)` (backend).
 * Este módulo es el ESPEJO EXACTO de esa función: mismos códigos de bloqueo,
 * mismos warnings, misma lectura de la política de compañía (`shifts_config`).
 * Toda superficie (chip, tarjetas, detalle, botón Publicar, PrePublishDialog,
 * bulk "Publicar listos") consume este módulo; el RPC `publish_shift_draft`
 * revalida siempre dentro de la transacción.
 *
 * REGLAS (idénticas en frontend y backend):
 *   terminal (cancelado/archivado/soft-deleted) → NUNCA publicable
 *   date / start_time / end_time                → obligatorios
 *   claimable=true  (Claim / Open staffing)     → publica con 0/Y, exige plazas > 0
 *   claimable=false (Direct staffing)           → exige ≥ 1 asignación activa
 *   company policy (shifts_config):
 *     require_location   → lugar del servicio (venue guardado, job site v2 o
 *                          dirección de texto libre; el punto de encuentro NO cuenta)
 *     require_client     → cliente vinculado
 *     require_shift_admin→ shift admin
 *     max_shift_hours    → duración máxima
 *   transporte activado sin conductor           → bloqueo
 *
 * Claimable describe STAFFING, nunca es un override de la política de compañía.
 */
import { isCancelledOrArchivedShift, type ShiftGuardInput } from "./shift-guards";
import { resolveShiftCapacity } from "./publication-truth";
import { resolveServiceLocationTruth } from "./service-location";
import type { StaffingAssignmentLike } from "./staffing-metrics";

export type PublishBlockerCode =
  | "company"
  | "permission"
  | "cancelled"
  | "date"
  | "start_time"
  | "end_time"
  | "duration"
  | "capacity"
  | "assignments"
  | "job_site"
  | "client"
  | "shift_admin"
  | "driver";

export type PublishWarningCode = "job_site_unsaved" | "meeting_missing" | "team_pending";

export type StaffingMode = "direct" | "claim";

/** Política de compañía tal como vive hoy en `shifts_config`. */
export interface PublishCompanyRequirements {
  requireClient?: boolean;
  requireLocation?: boolean;
  requireShiftAdmin?: boolean;
  maxShiftHours?: number;
}

export const PUBLISH_REQUIREMENTS_FALLBACK: Required<PublishCompanyRequirements> = {
  requireClient: false,
  requireLocation: false,
  requireShiftAdmin: false,
  maxShiftHours: 16,
};

/** Entrada normalizada — el mismo contrato que evalúa el backend. */
export interface PublishReadinessSpecInput {
  terminal: boolean;
  date: string | null | undefined;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  claimable: boolean;
  requiredCount: number;
  assignedCount: number;
  /** Lugar del servicio resuelto (venue, job site v2 o dirección libre). */
  hasJobSite: boolean;
  /** El lugar está guardado como registro (mapa/geofence disponibles). */
  hasSavedJobSite: boolean;
  hasMeetingPoint: boolean;
  hasClient: boolean;
  hasShiftAdmin: boolean;
  transportRequired: boolean;
  hasDriver: boolean;
  requirements?: PublishCompanyRequirements;
}

export interface PublishReadinessSpecResult {
  ok: boolean;
  terminal: boolean;
  mode: StaffingMode;
  blockers: PublishBlockerCode[];
  warnings: PublishWarningCode[];
  requirements: Required<PublishCompanyRequirements>;
}

const BLOCKER_TEXT: Record<PublishBlockerCode, string> = {
  company: "el servicio no tiene empresa válida",
  permission: "no tienes permiso para publicar servicios",
  cancelled: "el servicio está cancelado",
  date: "falta la fecha",
  start_time: "falta la hora de inicio",
  end_time: "falta la hora de fin",
  duration: "la duración no es válida para esta empresa",
  capacity: "no tiene plazas definidas para abrir a reclamo",
  assignments: "falta staffing directo (asigna a alguien o ábrelo a reclamo)",
  job_site: "falta definir el lugar del servicio",
  client: "falta el cliente",
  shift_admin: "falta el shift admin",
  driver: "transporte activado sin conductor asignado",
};

const WARNING_TEXT: Record<PublishWarningCode, string> = {
  job_site_unsaved:
    "Dirección agregada como texto · sin lugar guardado, mapa y geofence no estarán disponibles",
  meeting_missing: "Transporte activado sin punto de encuentro definido",
  team_pending: "Sin equipo asignado · el servicio queda abierto a reclamos",
};

export function describePublishBlockers(codes: string[]): string {
  if (codes.length === 0) return "datos incompletos";
  return codes.map((c) => BLOCKER_TEXT[c as PublishBlockerCode] ?? c).join(" · ");
}

export function describePublishBlocker(code: PublishBlockerCode | string): string {
  return BLOCKER_TEXT[code as PublishBlockerCode] ?? String(code);
}

export function describePublishWarning(code: PublishWarningCode | string): string {
  return WARNING_TEXT[code as PublishWarningCode] ?? String(code);
}

function durationMinutes(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return null;
  let min = eh * 60 + em - (sh * 60 + sm);
  if (min < 0) min += 24 * 60;
  return min;
}

/** Núcleo del SSOT — espejo 1:1 de `public.service_publish_readiness`. */
export function evaluatePublishReadiness(
  v: PublishReadinessSpecInput,
): PublishReadinessSpecResult {
  const requirements: Required<PublishCompanyRequirements> = {
    requireClient: v.requirements?.requireClient ?? PUBLISH_REQUIREMENTS_FALLBACK.requireClient,
    requireLocation:
      v.requirements?.requireLocation ?? PUBLISH_REQUIREMENTS_FALLBACK.requireLocation,
    requireShiftAdmin:
      v.requirements?.requireShiftAdmin ?? PUBLISH_REQUIREMENTS_FALLBACK.requireShiftAdmin,
    maxShiftHours: v.requirements?.maxShiftHours ?? PUBLISH_REQUIREMENTS_FALLBACK.maxShiftHours,
  };
  const mode: StaffingMode = v.claimable ? "claim" : "direct";

  if (v.terminal) {
    return { ok: false, terminal: true, mode, blockers: ["cancelled"], warnings: [], requirements };
  }

  const blockers: PublishBlockerCode[] = [];
  const warnings: PublishWarningCode[] = [];

  if (!v.date) blockers.push("date");
  if (!v.startTime) blockers.push("start_time");
  if (!v.endTime) blockers.push("end_time");

  if (mode === "claim") {
    if (v.requiredCount <= 0) blockers.push("capacity");
  } else if (v.assignedCount === 0) {
    blockers.push("assignments");
  }

  if (requirements.requireLocation && !v.hasJobSite) blockers.push("job_site");
  if (requirements.requireClient && !v.hasClient) blockers.push("client");
  if (requirements.requireShiftAdmin && !v.hasShiftAdmin) blockers.push("shift_admin");
  if (v.transportRequired && !v.hasDriver) blockers.push("driver");

  const min = durationMinutes(v.startTime, v.endTime);
  if (min !== null && (min === 0 || min / 60 > requirements.maxShiftHours)) {
    blockers.push("duration");
  }

  if (v.hasJobSite && !v.hasSavedJobSite) warnings.push("job_site_unsaved");
  if (v.transportRequired && !v.hasMeetingPoint) warnings.push("meeting_missing");
  if (v.claimable && v.assignedCount === 0) warnings.push("team_pending");

  return { ok: blockers.length === 0, terminal: false, mode, blockers, warnings, requirements };
}

// ---------------------------------------------------------------------------
// Adapter de fila (listas, chip, bulk, botón Publicar)
// ---------------------------------------------------------------------------

export interface DraftPublishShiftInput extends ShiftGuardInput {
  id?: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  slots?: number | null;
  claimable?: boolean | null;
  client_id?: string | null;
  location_id?: string | null;
  job_site_location_id?: string | null;
  job_site_address?: string | null;
  meeting_point?: string | null;
  meeting_point_location_id?: string | null;
  transportation_required?: boolean | null;
  driver_employee_id?: string | null;
  shift_admin_id?: string | null;
  company_id?: string | null;
}

export interface DraftPublishReadiness {
  ready: boolean;
  /** Terminal: cancelado/archivado. Nunca publicable, ni en bulk ni individual. */
  terminal: boolean;
  staffingMode: StaffingMode;
  blockers: PublishBlockerCode[];
  warnings: PublishWarningCode[];
  /** Motivo en lenguaje operativo, listo para toast. null cuando está listo. */
  reason: string | null;
  requiredCount: number;
  assignedCount: number;
  openSlots: number;
  requirements: Required<PublishCompanyRequirements>;
}

export function resolveDraftPublishReadiness(
  shift: DraftPublishShiftInput,
  assignments: StaffingAssignmentLike[] = [],
  requirements?: PublishCompanyRequirements,
): DraftPublishReadiness {
  const capacity = resolveShiftCapacity(shift, assignments);
  const loc = resolveServiceLocationTruth({
    location_id: shift.location_id ?? null,
    job_site_location_id: shift.job_site_location_id ?? null,
    job_site_address: shift.job_site_address ?? null,
    meeting_point: shift.meeting_point ?? null,
    meeting_point_location_id: shift.meeting_point_location_id ?? null,
    transportation_required: shift.transportation_required ?? false,
  });

  const spec = evaluatePublishReadiness({
    terminal: isCancelledOrArchivedShift(shift),
    date: shift.date,
    startTime: shift.start_time,
    endTime: shift.end_time,
    claimable: shift.claimable === true,
    requiredCount: capacity.required_count,
    assignedCount: capacity.assigned_count,
    hasJobSite: loc.destinationStatus === "RESOLVED",
    hasSavedJobSite:
      loc.destinationSource === "job_site_v2" || loc.destinationSource === "legacy_venue",
    hasMeetingPoint: Boolean(
      shift.meeting_point_location_id || (shift.meeting_point ?? "").trim(),
    ),
    hasClient: Boolean(shift.client_id),
    hasShiftAdmin: Boolean(shift.shift_admin_id),
    transportRequired: shift.transportation_required === true,
    hasDriver: Boolean(shift.driver_employee_id),
    requirements,
  });

  return {
    ready: spec.ok,
    terminal: spec.terminal,
    staffingMode: spec.mode,
    blockers: spec.blockers,
    warnings: spec.warnings,
    reason: spec.ok ? null : describePublishBlockers(spec.blockers),
    requiredCount: capacity.required_count,
    assignedCount: capacity.assigned_count,
    openSlots: capacity.open_slots,
    requirements: spec.requirements,
  };
}

/**
 * Borradores que la acción "Publicar listos" puede intentar realmente.
 * Excluye publicados, bloqueados (locked), cancelados y borradores BLOCKED.
 */
export function selectPublishableDrafts<T extends DraftPublishShiftInput & { id: string }>(
  shifts: T[],
  assignmentsByShift: (shiftId: string) => StaffingAssignmentLike[],
  requirements?: PublishCompanyRequirements,
): { ready: T[]; blocked: { shift: T; readiness: DraftPublishReadiness }[] } {
  const ready: T[] = [];
  const blocked: { shift: T; readiness: DraftPublishReadiness }[] = [];
  for (const s of shifts) {
    if ((s.status ?? "").toLowerCase() === "locked") continue;
    if ((s.publication_status ?? "published") !== "draft") continue;
    const readiness = resolveDraftPublishReadiness(s, assignmentsByShift(s.id), requirements);
    if (readiness.ready) ready.push(s);
    else blocked.push({ shift: s, readiness });
  }
  return { ready, blocked };
}
