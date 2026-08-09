/**
 * ELDM Fase 1B — persistencia (fuera del core, único punto de I/O).
 *
 * El motor `src/lib/eldm` no conoce la base de datos. Aquí se escribe y se lee
 * la memoria persistente del ecosistema:
 *
 *   evento operativo → adapter → señal → `eldm_signals` → snapshot → contexto
 *
 * Garantías:
 * - Idempotencia: `(company_id, source_reference)` es único; reprocesar el
 *   mismo evento no infla la evidencia.
 * - Corrección: nunca se borra historia. Se marca `superseded_by` y la señal
 *   deja de contar como evidencia vigente.
 * - Tenant safety: toda lectura y escritura va acotada por `company_id`, y RLS
 *   lo vuelve a verificar en el servidor.
 * - Privacidad: los atributos pasan por `stripSensitiveAttributes`.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildCompanyPatterns,
  buildPersonPatterns,
  stripSensitiveAttributes,
  toDecision,
  toFact,
  toOutcome,
  type EcosystemSignal,
  type KnowledgeItem,
} from "@/lib/eldm";
import type { PersistableSignal } from "@/lib/eldm-adapters";
import type { MemorySnapshot } from "@/lib/eldm";

const TABLE = "eldm_signals" as const;

export interface StoredSignalRow {
  id: string;
  company_id: string;
  knowledge_kind: string;
  domain: string;
  verb: string;
  scope_level: string;
  person_id: string | null;
  venue_id: string | null;
  client_id: string | null;
  service_type: string | null;
  subject_role: string | null;
  occurred_at: string;
  source_reference: string;
  evidence_ref: string | null;
  attributes: Record<string, unknown> | null;
  superseded_by: string | null;
}

/** Fila lista para insertar. Función pura: testeable sin base de datos. */
export function toRow(signal: PersistableSignal) {
  return {
    company_id: signal.subject.companyId!,
    knowledge_kind: signal.knowledgeKind,
    domain: signal.domain,
    verb: signal.verb,
    scope_level: signal.scope.level,
    person_id: signal.subject.personId ?? null,
    venue_id: signal.subject.venueId ?? null,
    client_id: signal.subject.clientId ?? null,
    service_type: signal.subject.serviceType ?? null,
    subject_role: signal.subject.role ?? null,
    occurred_at: signal.occurredAt,
    source_reference: signal.sourceReference,
    evidence_ref: signal.evidenceRef ?? null,
    attributes: stripSensitiveAttributes(signal.attributes),
  };
}

/** Fila persistida → señal canónica. Pura. */
export function fromRow(row: StoredSignalRow): EcosystemSignal {
  return {
    id: row.id,
    domain: row.domain as EcosystemSignal["domain"],
    verb: row.verb,
    subject: {
      personId: row.person_id ?? undefined,
      companyId: row.company_id,
      venueId: row.venue_id ?? undefined,
      clientId: row.client_id ?? undefined,
      serviceType: row.service_type ?? undefined,
      role: row.subject_role ?? undefined,
    },
    scope: { level: "tenant", companyId: row.company_id },
    occurredAt: row.occurred_at,
    attributes: (row.attributes ?? {}) as EcosystemSignal["attributes"],
    evidenceRef: row.evidence_ref ?? undefined,
  };
}

/**
 * Registra una señal. Reprocesar el mismo evento no crea evidencia nueva:
 * el conflicto sobre `(company_id, source_reference)` se ignora.
 */
export async function recordSignal(signal: PersistableSignal): Promise<void> {
  const row = toRow(signal);
  const { error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "company_id,source_reference", ignoreDuplicates: true });
  if (error) throw error;
}

export async function recordSignals(signals: PersistableSignal[]): Promise<void> {
  if (signals.length === 0) return;
  const { error } = await supabase
    .from(TABLE)
    .upsert(signals.map(toRow), {
      onConflict: "company_id,source_reference",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

/**
 * Corrección de un dato de origen: la evidencia anterior deja de ser vigente
 * sin borrarse. Si se aporta una señal correctiva, queda enlazada.
 */
export async function supersedeSignal(params: {
  companyId: string;
  sourceReference: string;
  reason: string;
  replacement?: PersistableSignal;
}): Promise<void> {
  let replacementId: string | null = null;
  if (params.replacement) {
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(toRow(params.replacement), {
        onConflict: "company_id,source_reference",
        ignoreDuplicates: false,
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    replacementId = (data as { id: string } | null)?.id ?? null;
  }

  const { error } = await supabase
    .from(TABLE)
    .update({
      superseded_by: replacementId,
      superseded_at: new Date().toISOString(),
      superseded_reason: params.reason,
    })
    .eq("company_id", params.companyId)
    .eq("source_reference", params.sourceReference);
  if (error) throw error;
}

export interface LoadSignalsQuery {
  companyId: string;
  personId?: string;
  venueId?: string;
  clientId?: string;
  limit?: number;
}

/** Lee las señales vigentes del tenant. Nunca cruza compañías. */
export async function loadSignals(query: LoadSignalsQuery): Promise<EcosystemSignal[]> {
  let request = supabase
    .from(TABLE)
    .select(
      "id, company_id, knowledge_kind, domain, verb, scope_level, person_id, venue_id, client_id, service_type, subject_role, occurred_at, source_reference, evidence_ref, attributes, superseded_by",
    )
    .eq("company_id", query.companyId)
    .is("superseded_by", null)
    .is("superseded_at", null)
    .order("occurred_at", { ascending: false })
    .limit(query.limit ?? 500);

  if (query.personId) request = request.eq("person_id", query.personId);
  if (query.venueId) request = request.eq("venue_id", query.venueId);
  if (query.clientId) request = request.eq("client_id", query.clientId);

  const { data, error } = await request;
  if (error) throw error;
  return ((data ?? []) as unknown as StoredSignalRow[]).map(fromRow);
}

/**
 * Proyecta señales persistidas en memoria consultable.
 * Pura: la usan tanto la app como los tests, con las mismas reglas.
 */
export function buildSnapshot(params: {
  companyId: string;
  signals: EcosystemSignal[];
  personId?: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  now: string;
}): MemorySnapshot {
  const { companyId, signals, now } = params;

  const items: KnowledgeItem[] = [];

  for (const signal of signals) {
    if (signal.domain === "intake") {
      items.push(
        signal.verb === "alias_confirmed"
          ? toFact(signal, aliasExplanation(signal))
          : toDecision(signal, `El equipo registró: ${signal.verb}.`),
      );
    }
    if (signal.domain === "response" || signal.domain === "attendance" || signal.domain === "rating") {
      items.push(toOutcome(signal, outcomeExplanation(signal)));
    }
  }

  if (params.personId) {
    items.push(
      ...buildPersonPatterns({
        personId: params.personId,
        companyId,
        signals: signals.filter((s) => s.subject.personId === params.personId),
        now,
      }),
    );
  }

  items.push(
    ...buildCompanyPatterns({
      companyId,
      venueId: params.venueId,
      clientId: params.clientId,
      serviceType: params.serviceType,
      signals,
      now,
    }),
  );

  return { items };
}

function aliasExplanation(signal: EcosystemSignal): string {
  const alias = signal.attributes.alias_normalized;
  return alias
    ? `El equipo confirmó que "${alias}" corresponde a esta entidad.`
    : "El equipo confirmó esta correspondencia al importar.";
}

const OUTCOME_TEXT: Record<string, string> = {
  accepted: "Aceptó el servicio.",
  rejected: "No aceptó el servicio.",
  cancelled_by_worker: "Canceló después de aceptar.",
  worked: "Trabajó el servicio.",
  no_show: "No se presentó.",
  service_completed: "El servicio se completó.",
  rated_positive: "Recibió una valoración positiva.",
  rated_negative: "Recibió una valoración negativa.",
};

function outcomeExplanation(signal: EcosystemSignal): string {
  return OUTCOME_TEXT[signal.verb] ?? `Resultado registrado: ${signal.verb}.`;
}

/** Carga persistente + proyección. Un solo paso para la app. */
export async function loadMemorySnapshot(params: {
  companyId: string;
  personId?: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  now?: string;
}): Promise<MemorySnapshot> {
  const signals = await loadSignals({
    companyId: params.companyId,
    personId: params.personId,
    venueId: params.venueId,
  });
  return buildSnapshot({
    companyId: params.companyId,
    signals,
    personId: params.personId,
    venueId: params.venueId,
    clientId: params.clientId,
    serviceType: params.serviceType,
    now: params.now ?? new Date().toISOString(),
  });
}
