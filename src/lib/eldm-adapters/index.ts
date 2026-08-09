/**
 * ELDM Fase 1B — adapters de dominio.
 *
 * Tres dominios únicamente: Smart Intake / Entity Resolution, Service
 * Assignments y Worker Response / Outcome. Nada más se conecta todavía.
 *
 * Reglas:
 * - Ningún adapter escribe: sólo traduce a `PersistableSignal`.
 * - Toda señal lleva `sourceReference` estable (idempotencia).
 * - Los atributos pasan por `stripSensitiveAttributes` en el store.
 * - Horas programadas jamás producen un outcome de trabajo realizado.
 */
import { isValidWorkOutcome, type EcosystemSignal } from "@/lib/eldm";
import { buildSourceReference, type PersistableSignal } from "./types";

export * from "./types";
export * from "./explainability";

type Attributes = EcosystemSignal["attributes"];

function tenantSignal(params: {
  companyId: string;
  domain: EcosystemSignal["domain"];
  verb: string;
  knowledgeKind: PersistableSignal["knowledgeKind"];
  occurredAt: string;
  sourceReference: string;
  subject: EcosystemSignal["subject"];
  attributes?: Attributes;
  evidenceRef?: string;
}): PersistableSignal {
  return {
    id: params.sourceReference,
    domain: params.domain,
    verb: params.verb,
    knowledgeKind: params.knowledgeKind,
    sourceReference: params.sourceReference,
    subject: { ...params.subject, companyId: params.companyId },
    scope: { level: "tenant", companyId: params.companyId },
    occurredAt: params.occurredAt,
    attributes: params.attributes ?? {},
    evidenceRef: params.evidenceRef,
  };
}

/* ─────────────── 1. Smart Intake / Entity Resolution ─────────────── */

export type EntityResolutionVerb =
  | "alias_confirmed"
  | "entity_match_accepted"
  | "entity_match_rejected"
  | "entity_created"
  | "duplicate_prevented"
  | "corrected_entity";

export interface EntityResolutionEvent {
  companyId: string;
  verb: EntityResolutionVerb;
  entityType: "client" | "venue" | "contact" | "worker";
  /** Id de la entidad resuelta o creada. Nunca el texto original con PII. */
  entityId?: string;
  /** Alias normalizado (texto operativo del documento importado). */
  aliasNormalized?: string;
  matchScore?: number;
  occurredAt: string;
  /** Id del evento operativo de origen (item de intake, evento de diccionario). */
  eventId: string;
}

export function fromEntityResolutionEvent(event: EntityResolutionEvent): PersistableSignal {
  const isVenue = event.entityType === "venue";
  const isClient = event.entityType === "client";
  return tenantSignal({
    companyId: event.companyId,
    domain: "intake",
    verb: event.verb,
    knowledgeKind: event.verb === "alias_confirmed" ? "fact" : "decision",
    occurredAt: event.occurredAt,
    sourceReference: buildSourceReference(["intake", event.verb, event.eventId]),
    subject: {
      venueId: isVenue ? event.entityId : undefined,
      clientId: isClient ? event.entityId : undefined,
    },
    attributes: {
      entity_type: event.entityType,
      alias_normalized: event.aliasNormalized ?? null,
      match_score: event.matchScore ?? null,
    },
    evidenceRef: event.eventId,
  });
}

/* ─────────────── 2. Service Assignments ─────────────── */

export type AssignmentVerb =
  | "recommended"
  | "selected"
  | "rejected_recommendation"
  | "replacement_required"
  | "staffed";

export interface AssignmentEvent {
  companyId: string;
  verb: AssignmentVerb;
  personId: string;
  shiftId: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  role?: string;
  occurredAt: string;
  /** Qué había recomendado el sistema, para contrastar después. */
  recommendedPersonId?: string;
}

export function fromAssignmentEvent(event: AssignmentEvent): PersistableSignal {
  return tenantSignal({
    companyId: event.companyId,
    domain: "assignment",
    verb: event.verb,
    knowledgeKind: event.verb === "recommended" ? "observation" : "decision",
    occurredAt: event.occurredAt,
    sourceReference: buildSourceReference([
      "assignment",
      event.verb,
      event.shiftId,
      event.personId,
    ]),
    subject: {
      personId: event.personId,
      venueId: event.venueId,
      clientId: event.clientId,
      serviceType: event.serviceType,
      role: event.role,
    },
    attributes: {
      shift_id: event.shiftId,
      recommended_person_id: event.recommendedPersonId ?? null,
      followed_recommendation:
        event.recommendedPersonId != null ? event.recommendedPersonId === event.personId : null,
    },
    evidenceRef: event.shiftId,
  });
}

/* ─────────────── 3. Worker Response / Outcome ─────────────── */

export type WorkerResponseVerb = "accepted" | "rejected" | "cancelled_by_worker";

export interface WorkerResponseEvent {
  companyId: string;
  personId: string;
  shiftId: string;
  verb: WorkerResponseVerb;
  venueId?: string;
  serviceType?: string;
  occurredAt: string;
}

export function fromWorkerResponse(event: WorkerResponseEvent): PersistableSignal {
  return tenantSignal({
    companyId: event.companyId,
    domain: "response",
    verb: event.verb,
    knowledgeKind: "outcome",
    occurredAt: event.occurredAt,
    sourceReference: buildSourceReference(["response", event.shiftId, event.personId]),
    subject: {
      personId: event.personId,
      venueId: event.venueId,
      serviceType: event.serviceType,
    },
    attributes: { shift_id: event.shiftId },
    evidenceRef: event.shiftId,
  });
}

export type AttendanceOutcomeVerb =
  | "worked"
  | "no_show"
  | "service_completed"
  | "rated_positive"
  | "rated_negative";

export interface AttendanceOutcomeEvent {
  companyId: string;
  personId: string;
  shiftId: string;
  verb: AttendanceOutcomeVerb;
  venueId?: string;
  serviceType?: string;
  occurredAt: string;
  /**
   * Origen del dato. Debe ser un hecho real (clock event, time entry, rating).
   * `scheduled_*` se rechaza: las horas programadas no son trabajo realizado.
   */
  evidenceSource: string;
}

export class InvalidWorkOutcomeError extends Error {}

export function fromAttendanceOutcome(event: AttendanceOutcomeEvent): PersistableSignal {
  if (!isValidWorkOutcome(event.evidenceSource)) {
    throw new InvalidWorkOutcomeError(
      "Las horas programadas no son un resultado de trabajo realizado.",
    );
  }
  return tenantSignal({
    companyId: event.companyId,
    domain: event.verb.startsWith("rated") ? "rating" : "attendance",
    verb: event.verb,
    knowledgeKind: "outcome",
    occurredAt: event.occurredAt,
    sourceReference: buildSourceReference([
      "outcome",
      event.verb,
      event.shiftId,
      event.personId,
    ]),
    subject: {
      personId: event.personId,
      venueId: event.venueId,
      serviceType: event.serviceType,
    },
    attributes: { shift_id: event.shiftId, evidence_source: event.evidenceSource },
    evidenceRef: event.shiftId,
  });
}
