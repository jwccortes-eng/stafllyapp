/**
 * shift-operations-intelligence.ts
 *
 * Pure, frontend-only, read-only heuristics for the Shift Operations screen.
 * Powers the "operational copilot" UX (status / missing / risks / next
 * actions / candidate reasons) without any backend, schema, payroll,
 * time_entries, attendance, RLS, edge, or Connecteam involvement.
 *
 * Design rules baked in:
 *  - Never claim "available" for a worker if we have no real availability
 *    signal — only assignment status and same-day conflicts are considered.
 *  - Never use scheduled hours to imply payroll; this module is purely UX.
 *  - All helpers are deterministic and side-effect free.
 */

import { isEmployeeDriver } from "@/components/shifts/types";
import { resolveShiftLocationTruth } from "./service-location";

// ── Types ─────────────────────────────────────────────────────────────────

export type ShiftLike = {
  id: string;
  title?: string | null;
  status: string;
  publication_status?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  slots: number | null;
  client_id: string | null;
  location_id: string | null;
  meeting_point?: string | null;
  meeting_point_location_id?: string | null;
  job_site_location_id?: string | null;
  job_site_address?: string | null;
  manual_address?: string | null;
  special_instructions?: string | null;
  transportation_required?: boolean | null;
  car_capacity?: number | null;
  shift_admin_id?: string | null;
  driver_employee_id?: string | null;
  notes?: string | null;
};

export type AssignmentLike = {
  id: string;
  employee_id: string;
  status: string;            // pending | accepted | confirmed | rejected | removed
  assignment_role: string;
  employee?: {
    first_name?: string | null;
    last_name?: string | null;
    phone_number?: string | null;
    county?: string | null;
    has_car?: string | null;
    can_drive?: boolean | null;
  } | null;
};

export type EmployeeLike = {
  id: string;
  first_name: string;
  last_name: string;
  county?: string | null;
  has_car?: string | null;
  can_drive?: boolean | null;
  phone_number?: string | null;
};

// ── Status ────────────────────────────────────────────────────────────────

export type OperationalStatusCode =
  | "draft_needs_staffing"
  | "draft_missing_info"
  | "draft_ready_to_publish"
  | "published_at_risk"
  | "published_needs_info"
  | "published_ready"
  | "locked"
  | "cancelled"
  | "archived"
  | "completed";

export interface OperationalStatus {
  code: OperationalStatusCode;
  label: string;          // short chip ("Borrador", "En riesgo"…)
  tone: "neutral" | "info" | "warn" | "danger" | "success";
  message: string;        // full human sentence for the smart summary card
}

const isDraft = (s: ShiftLike) =>
  s.status === "draft" || s.publication_status === "draft";

function activeAssignments(a: AssignmentLike[]): AssignmentLike[] {
  return a.filter(x => x.status !== "rejected" && x.status !== "removed");
}
function confirmedAssignments(a: AssignmentLike[]): AssignmentLike[] {
  return a.filter(x => x.status === "confirmed" || x.status === "accepted");
}

/**
 * P0 Service Location SSOT — la ubicación se deriva SIEMPRE del resolver
 * canónico a partir de la fila del turno. Los `ctx` heredados se ignoran:
 * ya no existen booleanos inline en las pantallas.
 */
function locationTruthOf(shift: ShiftLike) {
  return resolveShiftLocationTruth({
    location_id: shift.location_id,
    job_site_location_id: shift.job_site_location_id,
    job_site_address: shift.job_site_address ?? shift.manual_address,
    meeting_point: shift.meeting_point,
    meeting_point_location_id: shift.meeting_point_location_id,
    transportation_required: shift.transportation_required,
  });
}

export function getShiftOperationalStatus(
  shift: ShiftLike,
  assignments: AssignmentLike[],
  _ctx?: { hasLocation?: boolean; hasMeetingPoint?: boolean },
): OperationalStatus {
  const loc = locationTruthOf(shift);
  const ctx = {
    hasLocation: loc.destinationStatus === "RESOLVED",
    // Solo cuenta como pendiente si el transporte lo exige.
    meetingPending: loc.meetingPointMissing,
  };
  const slots = shift.slots ?? 0;
  const active = activeAssignments(assignments).length;
  const confirmed = confirmedAssignments(assignments).length;
  const missingWorkers = Math.max(0, slots - confirmed);

  if (shift.status === "locked") {
    return {
      code: "locked",
      label: "Bloqueado",
      tone: "neutral",
      message: "Este turno está bloqueado por payroll y no acepta ediciones.",
    };
  }
  if (shift.status === "cancelled") {
    return {
      code: "cancelled",
      label: "Cancelado",
      tone: "neutral",
      message: "Este turno fue cancelado.",
    };
  }
  if (shift.status === "archived") {
    return {
      code: "archived",
      label: "Archivado",
      tone: "neutral",
      message: "Este turno está archivado.",
    };
  }
  if (shift.status === "completed") {
    return {
      code: "completed",
      label: "Completado",
      tone: "success",
      message: "Este turno ya se completó.",
    };
  }

  if (isDraft(shift)) {
    if (!ctx.hasLocation) {
      return {
        code: "draft_missing_info",
        label: "Borrador · falta info",
        tone: "warn",
        message: "No publiques todavía: falta dirección o ubicación del trabajo.",
      };
    }
    if (missingWorkers > 0) {
      return {
        code: "draft_needs_staffing",
        label: "Borrador · necesita personal",
        tone: "warn",
        message: `Este turno está en borrador y necesita ${missingWorkers} ${missingWorkers === 1 ? "worker confirmado" : "workers confirmados"} antes de publicarse.`,
      };
    }
    if (ctx.meetingPending) {
      return {
        code: "draft_missing_info",
        label: "Borrador · falta info",
        tone: "info",
        message: "Listo casi para publicar: agrega el punto de encuentro para evitar dudas del worker.",
      };
    }
    return {
      code: "draft_ready_to_publish",
      label: "Listo para publicar",
      tone: "success",
      message: "Listo para publicar: ubicación, horario y cobertura completos.",
    };
  }

  // Published
  if (missingWorkers >= 2) {
    return {
      code: "published_at_risk",
      label: "En riesgo",
      tone: "danger",
      message: `Este turno está en riesgo: faltan ${missingWorkers} workers confirmados.`,
    };
  }
  if (missingWorkers === 1) {
    return {
      code: "published_at_risk",
      label: "Necesita 1 más",
      tone: "warn",
      message: "Publicado pero falta 1 worker confirmado para cubrir el turno.",
    };
  }
  if (ctx.meetingPending) {
    return {
      code: "published_needs_info",
      label: "Publicado · falta info",
      tone: "warn",
      message: "Publicado pero falta punto de encuentro. El worker no sabrá dónde llegar.",
    };
  }
  return {
    code: "published_ready",
    label: "Listo",
    tone: "success",
    message: `Publicado y cubierto: ${confirmed}/${slots} confirmados y la info operativa está completa.`,
  };
}

// ── Missing items ─────────────────────────────────────────────────────────

export type MissingItemSeverity = "block" | "warn" | "info";
export interface MissingItem {
  key: string;
  label: string;
  severity: MissingItemSeverity;
  hint?: string;
}

export function getShiftMissingItems(
  shift: ShiftLike,
  assignments: AssignmentLike[],
  _ctx?: { hasLocation?: boolean; hasMeetingPoint?: boolean; hasLocationAddress?: boolean },
): MissingItem[] {
  const loc = locationTruthOf(shift);
  const items: MissingItem[] = [];
  const slots = shift.slots ?? 0;
  const confirmed = confirmedAssignments(assignments).length;
  const missing = Math.max(0, slots - confirmed);

  if (missing > 0) {
    items.push({
      key: "workers",
      label: `Falta ${missing} worker${missing === 1 ? "" : "s"} confirmado${missing === 1 ? "" : "s"}`,
      severity: isDraft(shift) ? "warn" : "block",
    });
  }
  if (loc.destinationStatus === "MISSING_DESTINATION") {
    items.push({
      key: "job_site",
      label: "Falta dirección del trabajo (Job Site)",
      severity: "block",
      hint: "Sin dirección el worker no puede llegar.",
    });
  } else if (loc.geospatialStatus === "ADDRESS_ONLY") {
    items.push({
      key: "job_site_coordinates",
      label: "Dirección sin coordenadas",
      severity: "info",
      hint: loc.geospatialHint ?? undefined,
    });
  }
  // Punto de encuentro: solo si transportation_required === true.
  if (loc.meetingPointMissing) {
    items.push({
      key: "meeting_point",
      label: "Falta punto de encuentro",
      severity: "warn",
      hint: "El servicio requiere transporte: el worker necesita dónde encontrarse.",
    });
  }
  if (!shift.special_instructions || shift.special_instructions.trim() === "") {
    items.push({
      key: "instructions",
      label: "Sin instrucciones especiales",
      severity: "info",
      hint: "Opcional: uniforme, código de acceso, contacto en sitio.",
    });
  }
  if (shift.transportation_required && !shift.driver_employee_id) {
    const driverInAssignments = assignments.some(a => a.assignment_role === "driver" && a.status !== "rejected");
    if (!driverInAssignments) {
      items.push({
        key: "driver",
        label: "Transporte requerido pero no hay conductor",
        severity: "block",
      });
    }
  }
  if (!shift.shift_admin_id) {
    const adminInAssignments = assignments.some(
      a => ["shift_admin", "shift_lead", "backup_admin"].includes(a.assignment_role) && a.status !== "rejected",
    );
    if (!adminInAssignments) {
      items.push({
        key: "shift_admin",
        label: "Sin Shift Admin asignado",
        severity: "warn",
        hint: "Recomendado para coordinar al equipo en sitio.",
      });
    }
  }

  return items;
}

// ── Risks ─────────────────────────────────────────────────────────────────

export type RiskSeverity = "warn" | "danger";
export interface RiskItem {
  key: string;
  label: string;
  severity: RiskSeverity;
}

export function getShiftRisks(
  shift: ShiftLike,
  assignments: AssignmentLike[],
): RiskItem[] {
  const risks: RiskItem[] = [];
  const slots = shift.slots ?? 0;
  const confirmed = confirmedAssignments(assignments).length;
  const pending = assignments.filter(a => a.status === "pending").length;
  const rejected = assignments.filter(a => a.status === "rejected").length;

  if (!isDraft(shift) && confirmed < slots) {
    risks.push({
      key: "coverage_gap",
      label: `Cobertura incompleta (${confirmed}/${slots} confirmados)`,
      severity: slots - confirmed >= 2 ? "danger" : "warn",
    });
  }
  if (pending >= 3) {
    risks.push({
      key: "many_pending",
      label: `${pending} workers sin confirmar`,
      severity: "warn",
    });
  }
  if (rejected >= 2) {
    risks.push({
      key: "rejections",
      label: `${rejected} workers rechazaron el turno`,
      severity: "warn",
    });
  }
  if (shift.transportation_required) {
    const slotsCount = shift.slots ?? 0;
    const carCap = shift.car_capacity || 5;
    const carsNeeded = Math.ceil(slotsCount / carCap);
    const driverIds = new Set<string>();
    if (shift.driver_employee_id) driverIds.add(shift.driver_employee_id);
    assignments.forEach(a => {
      if (a.assignment_role === "driver" && a.status !== "rejected" && a.employee_id) {
        driverIds.add(a.employee_id);
      }
    });
    if (driverIds.size < carsNeeded) {
      risks.push({
        key: "transport_shortage",
        label: `Faltan ${carsNeeded - driverIds.size} conductor(es) para transporte`,
        severity: "danger",
      });
    }
  }
  return risks;
}

// ── Next best actions ─────────────────────────────────────────────────────

export type NextActionKind =
  | "complete_location"
  | "add_meeting_point"
  | "assign_worker"
  | "message_pending"
  | "publish_shift"
  | "assign_driver"
  | "assign_admin"
  | "review_before_close";

export interface NextAction {
  kind: NextActionKind;
  label: string;
  rationale: string;
  tone: "primary" | "warn" | "danger";
}

export function getRecommendedNextActions(
  shift: ShiftLike,
  assignments: AssignmentLike[],
  missing: MissingItem[],
  risks: RiskItem[],
): NextAction[] {
  const out: NextAction[] = [];
  const slots = shift.slots ?? 0;
  const confirmed = confirmedAssignments(assignments).length;
  const pending = assignments.filter(a => a.status === "pending").length;

  // Hard blockers first
  if (missing.find(m => m.key === "job_site")) {
    out.push({
      kind: "complete_location",
      label: "Completar dirección del trabajo",
      rationale: "Sin Job Site el worker no puede llegar.",
      tone: "danger",
    });
  }
  if (missing.find(m => m.key === "driver")) {
    out.push({
      kind: "assign_driver",
      label: "Asignar conductor",
      rationale: "Transporte requerido y no hay conductor.",
      tone: "danger",
    });
  }
  if (slots - confirmed > 0) {
    out.push({
      kind: "assign_worker",
      label: `Asignar ${slots - confirmed} worker${slots - confirmed === 1 ? "" : "s"}`,
      rationale: "Cobertura incompleta; revisa candidatos recomendados.",
      tone: slots - confirmed >= 2 ? "danger" : "warn",
    });
  }
  if (pending >= 1 && !isDraft(shift)) {
    out.push({
      kind: "message_pending",
      label: `Mensaje a ${pending} pendiente${pending === 1 ? "" : "s"}`,
      rationale: "Empujar confirmaciones reduce el riesgo de no-show.",
      tone: "warn",
    });
  }
  if (missing.find(m => m.key === "meeting_point")) {
    out.push({
      kind: "add_meeting_point",
      label: "Agregar punto de encuentro",
      rationale: "Evita confusión al llegar y reduce llamadas.",
      tone: "warn",
    });
  }
  if (missing.find(m => m.key === "shift_admin")) {
    out.push({
      kind: "assign_admin",
      label: "Designar Shift Admin",
      rationale: "Recomendado para coordinar al equipo en sitio.",
      tone: "warn",
    });
  }
  if (isDraft(shift) && out.length === 0) {
    out.push({
      kind: "publish_shift",
      label: "Publicar turno",
      rationale: "Listo para enviar a los workers asignados.",
      tone: "primary",
    });
  }

  // Avoid noise: max 3 actions
  return out.slice(0, 3);
}

// ── Worker assignment signals (per assignment) ────────────────────────────

export interface AssignmentSignals {
  isDriver: boolean;
  isAdmin: boolean;
  hasPhone: boolean;
  noArea: boolean;
  statusTone: "success" | "warn" | "danger" | "neutral";
  statusLabel: string;
}

const ADMIN_ROLES = new Set(["shift_admin", "shift_lead", "backup_admin", "check_in_admin", "transport_lead"]);

export function getWorkerAssignmentSignals(a: AssignmentLike): AssignmentSignals {
  const emp = a.employee ?? {};
  const statusMap: Record<string, { tone: AssignmentSignals["statusTone"]; label: string }> = {
    confirmed: { tone: "success", label: "Confirmado" },
    accepted: { tone: "success", label: "Aceptado" },
    pending: { tone: "warn", label: "Pendiente" },
    rejected: { tone: "danger", label: "Rechazado" },
    removed: { tone: "neutral", label: "Removido" },
  };
  const s = statusMap[a.status] ?? { tone: "neutral" as const, label: a.status };
  return {
    isDriver: a.assignment_role === "driver" || isEmployeeDriver(emp as any),
    isAdmin: ADMIN_ROLES.has(a.assignment_role),
    hasPhone: !!(emp.phone_number && String(emp.phone_number).trim()),
    noArea: !emp.county || String(emp.county).trim() === "",
    statusTone: s.tone,
    statusLabel: s.label,
  };
}

// ── Candidate recommendation reasons ──────────────────────────────────────

export interface CandidateReason {
  key: "same_area" | "driver" | "has_phone" | "no_area" | "no_phone";
  label: string;
  tone: "positive" | "neutral" | "warn";
}

/**
 * Heuristic reasons we can compute from the data currently loaded on the
 * Shift Operations screen (no extra fetch). When we do not have a real
 * "available" signal (availability windows, conflicts) we do NOT claim it.
 */
export function getCandidateRecommendationReasons(
  employee: EmployeeLike,
  shiftAreaHint: string | null,
): CandidateReason[] {
  const reasons: CandidateReason[] = [];
  const normalizedEmp = normalizeArea(employee.county ?? "");
  const normalizedShift = normalizeArea(shiftAreaHint ?? "");

  if (normalizedEmp && normalizedShift && normalizedEmp === normalizedShift) {
    reasons.push({ key: "same_area", label: "Misma zona", tone: "positive" });
  }
  if (isEmployeeDriver(employee as any)) {
    reasons.push({ key: "driver", label: "Tiene transporte", tone: "positive" });
  }
  if (employee.phone_number && String(employee.phone_number).trim()) {
    reasons.push({ key: "has_phone", label: "Contactable", tone: "neutral" });
  } else {
    reasons.push({ key: "no_phone", label: "Sin teléfono", tone: "warn" });
  }
  if (!normalizedEmp) {
    reasons.push({ key: "no_area", label: "Sin zona registrada", tone: "warn" });
  }
  return reasons;
}

// ── Area normalization ────────────────────────────────────────────────────

/**
 * Collapse messy free-text counties into a single canonical bucket.
 *
 *   "Queens"      → "Queens"
 *   "QUEENS"      → "Queens"
 *   "Queens, NY"  → "Queens"
 *   "queens ny"   → "Queens"
 *   "Brooklyn,NY" → "Brooklyn"
 *
 * Returns empty string for nullish / blank / whitespace-only input, which
 * the consumer can display as "Sin zona".
 */
export function normalizeArea(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";
  // Strip ", NY" / " NY" / state suffix
  s = s.replace(/[,\s]+(?:ny|nyc|n\.y\.|new york)\b\.?$/i, "").trim();
  // Collapse internal whitespace
  s = s.replace(/\s+/g, " ");
  // Title-case
  s = s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return s;
}

/**
 * Group employees by normalized area, preserving stable order:
 * known areas alphabetically, "Sin zona" at the end.
 */
export function groupByNormalizedArea<T extends { county?: string | null }>(
  rows: T[],
): Array<{ area: string; rows: T[] }> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const key = normalizeArea(r.county ?? "") || "Sin zona";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === "Sin zona") return 1;
      if (b === "Sin zona") return -1;
      return a.localeCompare(b);
    })
    .map(([area, rows]) => ({ area, rows }));
}
