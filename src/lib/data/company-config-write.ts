/**
 * P0 — VWC Fase 3C: configuración de empresa NO financiera.
 *
 * Carril único de escritura para:
 *  - `company_settings` (preferencias operativas, una clave por vez);
 *  - identidad visible de la empresa (`name`, `logo_url`, `brand_color`).
 *
 * Reglas idénticas al resto del contrato:
 *  1. PATCH parcial — nunca un snapshot completo del formulario ni del JSONB.
 *  2. Siempre viaja `company_id` (blindaje multi-tenant).
 *  3. Siempre viaja `expected_version`; si la fila cambió, el backend rechaza.
 *  4. Se verifica la fila releída campo a campo antes de declarar éxito.
 *  5. El backend audita conflicto y escritura en `versioned_write_audit`.
 *
 * Bloqueado por diseño (no existe camino desde estas superficies):
 *  billing, plan, subscription, is_active, ownership, permisos, RLS,
 *  payroll (`pay_week`, `overtime`, `pay_types`, `payroll_config`),
 *  seguridad (`security.*`), `tenant_type` y datos históricos de importación.
 */
import { supabase } from "@/integrations/supabase/client";
import { samePersistedValue, type VersionedWriteResult } from "@/lib/data/versioned-write";

/** Claves de `company_settings` editables por PATCH versionado (clase A). */
export const EDITABLE_SETTING_KEYS = [
  "geofence",
  "time_tolerance",
  "auto_close",
  "auto_validation",
  "shifts_config",
  "clock_config",
  "onboarding_config",
  "employee_number_config",
  "notifications",
  "branding",
  "portal",
  "auto_dispatch",
  "connecteam_mapping",

] as const;

export type EditableSettingKey = (typeof EDITABLE_SETTING_KEYS)[number];

/** Claves financieras o de tenant: nunca se editan por este carril. */
export const BLOCKED_SETTING_KEYS = [
  "pay_week",
  "overtime",
  "pay_types",
  "payroll_config",
  "payroll_sequence",
  "tenant_type",
  "security.pin_auth_mode",
  "imported_schedule_files",
] as const;

export function isEditableSettingKey(key: string): key is EditableSettingKey {
  return (EDITABLE_SETTING_KEYS as readonly string[]).includes(key);
}

/** Campos de la empresa editables desde la UI (clase A). */
export const EDITABLE_COMPANY_FIELDS = ["name", "logo_url", "brand_color"] as const;

function interpret(
  data: any,
  patch: Record<string, any>,
  fields: string[],
): VersionedWriteResult {
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
      return { status: "error", reason: "not_found", message: result.message ?? "La empresa no existe." };
    case "denied":
      return { status: "error", reason: "denied", message: result.message ?? "No tienes permiso para editar esta configuración." };
    case "invalid":
      return { status: "error", reason: "invalid", message: result.message ?? "Cambio no permitido." };
    case "applied": {
      const row = (result.row as Record<string, any>) ?? null;
      if (!row) {
        return { status: "error", reason: "error", message: "Se guardó pero no pudimos releer la configuración." };
      }
      const mismatched = fields.filter((key) => !samePersistedValue(row[key], patch[key]));
      if (mismatched.length > 0) {
        return {
          status: "error",
          reason: "mismatch",
          message: `Se guardó parcialmente. Campos sin aplicar: ${mismatched.join(", ")}.`,
          mismatched,
        };
      }
      return { status: "applied", row, version: typeof row.version === "number" ? row.version : null };
    }
    default:
      return { status: "error", reason: "error", message: "Respuesta inesperada del servidor." };
  }
}

export interface CompanySettingWriteInput {
  companyId: string | null | undefined;
  key: string;
  /** Sólo las claves modificadas dentro del JSONB. */
  patch: Record<string, any>;
  expectedVersion: number | null | undefined;
  surface?: string;
  intentKey?: string;
}

export async function versionedCompanySettingWrite(
  input: CompanySettingWriteInput,
): Promise<VersionedWriteResult> {
  const { companyId, key, patch, expectedVersion, surface, intentKey } = input;

  if (!companyId) {
    return {
      status: "error",
      reason: "denied",
      message: "Falta el contexto de empresa. Vuelve a seleccionar la empresa e inténtalo otra vez.",
    };
  }
  if (!isEditableSettingKey(key)) {
    return { status: "error", reason: "invalid", message: `Configuración no editable desde esta superficie: ${key}` };
  }
  const fields = Object.keys(patch ?? {});
  if (fields.length === 0) return { status: "noop" };

  const { data, error } = await supabase.rpc("versioned_update_company_setting" as any, {
    p_company_id: companyId,
    p_key: key,
    p_patch: patch,
    p_expected_version: expectedVersion ?? null,
    p_surface: surface ?? null,
    p_intent_key: intentKey ?? null,
  } as any);

  if (error) return { status: "error", reason: "error", message: error.message };
  return interpret(data, patch, fields);
}

export interface CompanyProfileWriteInput {
  companyId: string | null | undefined;
  patch: Record<string, any>;
  expectedVersion: number | null | undefined;
  surface?: string;
  intentKey?: string;
}

export async function versionedCompanyProfileWrite(
  input: CompanyProfileWriteInput,
): Promise<VersionedWriteResult> {
  const { companyId, patch, expectedVersion, surface, intentKey } = input;

  if (!companyId) {
    return {
      status: "error",
      reason: "denied",
      message: "Falta el contexto de empresa. Vuelve a seleccionar la empresa e inténtalo otra vez.",
    };
  }
  const fields = Object.keys(patch ?? {});
  if (fields.length === 0) return { status: "noop" };

  const blocked = fields.filter((f) => !(EDITABLE_COMPANY_FIELDS as readonly string[]).includes(f));
  if (blocked.length > 0) {
    return { status: "error", reason: "invalid", message: `Campos protegidos: ${blocked.join(", ")}.` };
  }

  const { data, error } = await supabase.rpc("versioned_update_company_profile" as any, {
    p_company_id: companyId,
    p_patch: patch,
    p_expected_version: expectedVersion ?? null,
    p_surface: surface ?? null,
    p_intent_key: intentKey ?? null,
  } as any);

  if (error) return { status: "error", reason: "error", message: error.message };
  return interpret(data, patch, fields);
}
