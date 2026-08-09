/**
 * FIXTURE PERMANENTE — CASO MAESTRO QK-001592
 * ===========================================
 *
 * Payload REAL leído de la base de datos (empresa Quality Staff by Keury),
 * no una versión simplificada. Sirve como regresión obligatoria del contrato
 * de recurrencia: mientras este fixture exista, una serie L-M-X-J debe seguir
 * produciendo 4 ocurrencias independientes.
 *
 * Fila original:
 *   shift_ref            QK-001592
 *   id                   e89a2507-52f8-4325-8537-079a025e7166
 *   date                 2026-08-10 (lunes)
 *   start_time/end_time  16:00:00 / 21:00:00
 *   slots                6
 *   status               published / publication_status published
 *   client_id            5e246535-945b-46aa-8df1-d4aee2b9be3b (Elum Franklhall)
 *   assignments          6
 *   reconciliation_hash  NULL  ← la serie se perdió antes de persistir
 */

export const QK_001592_ROW = {
  id: "e89a2507-52f8-4325-8537-079a025e7166",
  shift_ref: "QK-001592",
  company_id: "00000000-0000-0000-0000-000000000001",
  title: "Evento",
  date: "2026-08-10",
  start_time: "16:00:00",
  end_time: "21:00:00",
  slots: 6,
  status: "published",
  publication_status: "published",
  client_id: "5e246535-945b-46aa-8df1-d4aee2b9be3b",
  job_site_location_id: null,
  location_id: null,
  /** Evidencia del bug: la ocurrencia llegó sin referencia de serie. */
  reconciliation_hash: null as string | null,
  assignments_count: 6,
} as const;

/** Intención original del operador: repetir lunes, martes, miércoles y jueves. */
export const QK_001592_REPEAT_INTENT = {
  enabled: true,
  mode: "weekdays" as const,
  selectedDays: [1, 2, 3, 4],
  rangeStart: "2026-08-10",
  rangeEnd: "2026-08-13",
  nextNDays: 1,
  copyAssignments: true,
};

/** Fechas operativas esperadas de la serie. */
export const QK_001592_EXPECTED_DATES = [
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
] as const;

/** Equipo real asignado a la ocurrencia origen (6 workers). */
export const QK_001592_EMPLOYEE_IDS = Array.from(
  { length: QK_001592_ROW.assignments_count },
  (_, i) => `qk1592-worker-${i + 1}`,
);
