/**
 * P0 — VERSIONED WRITE CONTRACT (VWC) — Fase 1.
 *
 * Carril único de escritura para edición de atributos. Reglas:
 *  1. Sólo se envían los campos realmente modificados (PATCH parcial).
 *  2. Siempre viaja `company_id` (blindaje multi-tenant).
 *  3. Siempre viaja `expected_version` — si la fila cambió, el backend
 *     RECHAZA con conflicto en vez de sobrescribir.
 *  4. Se relee la fila persistida y se compara campo a campo: nunca
 *     declaramos éxito por ausencia de error.
 *  5. El backend registra auditoría (`versioned_write_audit`) tanto del
 *     conflicto como de la escritura aplicada.
 *
 * No toca payroll, fichajes, tarifas, asignaciones ni saldos.
 */
import { supabase } from "@/integrations/supabase/client";
import { sameShiftUpdateValue } from "@/lib/shifts/update-shift";

export type VersionedEntity =
  | "scheduled_shifts"
  | "time_entries"
  | "compensation_profiles"
  | "contractor_w9";

/** RPC canónica por entidad. Ninguna superficie escribe la tabla directamente. */
const ENTITY_RPC: Record<VersionedEntity, string> = {
  scheduled_shifts: "versioned_update_shift",
  time_entries: "versioned_update_time_entry",
  compensation_profiles: "versioned_update_compensation_profile",
  contractor_w9: "versioned_update_contractor_w9",
};

const ENTITY_ID_PARAM: Record<VersionedEntity, string> = {
  scheduled_shifts: "p_shift_id",
  time_entries: "p_entry_id",
  compensation_profiles: "p_profile_id",
  contractor_w9: "p_w9_id",
};

export interface VersionedWriteInput {
  entity: VersionedEntity;
  id: string;
  companyId: string | null | undefined;
  /** Sólo campos modificados. Nunca un snapshot completo del formulario. */
  patch: Record<string, any>;
  /** `version` de la fila que el operador tenía a la vista. */
  expectedVersion: number | null | undefined;
  /** Pantalla desde la que se escribe (observabilidad). */
  surface?: string;
  /** Idempotencia opcional para creación/reintentos. */
  intentKey?: string;
  /** Motivo obligatorio para cambios sobre datos históricos (compensación). */
  reason?: string;
}


export type VersionedWriteResult =
  | { status: "applied"; row: Record<string, any>; version: number | null }
  | { status: "noop" }
  | {
      status: "conflict";
      expectedVersion: number | null;
      actualVersion: number | null;
      row: Record<string, any> | null;
      updatedBy: string | null;
      updatedAt: string | null;
      fields: string[];
    }
  | {
      status: "error";
      reason: "denied" | "not_found" | "invalid" | "mismatch" | "error";
      message: string;
      mismatched?: string[];
    };

/** Diff canónico: devuelve sólo lo que cambió, con comparación tolerante a formatos de hora. */
export function buildPatch(
  current: Record<string, any> | null | undefined,
  next: Record<string, any>,
): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const key of Object.keys(next)) {
    if (!samePersistedValue(current?.[key], next[key])) patch[key] = next[key];
  }
  return patch;
}

/** Versión observable de una fila. */
export function rowVersion(row: Record<string, any> | null | undefined): number | null {
  const v = row?.version;
  return typeof v === "number" ? v : null;
}

/**
 * Comparación de evidencia tras releer la fila: tolerante a formatos de hora
 * (`17:00` ≡ `17:00:00`) y a normalización de marcas temporales por Postgres
 * (`2026-08-02T09:00:00` ≡ `2026-08-02T09:00:00+00:00`).
 */
export function samePersistedValue(persisted: any, sent: any): boolean {
  if (sameShiftUpdateValue(persisted, sent)) return true;
  if (typeof persisted === "string" && typeof sent === "string") {
    const a = Date.parse(persisted);
    const b = Date.parse(sent);
    if (!Number.isNaN(a) && !Number.isNaN(b) && a === b) return true;
  }
  if (typeof persisted === "number" || typeof sent === "number") {
    const a = Number(persisted);
    const b = Number(sent);
    if (!Number.isNaN(a) && !Number.isNaN(b) && a === b) return true;
  }
  return false;
}


export async function versionedWrite(input: VersionedWriteInput): Promise<VersionedWriteResult> {
  const { entity, id, companyId, patch, expectedVersion, surface, intentKey, reason } = input;

  const rpc = ENTITY_RPC[entity];
  if (!rpc) {
    return { status: "error", reason: "invalid", message: `Entidad no soportada: ${entity}` };
  }
  if (!companyId) {
    return {
      status: "error",
      reason: "denied",
      message: "Falta el contexto de empresa. Vuelve a seleccionar la empresa e inténtalo otra vez.",
    };
  }
  const fields = Object.keys(patch ?? {});
  if (fields.length === 0) return { status: "noop" };

  const params: Record<string, any> = {
    [ENTITY_ID_PARAM[entity]]: id,
    p_company_id: companyId,
    p_patch: patch,
    p_expected_version: expectedVersion ?? null,
    p_surface: surface ?? null,
    p_intent_key: intentKey ?? null,
  };
  if (entity === "compensation_profiles") params.p_reason = reason ?? null;

  const { data, error } = await supabase.rpc(rpc as any, params as any);


  if (error) return { status: "error", reason: "error", message: error.message };

  const result = (data ?? {}) as Record<string, any>;

  switch (result.status) {
    case "conflict":
      return {
        status: "conflict",
        expectedVersion: result.expected_version ?? null,
        actualVersion: result.actual_version ?? null,
        row: (result.row as Record<string, any>) ?? null,
        updatedBy: result.updated_by ?? null,
        updatedAt: result.updated_at ?? null,
        fields,
      };
    case "not_found":
      return { status: "error", reason: "not_found", message: result.message ?? "El registro no existe en esta empresa." };
    case "denied":
      return { status: "error", reason: "denied", message: result.message ?? "No tienes permiso para editar este registro." };
    case "invalid":
      return { status: "error", reason: "invalid", message: result.message ?? "Cambio no permitido." };
    case "applied": {
      const row = (result.row as Record<string, any>) ?? null;
      if (!row) {
        return { status: "error", reason: "error", message: "Se guardó pero no pudimos releer el registro." };
      }
      // Evidencia obligatoria: la fila persistida debe reflejar el patch.
      const mismatched = fields.filter((key) => !samePersistedValue(row[key], patch[key]));
      if (mismatched.length > 0) {
        return {
          status: "error",
          reason: "mismatch",
          message: `Se guardó parcialmente. Campos sin aplicar: ${mismatched.join(", ")}.`,
          mismatched,
        };
      }

      return { status: "applied", row, version: rowVersion(row) };
    }
    default:
      return { status: "error", reason: "error", message: "Respuesta inesperada del servidor." };
  }
}
