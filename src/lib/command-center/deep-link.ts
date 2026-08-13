/**
 * COMMAND CENTER — DEEP LINK CANÓNICO
 * ===================================
 *
 * Fuente única de las URLs que abre el Command Center. Ninguna pantalla
 * construye rutas operativas a mano: toda alerta pide aquí el enlace que
 * abre EXACTAMENTE el contexto donde se resuelve.
 *
 * Contrato:
 *   /app/shift-ops?id=<uuid>&stage=<etapa>&focus=<employee_id>&from=command-center
 *
 * `id` sigue siendo el UUID (identificador técnico de la URL, nunca de la UI).
 * La UI muestra siempre la referencia canónica (`QK-00xxxx`) vía
 * `getShiftDisplayIdentity`.
 *
 * Puro: sin React, sin red, sin escrituras.
 */

/** Etapa exacta del Service Command Center donde se resuelve la incidencia. */
export type ServiceStage =
  /** Resumen / readiness / publicación. */
  | "summary"
  /** Equipo: cupos, asignaciones, reemplazos. */
  | "team"
  /** Asistencia: check-in, ausencias. */
  | "attendance"
  /** Tiempo: fichajes, clock-out, horas. */
  | "time"
  /** Operación: ubicación, transporte, punto de encuentro. */
  | "operation";

/** Origen al que se debe poder volver conservando el contexto. */
export const COMMAND_CENTER_ORIGIN = "command-center";

/** Ruta de retorno canónica del Command Center. */
export const COMMAND_CENTER_ROUTE = "/app/command-center?tab=today";

export interface ServiceDeepLinkInput {
  shiftId: string;
  stage: ServiceStage;
  /** Persona afectada, para resaltarla al abrir la etapa. */
  focusEmployeeId?: string | null;
  /** Marca de retorno. `true` por defecto en alertas del Command Center. */
  fromCommandCenter?: boolean;
}

/** Enlace al Service Command Center, en la etapa exacta. */
export function serviceDeepLink(input: ServiceDeepLinkInput): string {
  const params = new URLSearchParams();
  params.set("id", input.shiftId);
  params.set("stage", input.stage);
  if (input.focusEmployeeId) params.set("focus", input.focusEmployeeId);
  if (input.fromCommandCenter !== false) params.set("from", COMMAND_CENTER_ORIGIN);
  return `/app/shift-ops?${params.toString()}`;
}

/** Revisión de horas de un servicio concreto (nunca la cola genérica). */
export function hoursDeepLink(shiftId?: string | null): string {
  return shiftId
    ? `/app/payroll-review-queue?shiftId=${shiftId}&from=${COMMAND_CENTER_ORIGIN}`
    : "/app/payroll-review-queue";
}

/** Reloj / fichajes de un servicio concreto. */
export function timeclockDeepLink(shiftId: string, focusEmployeeId?: string | null): string {
  const params = new URLSearchParams();
  params.set("shiftId", shiftId);
  if (focusEmployeeId) params.set("focus", focusEmployeeId);
  params.set("from", COMMAND_CENTER_ORIGIN);
  return `/app/timeclock?${params.toString()}`;
}

/** ¿Esta navegación viene del Command Center? */
export function isCommandCenterReturn(search: string | URLSearchParams): boolean {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("from") === COMMAND_CENTER_ORIGIN;
}

/** Etapa pedida por la URL, validada. `null` si no viene o no es válida. */
export function readStage(search: string | URLSearchParams): ServiceStage | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get("stage");
  const valid: ServiceStage[] = ["summary", "team", "attendance", "time", "operation"];
  return valid.includes(raw as ServiceStage) ? (raw as ServiceStage) : null;
}
