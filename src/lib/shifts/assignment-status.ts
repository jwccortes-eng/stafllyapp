/**
 * Assignment status — SINGLE SOURCE OF TRUTH CONSUMER.
 *
 * All readiness rules live in Postgres (`public.get_employee_assignment_status`).
 * This module contains **zero business rules**: it only parses the backend
 * verdict and maps it to presentation (labels, tones, recommended action).
 *
 * Operational status  → can this worker participate in this operation?
 * Compliance status   → what paperwork is pending?
 *
 * Compliance NEVER blocks by itself. It only blocks when the company policy
 * (`company_settings.assignment_compliance_policy`) says so.
 */
import { supabase } from "@/integrations/supabase/client";

export type OperationalStatus =
  | "available"
  | "inactive"
  | "legal_block"
  | "needs_review";

export type ComplianceStatus =
  | "clear"
  | "profile_incomplete"
  | "documents_pending"
  | "onboarding_pending"
  | "unknown";

export type CompliancePolicy = "allow_with_warning" | "require_override" | "block";

export type ReadinessState =
  | "ready"
  | "compliance_warning"
  | "override_required"
  | "compliance_blocked"
  | "inactive"
  | "needs_review";

export interface AssignmentStatus {
  employeeId: string;
  operationalStatus: OperationalStatus;
  complianceStatus: ComplianceStatus;
  policy: CompliancePolicy;
  canAssign: boolean;
  requiresOverride: boolean;
  readiness: ReadinessState;
}

/**
 * Optimistic default used while the backend verdict is still loading.
 * Operation is never blocked by an unknown UI state — the DB trigger is
 * the real gate.
 */
export function optimisticStatus(employeeId: string): AssignmentStatus {
  return {
    employeeId,
    operationalStatus: "available",
    complianceStatus: "unknown",
    policy: "allow_with_warning",
    canAssign: true,
    requiresOverride: false,
    readiness: "ready",
  };
}

export function parseAssignmentStatus(employeeId: string, raw: unknown): AssignmentStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    employeeId,
    operationalStatus: (r.operational_status as OperationalStatus) ?? "needs_review",
    complianceStatus: (r.compliance_status as ComplianceStatus) ?? "unknown",
    policy: (r.policy as CompliancePolicy) ?? "allow_with_warning",
    canAssign: r.can_assign === true,
    requiresOverride: r.requires_override === true,
    readiness: (r.readiness as ReadinessState) ?? "needs_review",
  };
}

/** Batch fetch — one round trip for a whole roster. */
export async function fetchAssignmentStatuses(
  employeeIds: string[],
  companyId?: string | null,
): Promise<Map<string, AssignmentStatus>> {
  const out = new Map<string, AssignmentStatus>();
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const { data, error } = await supabase.rpc("get_employees_assignment_status", {
    _employee_ids: ids,
    _company_id: companyId ?? undefined,
  });
  if (error) throw error;

  for (const row of (data ?? []) as { employee_id: string; status: unknown }[]) {
    out.set(row.employee_id, parseAssignmentStatus(row.employee_id, row.status));
  }
  return out;
}

/* ───────────────────────── Presentation ───────────────────────── */

export const OPERATIONAL_LABEL: Record<OperationalStatus, string> = {
  available: "Listo para asignar",
  inactive: "Inactivo",
  legal_block: "Bloqueo por política",
  needs_review: "Requiere revisión",
};

export const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  clear: "Documentación al día",
  profile_incomplete: "Perfil incompleto",
  documents_pending: "Documentos pendientes",
  onboarding_pending: "Onboarding pendiente",
  unknown: "Cumplimiento sin verificar",
};

export const COMPLIANCE_ACTION: Record<ComplianceStatus, string | null> = {
  clear: null,
  profile_incomplete: "Completa los datos personales del trabajador cuando puedas.",
  documents_pending: "Solicita los documentos faltantes al trabajador.",
  onboarding_pending: "Recuérdale terminar el onboarding en el portal.",
  unknown: "Verifica el perfil del trabajador.",
};

export type StatusTone = "good" | "info" | "warn" | "bad" | "muted";

export const READINESS_TONE: Record<ReadinessState, StatusTone> = {
  ready: "good",
  compliance_warning: "warn",
  override_required: "warn",
  compliance_blocked: "bad",
  inactive: "bad",
  needs_review: "muted",
};

export interface StatusPresentation {
  tone: StatusTone;
  /** Short chip label. */
  label: string;
  /** What is happening + why. */
  reason: string;
  /** Recommended action for the user. */
  action: string;
  canAssign: boolean;
  requiresOverride: boolean;
}

export function describeAssignmentStatus(s: AssignmentStatus): StatusPresentation {
  const compliance = COMPLIANCE_LABEL[s.complianceStatus];
  const action = COMPLIANCE_ACTION[s.complianceStatus];

  switch (s.readiness) {
    case "inactive":
      return {
        tone: "bad",
        label: "Inactivo",
        reason: "El trabajador está archivado o inactivo (motivo operativo).",
        action: "Reactiva al trabajador para poder asignarlo.",
        canAssign: false,
        requiresOverride: false,
      };
    case "needs_review":
      return {
        tone: "muted",
        label: "Requiere revisión",
        reason: "No se pudo leer el estado del trabajador.",
        action: "Abre el perfil del trabajador para revisarlo.",
        canAssign: false,
        requiresOverride: false,
      };
    case "compliance_blocked":
      return {
        tone: "bad",
        label: compliance,
        reason: `${compliance}. La política de la compañía bloquea la asignación en este caso.`,
        action: action ?? "Regulariza la documentación o cambia la política de la compañía.",
        canAssign: false,
        requiresOverride: false,
      };
    case "override_required":
      return {
        tone: "warn",
        label: compliance,
        reason: `${compliance}. La política de la compañía exige aprobación explícita.`,
        action: "Registra una autorización (override) para asignar a este trabajador.",
        canAssign: false,
        requiresOverride: true,
      };
    case "compliance_warning":
      return {
        tone: "warn",
        label: compliance,
        reason: `${compliance}. No bloquea la operación según la política de la compañía.`,
        action: action ?? "Puedes asignar; da seguimiento a la documentación.",
        canAssign: true,
        requiresOverride: false,
      };
    default:
      return {
        tone: "good",
        label: "Listo",
        reason: "Trabajador operativo y con documentación al día.",
        action: "Puedes asignarlo sin restricciones.",
        canAssign: true,
        requiresOverride: false,
      };
  }
}

export const POLICY_LABEL: Record<CompliancePolicy, string> = {
  allow_with_warning: "Permitir con advertencia",
  require_override: "Requiere autorización",
  block: "Bloquear",
};
