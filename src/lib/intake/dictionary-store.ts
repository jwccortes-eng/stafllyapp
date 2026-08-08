/**
 * Smart Service Intake — FASE 5: acceso al diccionario del tenant.
 *
 * Único carril de I/O del diccionario. Todas las escrituras pasan por RPC
 * (`SECURITY DEFINER`) y la edición usa el Versioned Write Contract.
 * Nunca se consulta ni escribe sin `company_id` del contexto autenticado.
 */

import { supabase } from "@/integrations/supabase/client";
import { versionedWrite, type VersionedWriteResult } from "@/lib/data/versioned-write";
import {
  mapDictionaryRow,
  type DictionaryRule,
  type DictionaryRuleType,
} from "./dictionary";

/** Reglas activas e inactivas del tenant (la vista de administración las necesita). */
export async function loadTenantDictionary(
  companyId: string,
  options: { includeInactive?: boolean } = {},
): Promise<DictionaryRule[]> {
  if (!companyId) return [];
  let query = supabase
    .from("intake_dictionary_rules" as any)
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (!options.includeInactive) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    console.error("[intake][dictionary] load failed:", error);
    return [];
  }
  return (data ?? []).map((row: any) => mapDictionaryRow(row));
}

export type ProposeRuleResult =
  | { status: "created" | "reinforced"; rule: DictionaryRule }
  | { status: "conflict"; message: string; rule: DictionaryRule | null }
  | { status: "denied" | "invalid" | "error"; message: string };

export interface ProposeRuleInput {
  companyId: string;
  ruleType: DictionaryRuleType;
  /** Término tal como vino en la fuente. */
  inputValue: string;
  /** Interpretación correcta confirmada por una persona. */
  resolvedValue: string;
  resolvedEntityId?: string | null;
  resolvedEntityKind?: "location" | "client" | "none";
  /** Fuente del intake donde ocurrió la corrección. */
  source?: string | null;
  surface?: string | null;
}

/** Aprende una corrección humana confirmada. Nunca se llama automáticamente. */
export async function proposeDictionaryRule(
  input: ProposeRuleInput,
): Promise<ProposeRuleResult> {
  if (!input.companyId) {
    return { status: "denied", message: "Falta el contexto de empresa." };
  }
  const { data, error } = await supabase.rpc("intake_dictionary_upsert_rule" as any, {
    p_company_id: input.companyId,
    p_rule_type: input.ruleType,
    p_input_value: input.inputValue,
    p_resolved_value: input.resolvedValue,
    p_resolved_entity_id: input.resolvedEntityId ?? null,
    p_resolved_entity_kind: input.resolvedEntityKind ?? "none",
    p_source: input.source ?? null,
    p_surface: input.surface ?? null,
  } as any);

  if (error) return { status: "error", message: error.message };

  const result = (data ?? {}) as Record<string, any>;
  switch (result.status) {
    case "created":
    case "reinforced":
      return { status: result.status, rule: mapDictionaryRow(result.row) };
    case "conflict":
      return {
        status: "conflict",
        message: result.message ?? "Ya existe otra interpretación para este término.",
        rule: result.row ? mapDictionaryRow(result.row) : null,
      };
    case "denied":
    case "invalid":
      return { status: result.status, message: result.message ?? "Cambio no permitido." };
    default:
      return { status: "error", message: "Respuesta inesperada del servidor." };
  }
}

/** Evidencia de uso: la confianza sólo crece con aplicaciones reales. */
export async function recordDictionaryUsage(input: {
  companyId: string;
  ruleId: string;
  outcome: "applied" | "success" | "conflict" | "rejected";
  source?: string | null;
}): Promise<void> {
  if (!input.companyId || !input.ruleId) return;
  const { error } = await supabase.rpc("intake_dictionary_record_usage" as any, {
    p_company_id: input.companyId,
    p_rule_id: input.ruleId,
    p_outcome: input.outcome,
    p_source: input.source ?? null,
  } as any);
  if (error) console.error("[intake][dictionary] usage failed:", error);
}

/** Edición administrativa — SIEMPRE por VWC (PATCH parcial + expected_version). */
export async function updateDictionaryRule(input: {
  companyId: string;
  rule: DictionaryRule;
  patch: Record<string, any>;
  surface?: string;
}): Promise<VersionedWriteResult> {
  return versionedWrite({
    entity: "intake_dictionary_rules",
    id: input.rule.id,
    companyId: input.companyId,
    patch: input.patch,
    expectedVersion: input.rule.version,
    surface: input.surface ?? "company-dictionary",
  });
}

export interface DictionaryEvent {
  id: string;
  ruleId: string | null;
  eventType: string;
  source: string | null;
  createdAt: string;
}

export async function loadDictionaryEvents(
  companyId: string,
  limit = 50,
): Promise<DictionaryEvent[]> {
  if (!companyId) return [];
  const { data, error } = await supabase
    .from("intake_dictionary_events" as any)
    .select("id, rule_id, event_type, source, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[intake][dictionary] events failed:", error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    ruleId: row.rule_id ?? null,
    eventType: row.event_type,
    source: row.source ?? null,
    createdAt: row.created_at,
  }));
}
