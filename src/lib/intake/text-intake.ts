/**
 * Smart Service Intake — Fase 2: orquestación del canal de texto pegado.
 *
 * Reutiliza EXACTAMENTE el carril canónico de Fase 1:
 *   import_batches (batch_type='service_intake', source='pasted_text')
 *     → raw_schedule_import_rows (texto original íntegro, trazable)
 *       → candidatos normalizados (parser puro)
 *         → bandeja compartida (revisión humana obligatoria)
 *           → scheduled_shifts (publication_status='draft') vía helper canónico
 *
 * Este módulo NO escribe en `scheduled_shifts`: sólo prepara. La creación
 * pasa siempre por `createDraftServicesFromCandidates`.
 */

import { supabase } from "@/integrations/supabase/client";
import { createServiceIntakeBatch, persistIntakeRawRows } from "./batch";
import { recomputeCandidate, type IntakeSource, type ServiceCandidate } from "./candidate";
import type { CandidateRef } from "./candidate";
import { applyDuplicateVerdict, detectDuplicate, type ExistingServiceRow } from "./duplicate";
import { resolveEntity, type CatalogEntry } from "./entity-resolution";
import {
  expandWithDictionary,
  isApplicableRule,
  lookupDictionary,
  type DictionaryRule,
  type DictionaryRuleType,
} from "./dictionary";
import { loadTenantDictionary } from "./dictionary-store";
import { fingerprintText } from "./telemetry";
import { parseTextToCandidates, type TextParseNotice } from "./text-parser";

export interface IntakeCatalogs {
  clients: CatalogEntry[];
  venues: CatalogEntry[];
  /** Fase 5 — memoria operativa de la compañía (correcciones humanas). */
  dictionary?: DictionaryRule[];
}

/** Catálogos del tenant autenticado. Nunca se cruzan compañías. */
export async function loadIntakeCatalogs(companyId: string): Promise<IntakeCatalogs> {
  const [clientsRes, venuesRes, dictionary] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("locations_v2")
      .select("id, name, formatted_address")
      .eq("company_id", companyId)
      .eq("is_active", true),
    loadTenantDictionary(companyId),
  ]);

  const clients: CatalogEntry[] = (clientsRes.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name ?? "",
  }));
  const venues: CatalogEntry[] = (venuesRes.data ?? []).map((v: any) => ({
    id: v.id,
    name: v.name ?? v.formatted_address ?? "",
    aliases: v.formatted_address && v.name ? [v.formatted_address] : undefined,
  }));
  return { clients, venues, dictionary };
}

/**
 * Fase 5 — aplica el diccionario del tenant DESPUÉS del match canónico exacto
 * y ANTES del resolver fuzzy. Una regla ambigua o de baja confianza nunca se
 * aplica sola: el candidato vuelve a revisión humana.
 */
function applyDictionaryToRef(
  raw: string,
  ref: CandidateRef,
  catalog: CatalogEntry[],
  dictionary: DictionaryRule[] | undefined,
  ruleTypes: DictionaryRuleType[],
): CandidateRef {
  // 1. El match canónico exacto manda siempre.
  if (ref.resolvedId && !ref.requiresConfirmation) {
    return { ...ref, matchOrigin: "exact" };
  }

  const lookup = lookupDictionary(raw, dictionary, ruleTypes);
  if (!lookup) {
    return { ...ref, matchOrigin: ref.suggestedId ? "fuzzy" : "none" };
  }

  // Conflicto conocido → jamás automático.
  if (!isApplicableRule(lookup)) {
    return {
      ...ref,
      requiresConfirmation: true,
      dictionaryRuleId: lookup.rule.id,
      matchOrigin: ref.suggestedId ? "fuzzy" : "none",
    };
  }

  const rule = lookup.rule;
  const entity = rule.resolvedEntityId
    ? catalog.find((e) => e.id === rule.resolvedEntityId)
    : catalog.find(
        (e) => e.name.trim().toLowerCase() === rule.resolvedValue.trim().toLowerCase(),
      );
  if (!entity) {
    // La regla apunta a algo que ya no existe en el catálogo: no se aplica.
    return { ...ref, matchOrigin: ref.suggestedId ? "fuzzy" : "none" };
  }

  return {
    raw,
    resolvedId: entity.id,
    suggestedId: entity.id,
    suggestedLabel: entity.name,
    confidence: rule.confidence,
    requiresConfirmation: false,
    dictionaryRuleId: rule.id,
    matchOrigin: "dictionary",
  };
}

/**
 * Resuelve venue y cliente reutilizando el resolver de Fase 1 más el
 * diccionario del tenant (Fase 5). Nunca crea entidades; un match no exacto
 * y sin regla aprendida exige confirmación humana.
 */
export function resolveCandidateEntities(
  candidate: ServiceCandidate,
  catalogs: IntakeCatalogs,
): ServiceCandidate {
  const raw = candidate.venueCandidate.raw || candidate.clientCandidate.raw;
  const dictionary = catalogs.dictionary ?? [];

  // Expansión de texto libre (tipo de servicio y roles) por abreviaciones aprendidas.
  const expandedType = expandWithDictionary(candidate.serviceType, dictionary, [
    "service_type_alias",
    "abbreviation",
    "spelling_variant",
  ]);
  const expandedRoles = (candidate.roleCandidates ?? []).map(
    (role) =>
      expandWithDictionary(role, dictionary, ["role_alias", "abbreviation", "spelling_variant"])
        .value ?? role,
  );

  if (!raw) {
    return recomputeCandidate({
      ...candidate,
      serviceType: expandedType.value ?? candidate.serviceType,
      roleCandidates: expandedRoles,
    });
  }

  const venueRef = applyDictionaryToRef(
    raw,
    resolveEntity(raw, catalogs.venues),
    catalogs.venues,
    dictionary,
    ["venue_alias", "abbreviation", "spelling_variant"],
  );
  const clientRef = applyDictionaryToRef(
    raw,
    resolveEntity(raw, catalogs.clients),
    catalogs.clients,
    dictionary,
    ["client_alias", "abbreviation", "spelling_variant"],
  );

  const next: ServiceCandidate = {
    ...candidate,
    serviceType: expandedType.value ?? candidate.serviceType,
    roleCandidates: expandedRoles,
    venueCandidate: { ...venueRef, raw },
    locationCandidate: {
      ...venueRef,
      raw,
      // sólo se materializa como location si el humano confirmó o hay regla aprendida
      resolvedId: venueRef.resolvedId,
    },
    clientCandidate:
      clientRef.suggestedId || clientRef.resolvedId
        ? { ...clientRef, raw }
        : candidate.clientCandidate,
    confidenceByField: {
      ...candidate.confidenceByField,
      venue: venueRef.confidence || candidate.confidenceByField.venue || 0,
      client: clientRef.confidence || candidate.confidenceByField.client || 0,
    },
  };
  return recomputeCandidate(next);
}


/** Servicios existentes del tenant en las fechas involucradas (para duplicados). */
export async function loadExistingServices(
  companyId: string,
  dates: string[],
): Promise<ExistingServiceRow[]> {
  const unique = Array.from(new Set(dates.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("scheduled_shifts")
    .select(
      "id, company_id, date, start_time, end_time, client_id, location_id, job_site_address, title, reconciliation_hash, clients(name)",
    )
    .eq("company_id", companyId)
    .in("date", unique);
  if (error) {
    console.error("[intake] loadExistingServices failed:", error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    client_id: row.client_id,
    client_name: row.clients?.name ?? null,
    location_id: row.location_id,
    venue_name: row.job_site_address ?? null,
    service_type: row.title ?? null,
    reconciliation_hash: row.reconciliation_hash ?? null,
  }));
}

export interface PastedTextIntakeInput {
  /** SIEMPRE del contexto autenticado. Nunca del contenido del mensaje. */
  companyId: string;
  userId: string;
  text: string;
  /** Hoy del sistema, YYYY-MM-DD. */
  referenceDate: string;
  source?: IntakeSource;
}

export interface PastedTextIntakeResult {
  batchId: string | null;
  candidates: ServiceCandidate[];
  notices: TextParseNotice[];
  warnings: string[];
  source: IntakeSource;
}

/**
 * Procesa un texto pegado de punta a punta hasta dejar candidatos listos
 * para revisión humana. NO crea ningún Servicio.
 */
export async function runPastedTextIntake(
  input: PastedTextIntakeInput,
): Promise<PastedTextIntakeResult> {
  if (!input.companyId) throw new Error("companyId requerido (contexto autenticado)");
  const source: IntakeSource = input.source ?? "pasted_text";

  // 1. Batch canónico (trazabilidad del origen).
  const batchId = await createServiceIntakeBatch({
    companyId: input.companyId,
    createdBy: input.userId,
    source,
    fileName: `texto-pegado-${fingerprintText(input.text)}`,
  });

  // 2. Parseo puro.
  const parsed = parseTextToCandidates(input.text, {
    companyId: input.companyId,
    batchId,
    source,
    referenceDate: input.referenceDate,
  });

  const warnings = [...parsed.warnings];

  // 3. Fuente original guardada de forma trazable (una fila por fragmento
  //    + una fila 0 con el mensaje completo).
  let candidates = parsed.candidates;
  if (batchId) {
    const rows = [
      {
        rowNumber: 0,
        raw: { kind: "source_message", source, text: input.text } as Record<string, unknown>,
        rowHash: `${batchId}|source`,
      },
      ...parsed.segments.map((seg, i) => ({
        rowNumber: i + 1,
        raw: {
          kind: "segment",
          candidate_id: seg.candidateId,
          line: seg.lineNumber,
          excerpt: seg.excerpt,
        } as Record<string, unknown>,
        rowHash: `${batchId}|${seg.candidateId}`,
      })),
    ];
    const idByHash = await persistIntakeRawRows(batchId, input.companyId, rows);
    candidates = candidates.map((c) => ({
      ...c,
      sourceRowId: idByHash.get(`${batchId}|${c.id}`) ?? null,
    }));
  } else {
    warnings.push("No se pudo registrar el lote de importación; se puede revisar pero no crear.");
  }

  // 4. Resolución de venue/cliente (suggestion-only).
  const catalogs = await loadIntakeCatalogs(input.companyId);
  candidates = candidates.map((c) => resolveCandidateEntities(c, catalogs));

  // 5. Detección canónica de duplicados.
  const existing = await loadExistingServices(
    input.companyId,
    candidates.map((c) => c.serviceDate ?? ""),
  );
  candidates = candidates.map((c) =>
    recomputeCandidate(applyDuplicateVerdict(c, detectDuplicate(c, existing))),
  );

  return { batchId, candidates, notices: parsed.notices, warnings, source };
}

/** Reevalúa duplicados tras ediciones humanas (fecha/venue corregidos). */
export async function refreshDuplicateStatus(
  companyId: string,
  candidates: ServiceCandidate[],
): Promise<ServiceCandidate[]> {
  const existing = await loadExistingServices(
    companyId,
    candidates.map((c) => c.serviceDate ?? ""),
  );
  return candidates.map((c) =>
    recomputeCandidate(applyDuplicateVerdict(c, detectDuplicate(c, existing))),
  );
}
