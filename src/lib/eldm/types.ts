/**
 * ELDM — Ecosystem Learning & Decision Memory
 * types.ts — vocabulario único de memoria y aprendizaje del ecosistema.
 *
 * Reglas duras:
 * - Una sola infraestructura de memoria. Nada de `worker_learning`,
 *   `venue_learning`, `intake_learning` como motores separados.
 * - Cero I/O aquí. Tipos y contratos solamente.
 * - Todo conocimiento nace con scope explícito. Sin scope no entra.
 */

/** Dominios que pueden emitir señales. Ampliable, nunca duplicable. */
export type SignalDomain =
  | "intake"
  | "passport"
  | "service"
  | "assignment"
  | "availability"
  | "response"
  | "attendance"
  | "timeclock"
  | "documents"
  | "compliance"
  | "rating"
  | "message"
  | "venue"
  | "client"
  | "payroll"
  | "admin";

/** Los seis tipos de conocimiento. No se mezclan jamás. */
export type KnowledgeKind =
  | "fact"
  | "observation"
  | "inference"
  | "confirmed_preference"
  | "decision"
  | "outcome";

/** Alcance de visibilidad. Determina qué puede cruzar fronteras. */
export type KnowledgeScope =
  /** Hecho verificable del ecosistema (p. ej. documento vigente). */
  | { level: "ecosystem"; personId?: string }
  /** Observación privada del tenant. Nunca sale de la compañía. */
  | { level: "tenant"; companyId: string }
  /** Preferencia declarada por la persona. Viaja con ella si hay consentimiento. */
  | { level: "person"; personId: string; consented: boolean }
  /** Reputación compartida publicada explícitamente. */
  | { level: "shared_reputation"; personId: string };

/** Sujeto al que se refiere el conocimiento. */
export interface KnowledgeSubject {
  personId?: string;
  companyId?: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  role?: string;
}

/** Señal cruda emitida por cualquier dominio. No es conocimiento todavía. */
export interface EcosystemSignal {
  id: string;
  domain: SignalDomain;
  /** Verbo operativo: "accepted", "rejected", "no_show", "worked", "rated"... */
  verb: string;
  subject: KnowledgeSubject;
  scope: KnowledgeScope;
  occurredAt: string; // ISO
  /** Atributos operativos no sensibles. Nunca datos personales ni de pago. */
  attributes: Record<string, string | number | boolean | null>;
  /** Referencia trazable (shift code, decision id) para auditar. */
  evidenceRef?: string;
}

/** Confianza de una inferencia. Sube con evidencia, baja con contradicción. */
export interface ConfidenceEnvelope {
  evidenceCount: number;
  contradictingEvidence: number;
  /** 0–1. Nunca es un score opaco: siempre acompaña a `explanation`. */
  confidence: number;
  lastObservedAt: string | null;
  sourceDomains: SignalDomain[];
  tenantScope: "ecosystem" | "tenant" | "person" | "shared_reputation";
}

/** Unidad de memoria. Todo lo que ELDM guarda tiene esta forma. */
export interface KnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  subject: KnowledgeSubject;
  scope: KnowledgeScope;
  /** Clave estable del patrón: "accepts:night_shift", "works_at:venue". */
  key: string;
  /** Valor legible del patrón. */
  value: string | number | boolean;
  /** Frase de negocio lista para UI. Obligatoria. */
  explanation: string;
  confidence: ConfidenceEnvelope;
  createdAt: string;
  supersededBy?: string;
}

/** Tipos de decisión que pueden pedir contexto. */
export type DecisionType =
  | "recommend_worker"
  | "resolve_entity"
  | "staffing_plan"
  | "assignment_change"
  | "document_request"
  | "client_followup";

export interface DecisionContextQuery {
  companyId: string;
  personId?: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  decisionType: DecisionType;
  /** Consentimientos vigentes de la persona; sin ellos no se cruza `person`. */
  personConsent?: boolean;
  /** Reloj inyectable para pruebas deterministas. */
  now?: string;
}

/** Una razón explicable. Nunca "AI score = 87" a secas. */
export interface DecisionReason {
  code: string;
  text: string;
  weight: number; // 0–1, aporte relativo a la recomendación
  evidenceCount: number;
  sourceDomains: SignalDomain[];
}

export interface DecisionContext {
  query: DecisionContextQuery;
  facts: KnowledgeItem[];
  confirmedPreferences: KnowledgeItem[];
  historicalPatterns: KnowledgeItem[];
  inferredPatterns: KnowledgeItem[];
  priorDecisions: KnowledgeItem[];
  relevantOutcomes: KnowledgeItem[];
  contradictingEvidence: KnowledgeItem[];
  reasons: DecisionReason[];
  /** Resumen humano del contexto. ELDM nunca decide; sólo explica. */
  explanation: string;
  /** Confianza agregada del contexto, no de la decisión. */
  confidence: number;
}
