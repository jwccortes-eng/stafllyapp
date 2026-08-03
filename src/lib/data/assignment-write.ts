/**
 * P0 — VWC FASE 3D. Asignaciones y estados compartidos.
 *
 * Carril ÚNICO de transición de estado de asignaciones. Reglas:
 *  1. Las transiciones NO son PATCH genérico: viajan por la RPC transaccional
 *     `versioned_assignment_transition` (company_id + expected_status +
 *     expected_version + actor + intent_key + reason + auditoría).
 *  2. Una versión vieja NUNCA puede revivir, restaurar ni revertir un estado
 *     más reciente: el backend responde `conflict` y no escribe.
 *  3. La UI de conflicto es la misma del contrato (`VersionConflictDialog`).
 *  4. La auditoría es la misma tabla y el mismo formato (`versioned_write_audit`).
 *
 * No toca time_entries, fichajes, payroll ni compliance policy.
 */
import { supabase } from "@/integrations/supabase/client";

export type AssignmentTransition =
  | "accept"
  | "reject"
  | "confirm"
  | "remove"
  | "replace"
  | "set_role_driver"
  | "set_role_worker"
  | "set_captain";

export interface AssignmentTransitionInput {
  assignmentId: string;
  companyId: string | null | undefined;
  transition: AssignmentTransition;
  /** Estado que el operador tenía a la vista. */
  expectedStatus?: string | null;
  /** `version` de la asignación que el operador tenía a la vista. */
  expectedVersion?: number | null;
  reason?: string | null;
  /** Reemplazo / destino. */
  targetEmployeeId?: string | null;
  surface?: string;
  /** Idempotencia: doble toque no duplica la transición. */
  intentKey?: string;
}

export interface AssignmentCoverage {
  required: number;
  assigned_active: number;
  confirmed: number;
}

export type AssignmentTransitionResult =
  | {
      status: "applied";
      row: Record<string, any>;
      version: number | null;
      previousStatus: string | null;
      finalStatus: string | null;
      coverageAfter: AssignmentCoverage | null;
      driverImpact: string;
      captainImpact: string;
      nextAction: string;
      replacementAssignmentId: string | null;
      replayed: boolean;
    }
  | {
      status: "conflict";
      expectedVersion: number | null;
      actualVersion: number | null;
      expectedStatus: string | null;
      actualStatus: string | null;
      row: Record<string, any> | null;
      updatedBy: string | null;
      updatedAt: string | null;
      fields: string[];
    }
  | {
      status: "error";
      reason: "denied" | "not_found" | "invalid" | "error";
      message: string;
    };

const MESSAGES: Record<string, string> = {
  tenant_mismatch: "Esta asignación pertenece a otra empresa.",
  forbidden: "No tienes permiso para cambiar esta asignación.",
  assignment_not_found: "La asignación ya no existe.",
  assignment_inactive: "La persona ya no está activa en este servicio.",
  replacement_required: "Elige a quién entra como reemplazo.",
  invalid_input: "Falta información para aplicar el cambio.",
};

function humanize(reason: string | null | undefined): string {
  if (!reason) return "No se pudo aplicar el cambio.";
  if (MESSAGES[reason]) return MESSAGES[reason];
  if (reason.startsWith("replace_blocked:")) {
    return "No se pudo completar el reemplazo. La persona original sigue asignada.";
  }
  return reason;
}

export async function versionedAssignmentTransition(
  input: AssignmentTransitionInput,
): Promise<AssignmentTransitionResult> {
  const {
    assignmentId,
    companyId,
    transition,
    expectedStatus,
    expectedVersion,
    reason,
    targetEmployeeId,
    surface,
    intentKey,
  } = input;

  if (!companyId) {
    return {
      status: "error",
      reason: "denied",
      message: "Falta el contexto de empresa. Vuelve a seleccionar la empresa e inténtalo otra vez.",
    };
  }

  const { data, error } = await supabase.rpc("versioned_assignment_transition" as any, {
    p_assignment_id: assignmentId,
    p_company_id: companyId,
    p_transition: transition,
    p_expected_status: expectedStatus ?? null,
    p_expected_version: expectedVersion ?? null,
    p_reason: reason ?? null,
    p_target_employee_id: targetEmployeeId ?? null,
    p_surface: surface ?? null,
    p_intent_key: intentKey ?? null,
  } as any);

  if (error) return { status: "error", reason: "error", message: error.message };

  const result = (data ?? {}) as Record<string, any>;

  switch (result.status) {
    case "conflict":
      return {
        status: "conflict",
        expectedVersion: result.expected_version ?? null,
        actualVersion: result.actual_version ?? null,
        expectedStatus: result.expected_status ?? null,
        actualStatus: result.actual_status ?? null,
        row: (result.row as Record<string, any>) ?? null,
        updatedBy: result.row?.updated_by ?? null,
        updatedAt: result.updated_at ?? null,
        fields: [transition],
      };
    case "not_found":
      return { status: "error", reason: "not_found", message: humanize(result.reason) };
    case "denied":
      return { status: "error", reason: "denied", message: humanize(result.reason) };
    case "invalid":
      return { status: "error", reason: "invalid", message: humanize(result.reason) };
    case "applied":
      return {
        status: "applied",
        row: (result.row as Record<string, any>) ?? {},
        version: typeof result.final_version === "number" ? result.final_version : null,
        previousStatus: result.previous_status ?? null,
        finalStatus: result.final_status ?? null,
        coverageAfter: (result.coverage_after as AssignmentCoverage) ?? null,
        driverImpact: result.driver_impact ?? "none",
        captainImpact: result.captain_impact ?? "none",
        nextAction: result.next_action ?? "none",
        replacementAssignmentId: result.replacement_assignment_id ?? null,
        replayed: result.replayed === true,
      };
    default:
      return { status: "error", reason: "error", message: "Respuesta inesperada del servidor." };
  }
}

/** Mensaje canónico de conflicto para asignaciones (mismo lenguaje en toda la app). */
export function assignmentConflictCopy(result: Extract<AssignmentTransitionResult, { status: "conflict" }>) {
  return {
    title: "Alguien más ya cambió esta asignación",
    fact: `Tú veías "${result.expectedStatus ?? "un estado anterior"}" y ahora está en "${result.actualStatus ?? "otro estado"}".`,
    consequence: "No se sobrescribió nada. El cambio más reciente sigue vigente.",
    action: "Recarga y vuelve a decidir con el estado actual.",
  };
}
