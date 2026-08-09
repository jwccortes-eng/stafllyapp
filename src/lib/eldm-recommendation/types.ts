/**
 * ELDM Fase 1C — Worker Recommendation Layer (contratos).
 *
 * ELDM aporta contexto. El admin decide.
 * Aquí NO hay I/O, NO hay asignación, NO hay publicación, NO hay payroll.
 *
 * Reglas duras:
 * - Los filtros duros vienen de reglas operativas canónicas (elegibilidad),
 *   nunca de patrones ni inferencias de ELDM.
 * - La salida jamás es un score opaco: es evidencia a favor, evidencia en
 *   contra, confianza (HIGH/MEDIUM/LOW) y recencia.
 * - Ningún atributo sensible (pago, documentos, salud, contacto) entra como
 *   señal de calidad.
 */
import type { ConfidenceLabel } from "@/lib/eldm-adapters/explainability";
import type { MemorySnapshot } from "@/lib/eldm";

/** Motivos canónicos de no elegibilidad. Sólo reglas operativas. */
export type IneligibilityCode =
  | "not_in_company"
  | "schedule_conflict"
  | "confirmed_unavailable"
  | "compliance_missing"
  | "compliance_expired"
  | "compliance_blocked"
  | "role_not_met"
  | "skill_not_met"
  | "access_blocked"
  | "inactive";

export interface EligibilityBlocker {
  code: IneligibilityCode;
  /** Frase de negocio, sin exponer el documento ni datos sensibles. */
  text: string;
}

/** Estado operativo de compliance. Nunca el documento en sí. */
export type ComplianceState = "current" | "missing" | "expired" | "blocked" | "unknown";

/**
 * Candidato tal como lo entrega la capa operativa canónica.
 * Nunca se inventan disponibilidad ni skills: si no hay dato, es `unknown`.
 */
export interface WorkerCandidateInput {
  personId: string;
  name: string;
  /** Rol operativo actual del worker, si se conoce. */
  role?: string | null;
  belongsToCompany: boolean;
  active: boolean;
  accessBlocked?: boolean;
  /** Conflicto horario real detectado por el motor de turnos. */
  scheduleConflict?: boolean;
  /** Disponibilidad canónica. `unknown` no descalifica. */
  availability: "available" | "unavailable" | "unknown";
  /** Estado operativo de los documentos exigidos por la compañía. */
  compliance: ComplianceState;
  /** Skills verificadas por la compañía. */
  skills?: string[];
}

export interface WorkerRecommendationQuery {
  companyId: string;
  serviceId: string;
  venueId?: string;
  clientId?: string;
  serviceType?: string;
  requiredRole?: string;
  startAt?: string;
  endAt?: string;
  requiredSkills?: string[];
  limit?: number;
  /** Reloj inyectable para pruebas deterministas. */
  now?: string;
}

export type RecommendationSortMode =
  | "best_context"
  | "venue_experience"
  | "availability"
  | "acceptance_history"
  | "recent_outcomes";

export interface RecommendationEvidence {
  code: string;
  text: string;
  evidenceCount: number;
  lastObservedAt: string | null;
}

export interface WorkerRecommendation {
  personId: string;
  name: string;
  role?: string | null;
  eligible: boolean;
  blockers: EligibilityBlocker[];
  availability: WorkerCandidateInput["availability"];
  compliance: ComplianceState;
  confidence: ConfidenceLabel;
  /** 0–1 agregado del contexto ELDM. Nunca se muestra solo. */
  contextConfidence: number;
  /** "Recomendado porque…" en lenguaje de negocio. */
  headline: string;
  supporting: RecommendationEvidence[];
  contradicting: RecommendationEvidence[];
  lastRelevantActivityAt: string | null;
  /** Contadores explicables usados para ordenar. Nada de black-box. */
  venueExperience: number;
  clientExperience: number;
  serviceTypeExperience: number;
  acceptedCount: number;
  rejectedCount: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  /** Motivo no penalizante de por qué no está arriba del listado. */
  notHighlightedReason: string | null;
}

export interface WorkerRecommendationResult {
  query: WorkerRecommendationQuery;
  sort: RecommendationSortMode;
  /** Elegibles ordenados por contexto explicable. */
  recommended: WorkerRecommendation[];
  /** Elegibles sin contexto suficiente. Visibles siempre, nunca penalizados. */
  otherEligible: WorkerRecommendation[];
  /** No elegibles por regla operativa canónica, con su motivo. */
  notEligible: WorkerRecommendation[];
  generatedAt: string;
}

/** Memoria por persona ya cargada y acotada al tenant. */
export type MemoryByPerson = Map<string, MemorySnapshot>;
