/**
 * OPERATIONAL COUNTS — definición única de los contadores operativos globales
 * ===========================================================================
 *
 * Origen: `docs/qa/STAFLY_SOURCE_OF_TRUTH_RECONCILIATION.md` (P0, Fase 3).
 *
 * Problema resuelto: dos pantallas de inicio mostraban "horas pendientes" con
 * definiciones distintas (28 vs 4) porque cada una escribía su propia consulta:
 *
 *   Today Hub      → `time_entries.clock_out IS NULL`      → 4   (reloj abierto)
 *   Home móvil     → `time_entries.status = 'pending'`     → 28  (sin aprobar)
 *
 * Son DOS preguntas distintas y ambas son legítimas; el error era llamarlas
 * igual. Este módulo fija el vocabulario y es la única puerta para leerlas.
 *
 * DEFINICIONES CANÓNICAS
 * ----------------------
 * HOURS_NEEDING_REVIEW ("Horas por revisar")
 *   `time_entries.status = 'pending'` dentro de la compañía.
 *   = fichajes reales que todavía no pasaron por una decisión de revisión
 *     (aprobado / rechazado). Es la cola previa a payroll.
 *
 * OPEN_CLOCK ("Reloj abierto")
 *   `time_entries.clock_out IS NULL` dentro de la compañía.
 *   = alguien sigue fichado: o está trabajando ahora, o le faltó marcar salida.
 *   NO es "horas por revisar".
 *
 * PENDING_WORKER_RESPONSES ("Respuestas pendientes")
 *   `shift_assignments.response_status = 'pending'` sobre asignaciones vivas de
 *   servicios PUBLICADOS de hoy en adelante. El eje del trabajador, nunca
 *   `shift_assignments.status` (que es la decisión de la administración).
 *
 * PAYROLL SAFETY
 * --------------
 * Este módulo sólo CUENTA. No calcula pago, no toca `time_entries`, no aprueba
 * nada y jamás usa horas programadas: la única fuente son fichajes reales.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Estados de asignación que sacan a la persona del turno. */
const EXCLUDED_ASSIGNMENT_STATUSES =
  "(removed,rejected,declined,cancelled,canceled,unassigned,replaced)";

export interface OperationalHoursCounts {
  /** Fichajes reales esperando decisión de revisión. */
  hoursNeedingReview: number | null;
  /** Fichajes con el reloj todavía abierto (en turno o falta salida). */
  openClock: number | null;
  /** true cuando alguna lectura falló: la UI no debe mostrar un cero mudo. */
  failed: boolean;
}

/** Etiquetas canónicas, para que ninguna pantalla invente la suya. */
export const OPERATIONAL_COUNT_LABELS = {
  hoursNeedingReview: "Horas por revisar",
  openClock: "Reloj abierto",
  pendingWorkerResponses: "Respuestas pendientes",
} as const;

/**
 * Lee los dos contadores de fichajes con una sola definición compartida.
 * Siempre tenant-scoped por `company_id`.
 */
export async function fetchOperationalHoursCounts(
  client: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<OperationalHoursCounts> {
  const sb: any = client;
  const [reviewRes, openRes] = await Promise.all([
    sb
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
    sb
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("clock_out", null),
  ]);

  const failed = Boolean(reviewRes?.error || openRes?.error);
  return {
    hoursNeedingReview: reviewRes?.error ? null : (reviewRes?.count ?? 0),
    openClock: openRes?.error ? null : (openRes?.count ?? 0),
    failed,
  };
}

/**
 * Respuestas del trabajador realmente pendientes: sólo servicios publicados,
 * de hoy en adelante, y asignaciones vivas. Tenant-scoped.
 */
export async function fetchPendingWorkerResponsesCount(
  client: SupabaseClient<any, any, any>,
  companyId: string,
  today: string = new Date().toISOString().split("T")[0],
): Promise<{ count: number | null; failed: boolean }> {
  const sb: any = client;
  const res = await sb
    .from("shift_assignments")
    .select("id, scheduled_shifts!inner(date, publication_status, deleted_at)", {
      count: "exact",
      head: true,
    })
    .eq("company_id", companyId)
    .eq("response_status", "pending")
    .not("status", "in", EXCLUDED_ASSIGNMENT_STATUSES)
    .gte("scheduled_shifts.date", today)
    .eq("scheduled_shifts.publication_status", "published")
    .is("scheduled_shifts.deleted_at", null);

  if (res?.error) return { count: null, failed: true };
  return { count: res?.count ?? 0, failed: false };
}
