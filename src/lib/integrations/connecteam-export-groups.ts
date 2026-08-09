/**
 * CONNECTEAM EXPORT — LECTURA OPERATIVA POR CAUSA
 * ===============================================
 *
 * Traduce el resultado técnico de `validateShiftForExport` al lenguaje del
 * coordinador: qué sale, qué no sale, POR QUÉ y cómo resolverlo por lote.
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin React, sin BD, sin escrituras.
 *   No cambia el motor de exportación, el CSV, el mapping, payroll,
 *   time_entries, assignments ni scheduled_shifts.
 */
import type { ValidationResult } from "./connecteam-export";

export type ExportCauseKey =
  | "pending_end"
  | "missing_job_site"
  | "missing_client"
  | "missing_permission"
  | "missing_basics";

export interface ExportCauseMeta {
  key: ExportCauseKey;
  /** Título en lenguaje operativo, nunca técnico. */
  label: string;
  /** Explicación de una línea: qué necesita Connecteam. */
  explanation: string;
  /** Acción por lote disponible dentro de esta pantalla. */
  batchActionLabel: string | null;
}

export const EXPORT_CAUSES: ExportCauseMeta[] = [
  {
    key: "pending_end",
    label: "Falta hora final",
    explanation:
      "Connecteam necesita una hora final para crear el turno. En Stafly todavía no conocemos esa información.",
    batchActionLabel: "Resolver todos",
  },
  {
    key: "missing_job_site",
    label: "Falta Job Site",
    explanation: "Connecteam necesita saber a qué Job pertenece cada turno.",
    batchActionLabel: null,
  },
  {
    key: "missing_client",
    label: "Falta Cliente",
    explanation: "El servicio todavía no tiene cliente vinculado.",
    batchActionLabel: null,
  },
  {
    key: "missing_permission",
    label: "Falta permisos",
    explanation: "Tu cuenta no puede exportar estos servicios en esta empresa.",
    batchActionLabel: null,
  },
  {
    key: "missing_basics",
    label: "Falta información básica",
    explanation: "Fecha, hora de inicio o título del servicio todavía están pendientes.",
    batchActionLabel: null,
  },
];

const CODE_TO_CAUSE: Record<string, ExportCauseKey> = {
  missing_end: "pending_end",
  zero_duration: "pending_end",
  missing_job_context: "missing_job_site",
  no_admin: "missing_permission",
  no_tenant: "missing_permission",
  tenant_mismatch: "missing_permission",
  missing_date: "missing_basics",
  missing_start: "missing_basics",
  missing_title: "missing_basics",
  missing_timezone: "missing_basics",
  terminal_status: "missing_basics",
};

/**
 * Causa principal que impide exportar un servicio. `null` cuando el servicio
 * ya está listo (los avisos no bloquean).
 */
export function primaryCauseFor(
  validation: ValidationResult,
  opts: { hasClient: boolean },
): ExportCauseKey | null {
  if (validation.status !== "blocked") return null;
  const blocks = validation.warnings.filter((w) => w.severity === "block");
  for (const cause of EXPORT_CAUSES) {
    if (blocks.some((w) => CODE_TO_CAUSE[w.code] === cause.key)) return cause.key;
  }
  if (!opts.hasClient) return "missing_client";
  return "missing_basics";
}

/** Frase corta que se muestra en la columna "Problema" de la tabla. */
export function causeShortLabel(key: ExportCauseKey | null): string {
  if (!key) return "—";
  if (key === "pending_end") return "Hora final pendiente";
  return EXPORT_CAUSES.find((c) => c.key === key)?.label ?? "Requiere un dato";
}

export interface CauseGroup<T> {
  meta: ExportCauseMeta;
  items: T[];
}

/** Agrupa por causa, respetando el orden canónico y mostrando también las causas en 0. */
export function groupByCause<T>(
  items: T[],
  causeOf: (item: T) => ExportCauseKey | null,
): CauseGroup<T>[] {
  return EXPORT_CAUSES.map((meta) => ({
    meta,
    items: items.filter((i) => causeOf(i) === meta.key),
  }));
}
