/**
 * P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 1
 * Auditoría PURA de asignaciones sospechosas por identidad.
 *
 * SOLO LECTURA: clasifica y explica. No corrige, no reasigna, no borra, no
 * toca payroll ni time_entries. Un assignment con horas o payroll enlazado se
 * marca explícitamente como HIGH_RISK_DO_NOT_TOUCH.
 */

import { classifyWorkerAssignability } from "@/lib/shifts/assignable-workers";
import type { IdentityRecord } from "@/lib/identity/person-truth";

export type AssignmentRiskVerdict =
  | "CONFIRMED_OK"
  | "SUSPICIOUS_IDENTITY"
  | "NON_ASSIGNABLE_RECORD"
  | "AMBIGUOUS"
  | "HIGH_RISK_DO_NOT_TOUCH";

export interface AssignmentAuditInput {
  employeeId: string;
  assignmentsCount: number;
  lastAssignmentAt?: string | null;
  hasTimeEntries: boolean;
  hasDocuments: boolean;
  /** Clave del grupo de duplicados al que pertenece, si aplica. */
  duplicateGroupKey?: string | null;
  /** Candidato primario del grupo (si el grupo tiene uno). */
  groupPrimaryId?: string | null;
}

export interface AssignmentAuditRow extends AssignmentAuditInput {
  verdict: AssignmentRiskVerdict;
  reason: string;
  displayName: string;
  assignableToday: boolean;
  hasPortal: boolean;
}

export function auditAssignmentIdentity(
  record: IdentityRecord,
  input: AssignmentAuditInput,
): AssignmentAuditRow {
  const verdictAssign = classifyWorkerAssignability(record);
  const assignableToday = verdictAssign.assignable;
  const inDuplicateGroup = !!input.duplicateGroupKey;
  const betterRecordExists =
    inDuplicateGroup &&
    !!input.groupPrimaryId &&
    input.groupPrimaryId !== record.id;

  const base = {
    ...input,
    displayName:
      [record.first_name, record.last_name].filter(Boolean).join(" ") || "Sin nombre",
    assignableToday,
    hasPortal: !!record.user_id,
  };

  // Cualquier registro con horas registradas es intocable en esta fase.
  if (input.hasTimeEntries && (!assignableToday || betterRecordExists))
    return {
      ...base,
      verdict: "HIGH_RISK_DO_NOT_TOUCH",
      reason:
        "Tiene horas registradas y además dudas de identidad. No mover: cualquier cambio afectaría horas y pago histórico.",
    };

  if (!assignableToday && !inDuplicateGroup)
    return {
      ...base,
      verdict: "NON_ASSIGNABLE_RECORD",
      reason: `Hoy no sería asignable: ${verdictAssign.reason ?? "registro no operativo"}.`,
    };

  if (betterRecordExists)
    return {
      ...base,
      verdict: "SUSPICIOUS_IDENTITY",
      reason:
        "Pertenece a un grupo de posible duplicado y existe otro registro con mejor evidencia operativa.",
    };

  if (inDuplicateGroup)
    return {
      ...base,
      verdict: "AMBIGUOUS",
      reason:
        "Pertenece a un grupo de posible duplicado, pero no hay un registro claramente mejor.",
    };

  return {
    ...base,
    verdict: "CONFIRMED_OK",
    reason: "Registro asignable y sin señales de duplicado.",
  };
}

export const ASSIGNMENT_RISK_LABELS: Record<AssignmentRiskVerdict, string> = {
  CONFIRMED_OK: "Correcto",
  SUSPICIOUS_IDENTITY: "Identidad sospechosa",
  NON_ASSIGNABLE_RECORD: "Registro no asignable",
  AMBIGUOUS: "Ambiguo",
  HIGH_RISK_DO_NOT_TOUCH: "Riesgo alto — no tocar",
};

export const ASSIGNMENT_RISK_TONE: Record<
  AssignmentRiskVerdict,
  "ok" | "warning" | "critical"
> = {
  CONFIRMED_OK: "ok",
  SUSPICIOUS_IDENTITY: "warning",
  NON_ASSIGNABLE_RECORD: "warning",
  AMBIGUOUS: "warning",
  HIGH_RISK_DO_NOT_TOUCH: "critical",
};
