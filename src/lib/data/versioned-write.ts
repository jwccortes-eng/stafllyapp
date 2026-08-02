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

export type VersionedEntity = "scheduled_shifts";

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
    if (!sameShiftUpdateValue(current?.[key], next[key])) patch[key] = next[key];
  }
  return patch;
}

/** Versión observable de una fila. */
export function rowVersion(row: Record<string, any> | null | undefined): number | null {
  const v = row?.version;
  return typeof v === "number" ? v : null;
}

export async function versionedWrite(input: VersionedWriteInput): Promise<VersionedWriteResult> {
  const { entity, id, companyId, patch, expectedVersion, surface, intentKey } = input;

  if (entity !== "scheduled_shifts") {
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

  const { data, error } = await supabase.rpc("versioned_update_shift", {
    p_shift_id: id,
    p_company_id: companyId,
    p_patch: patch as any,
    p_expected_version: expectedVersion ?? null,
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
        row: (result.row as Record<string, any>) ?? null,
        updatedBy: result.updated_by ?? null,
        updatedAt: result.updated_at ?? null,
        fields,
      };
    case "not_found":
      return { status: "error", reason: "not_found", message: result.message ?? "El servicio no existe en esta empresa." };
    case "denied":
      return { status: "error", reason: "denied", message: result.message ?? "No tienes permiso para editar este servicio." };
    case "invalid":
      return { status: "error", reason: "invalid", message: result.message ?? "Cambio no permitido." };
    case "applied": {
      const row = (result.row as Record<string, any>) ?? null;
      if (!row) {
        return { status: "error", reason: "error", message: "El servicio se guardó pero no pudimos releerlo." };
      }
      // Evidencia obligatoria: la fila persistida debe reflejar el patch.
      const mismatched = fields.filter((key) => !sameShiftUpdateValue(row[key], patch[key]));
      if (mismatched.length > 0) {
        return {
          status: "error",
          reason: "mismatch",
          message: `El servicio se guardó parcialmente. Campos sin aplicar: ${mismatched.join(", ")}.`,
          mismatched,
        };
      }
      return { status: "applied", row, version: rowVersion(row) };
    }
    default:
      return { status: "error", reason: "error", message: "Respuesta inesperada del servidor." };
  }
}
