/**
 * FASE 4.1 — Resultado por persona al crear un turno.
 *
 * Puro: sin React, sin DB. Traduce el error técnico de la RPC
 * `assign_worker_to_shift` a lenguaje humano y define la acción siguiente.
 *
 * NO cambia reglas de compliance ni de negocio: sólo describe lo que el
 * backend ya decidió (`get_employee_assignment_status` sigue siendo la
 * única fuente de verdad).
 */

export type AssignOutcomeCode =
  | "assigned"
  | "already_assigned"
  | "overlap"
  | "not_allowed"
  | "compliance_blocked"
  | "network"
  | "unknown";

export interface AssignOutcome {
  employeeId: string;
  name: string;
  ok: boolean;
  code: AssignOutcomeCode;
  /** Razón en lenguaje humano, sin jerga técnica. */
  reason: string;
  /** Qué debe hacer el operador ahora. */
  nextAction: string;
  /** true si reintentar la misma asignación tiene sentido. */
  retryable: boolean;
}

interface Copy {
  reason: string;
  nextAction: string;
  retryable: boolean;
}

const COPY: Record<AssignOutcomeCode, Copy> = {
  assigned: {
    reason: "Asignada al turno.",
    nextAction: "Debe confirmar su asistencia.",
    retryable: false,
  },
  already_assigned: {
    reason: "Ya estaba en este turno.",
    nextAction: "No hace falta hacer nada.",
    retryable: false,
  },
  overlap: {
    reason: "Tiene otro turno a la misma hora.",
    nextAction: "Cambia el horario o elige a otra persona.",
    retryable: false,
  },
  not_allowed: {
    reason: "No tienes permiso para asignar a esta persona.",
    nextAction: "Pide a un administrador de la empresa que la agregue.",
    retryable: false,
  },
  compliance_blocked: {
    reason: "La empresa exige completar su expediente antes de asignarla.",
    nextAction: "Completa su perfil y agrégala desde el turno.",
    retryable: true,
  },
  network: {
    reason: "Se perdió la conexión antes de confirmarla.",
    nextAction: "Reintenta cuando vuelva la conexión.",
    retryable: true,
  },
  unknown: {
    reason: "No se pudo agregar en este momento.",
    nextAction: "Reintenta o agrégala desde el turno.",
    retryable: true,
  },
};

export function classifyAssignError(error: unknown): AssignOutcomeCode {
  const raw =
    typeof error === "string"
      ? error
      : `${(error as any)?.message ?? ""} ${(error as any)?.details ?? ""} ${(error as any)?.hint ?? ""}`;
  const msg = raw.toLowerCase().trim();
  if (!msg) return "unknown";

  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("timeout")
  ) {
    return "network";
  }
  if (
    msg.includes("already assigned") ||
    msg.includes("duplicate key") ||
    msg.includes("23505") ||
    msg.includes("ya asignad")
  ) {
    return "already_assigned";
  }
  if (msg.includes("overlap") || msg.includes("23p01") || msg.includes("solap")) {
    return "overlap";
  }
  if (
    msg.includes("not authorized") ||
    msg.includes("not_authorized") ||
    msg.includes("permission denied") ||
    msg.includes("forbidden") ||
    msg.includes("42501")
  ) {
    return "not_allowed";
  }
  if (
    msg.includes("blocked") ||
    msg.includes("require_override") ||
    msg.includes("not_ready") ||
    msg.includes("compliance") ||
    msg.includes("documents_pending")
  ) {
    return "compliance_blocked";
  }
  return "unknown";
}

export function buildAssignOutcome(
  employeeId: string,
  name: string,
  error: unknown | null,
): AssignOutcome {
  const code: AssignOutcomeCode = error ? classifyAssignError(error) : "assigned";
  const copy = COPY[code];
  return {
    employeeId,
    name,
    ok: code === "assigned" || code === "already_assigned",
    code,
    reason: copy.reason,
    nextAction: copy.nextAction,
    retryable: copy.retryable,
  };
}

export type CreateResultKind =
  | "created_full"
  | "created_partial"
  | "created_empty"
  | "failed";

export interface CreateResultSummary {
  kind: CreateResultKind;
  okCount: number;
  failedCount: number;
  title: string;
  fact: string;
}

/**
 * Nunca reporta éxito total si alguna asignación falló.
 */
export function summarizeCreateResult(
  outcomes: AssignOutcome[],
  requestedTeamSize: number,
): CreateResultSummary {
  const okCount = outcomes.filter(o => o.ok).length;
  const failedCount = outcomes.length - okCount;

  if (requestedTeamSize === 0) {
    return {
      kind: "created_empty",
      okCount: 0,
      failedCount: 0,
      title: "Turno creado sin equipo",
      fact: "El turno está publicado pero todavía no tiene a nadie asignado.",
    };
  }
  if (failedCount > 0) {
    return {
      kind: "created_partial",
      okCount,
      failedCount,
      title: "Turno creado, equipo incompleto",
      fact: `Se agregaron ${okCount} de ${requestedTeamSize} personas.`,
    };
  }
  return {
    kind: "created_full",
    okCount,
    failedCount: 0,
    title: "Turno creado con su equipo",
    fact: `${okCount} ${okCount === 1 ? "persona asignada" : "personas asignadas"}; deben confirmar su asistencia.`,
  };
}

/** Personas que tiene sentido reintentar (no duplica: excluye las ya asignadas). */
export function retryableOutcomes(outcomes: AssignOutcome[]): AssignOutcome[] {
  return outcomes.filter(o => !o.ok && o.retryable);
}
