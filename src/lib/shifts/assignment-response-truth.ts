/**
 * ASSIGNMENT RESPONSE TRUTH — ¿qué sabemos REALMENTE de la respuesta de la persona?
 * ==================================================================================
 *
 * Origen: `docs/qa/STAFLY_SOURCE_OF_TRUTH_RECONCILIATION.md` (P0).
 *
 * Problema resuelto: `shift_assignments.status` y `shift_assignments.response_status`
 * son DOS EJES DISTINTOS y varias pantallas los leen como si fueran el mismo:
 *
 *   status          → decisión de la ADMINISTRACIÓN (¿esta persona está en el roster?)
 *   response_status → acto del TRABAJADOR (¿tocó Aceptar/Rechazar en el portal?)
 *
 * En producción existen 5.809 filas con `status IN (accepted, confirmed)` y
 * `response_status = 'pending'`. NO son datos corruptos: son asignaciones
 * históricas/importadas donde nunca hubo un acto del trabajador. La prueba es
 * que `accepted_at` y `responded_at` están vacíos y todas pertenecen a turnos
 * ya pasados.
 *
 * Regla de evidencia (la única que no inventa nada):
 *   La aceptación del trabajador SÓLO se afirma cuando existe la marca de
 *   tiempo que deja `worker_respond_to_shift_assignment` (`accepted_at` o
 *   `responded_at`). Sin esa marca, el compromiso es ADMINISTRATIVO, no
 *   una confirmación de la persona.
 *
 * Este módulo es PURO: no consulta, no escribe, no muta estados almacenados.
 * No requiere ningún backfill de datos históricos.
 */

import { isExcludedAssignmentStatus, isCommittedAssignmentStatus } from "./assignment-status-truth";

export interface AssignmentResponseInput {
  status?: string | null;
  response_status?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  responded_at?: string | null;
  is_draft_reservation?: boolean | null;
}

export type AssignmentResponseCode =
  /** Reserva creada por el flujo de borrador: aún no es una asignación real. */
  | "draft_reservation"
  /** La administración la sacó del turno. */
  | "removed"
  /** La persona rechazó, con evidencia. */
  | "rejected_by_worker"
  /** El turno cambió: la aceptación previa quedó invalidada. */
  | "needs_reacceptance"
  /** La persona aceptó, con evidencia de su acto. */
  | "accepted_by_worker"
  /** Roster administrativo/importado: firme para la operación, sin acto de la persona. */
  | "roster_committed_no_response"
  /** Asignada e invitada: esperamos la respuesta de la persona. */
  | "awaiting_worker_response"
  /** No hay evidencia suficiente para afirmar nada. */
  | "unknown";

export interface AssignmentResponseTruth {
  code: AssignmentResponseCode;
  /** ¿La persona misma dejó evidencia de su respuesta? */
  workerAttested: boolean;
  /** ¿Cuenta como compromiso operativo firme para cobertura? */
  operationallyCommitted: boolean;
  /** Etiqueta honesta para admin (español, sin jerga). */
  adminLabel: string;
  /** Por qué decimos esto. Siempre explicable fila por fila. */
  because: string;
}

const norm = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

/** ¿Existe evidencia de que la persona respondió por sí misma? */
export function hasWorkerResponseEvidence(a: AssignmentResponseInput): boolean {
  return Boolean(a.accepted_at || a.rejected_at || a.responded_at);
}

/**
 * Resuelve el estado de respuesta visible para UNA asignación.
 * Nunca afirma "confirmado por la persona" sin evidencia del acto.
 */
export function resolveAssignmentResponseTruth(
  a: AssignmentResponseInput | null | undefined,
): AssignmentResponseTruth {
  if (!a) {
    return {
      code: "unknown",
      workerAttested: false,
      operationallyCommitted: false,
      adminLabel: "Sin datos",
      because: "No hay asignación que interpretar.",
    };
  }

  const status = norm(a.status);
  const response = norm(a.response_status);
  const attested = hasWorkerResponseEvidence(a);

  if (a.is_draft_reservation === true) {
    return {
      code: "draft_reservation",
      workerAttested: false,
      operationallyCommitted: false,
      adminLabel: "Reserva en borrador",
      because: "La asignación existe sólo mientras el servicio está en borrador.",
    };
  }

  if (response === "rejected" || status === "rejected" || status === "declined") {
    return {
      code: "rejected_by_worker",
      workerAttested: attested,
      operationallyCommitted: false,
      adminLabel: "Rechazado por la persona",
      because: attested
        ? "La persona rechazó el turno desde el portal."
        : "Figura como rechazo, sin marca de tiempo de la respuesta.",
    };
  }

  if (isExcludedAssignmentStatus(status)) {
    return {
      code: "removed",
      workerAttested: false,
      operationallyCommitted: false,
      adminLabel: "Retirado por administración",
      because: "La administración sacó a la persona del turno.",
    };
  }

  if (response === "needs_reacceptance") {
    return {
      code: "needs_reacceptance",
      workerAttested: false,
      operationallyCommitted: false,
      adminLabel: "Debe reconfirmar",
      because: "El turno cambió después de la aceptación: hace falta reconfirmar.",
    };
  }

  if (response === "accepted") {
    return {
      code: "accepted_by_worker",
      workerAttested: true,
      operationallyCommitted: true,
      adminLabel: "Confirmado por la persona",
      because: "La persona aceptó el turno desde el portal.",
    };
  }

  if (isCommittedAssignmentStatus(status)) {
    if (attested) {
      return {
        code: "accepted_by_worker",
        workerAttested: true,
        operationallyCommitted: true,
        adminLabel: "Confirmado por la persona",
        because: "Hay evidencia de la respuesta de la persona.",
      };
    }
    return {
      code: "roster_committed_no_response",
      workerAttested: false,
      operationallyCommitted: true,
      adminLabel: "Asignado por administración",
      because: "Compromiso del roster. No hay respuesta de la persona registrada.",
    };
  }

  if (status === "pending" || response === "pending") {
    return {
      code: "awaiting_worker_response",
      workerAttested: false,
      operationallyCommitted: false,
      adminLabel: "Esperando respuesta",
      because: "La persona está asignada y aún no responde.",
    };
  }

  return {
    code: "unknown",
    workerAttested: false,
    operationallyCommitted: false,
    adminLabel: "Sin determinar",
    because: `Combinación no reconocida (status="${status}", respuesta="${response}").`,
  };
}

/** ¿Podemos afirmar que la PERSONA confirmó? Sólo con evidencia de su acto. */
export function isWorkerConfirmed(a: AssignmentResponseInput | null | undefined): boolean {
  return resolveAssignmentResponseTruth(a).workerAttested
    && resolveAssignmentResponseTruth(a).code === "accepted_by_worker";
}
