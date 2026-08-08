/**
 * Smart Service Intake — contrato común de extracción (Fase 1, SOLO INTERFAZ).
 *
 * No implementa extractores. Define el contrato que consumirán después los
 * canales de texto, imagen, PDF y audio, siguiendo el patrón suggestion-only
 * ya usado en `document-intake-extract`:
 *
 *   - el extractor NUNCA escribe en `scheduled_shifts`;
 *   - devuelve candidatos con confianza por campo;
 *   - un humano revisa antes de crear cualquier fila de negocio.
 *
 * NOTA DE FRONTERA: este contrato es de NEGOCIO (servicios). El schema de
 * `document-intake-extract` es de IDENTIDAD (documentos de personas). Se
 * comparte infraestructura (gateway, tool-calling, confidence, logging),
 * NO el contrato semántico. No se fusionan.
 */

import type { IntakeSource, ServiceCandidate } from "./candidate";

/** Entrada cruda hacia un extractor. Nunca contiene company_id inferido. */
export interface ExtractionRequest {
  /** SIEMPRE del contexto autenticado del llamador. */
  companyId: string;
  source: IntakeSource;
  /** `import_batches.id` al que pertenece esta extracción. */
  batchId: string;
  /** Texto plano (pasted_text, whatsapp_text, email). */
  text?: string;
  /** Archivos: data URL o URL firmada. Nunca bytes en claro en logs. */
  files?: Array<{ name: string; mimeType: string; url: string }>;
  /** Zona horaria / fecha de referencia para resolver "mañana", "el viernes". */
  referenceDate?: string;
  locale?: string;
}

export interface FieldConfidence {
  field: string;
  /** 0..1 */
  confidence: number;
  reason?: string;
}

/** Salida canónica: sugerencias, jamás hechos. */
export interface ExtractionResult {
  batchId: string;
  companyId: string;
  source: IntakeSource;
  /** Candidatos SIN persistir. La bandeja los revisa. */
  candidates: ServiceCandidate[];
  fieldConfidence: FieldConfidence[];
  /** Texto/OCR crudo conservado para trazabilidad en raw_*_import_rows. */
  rawEcho?: string;
  warnings: string[];
  model?: string;
  latencyMs?: number;
  correlationId?: string;
}

/** Todo extractor futuro (texto/imagen/pdf/audio) implementa esta interfaz. */
export interface ServiceIntakeExtractor {
  readonly id: string;
  readonly supports: IntakeSource[];
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}

/** Invariantes que cualquier extractor debe cumplir. Verificable en tests. */
export const EXTRACTION_INVARIANTS = [
  "suggestion_only_no_business_writes",
  "company_id_from_authenticated_context",
  "confidence_per_field",
  "raw_input_preserved_for_traceability",
  "no_identity_schema_reuse",
] as const;

export function assertExtractionResult(
  result: ExtractionResult,
  expectedCompanyId: string,
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  if (result.companyId !== expectedCompanyId) violations.push("company_id_mismatch");
  if (result.candidates.some((c) => c.companyId !== expectedCompanyId)) {
    violations.push("candidate_company_id_mismatch");
  }
  if (result.candidates.some((c) => c.createdShiftId)) {
    violations.push("extractor_created_business_row");
  }
  if (result.candidates.some((c) => c.reviewStatus === "created")) {
    violations.push("extractor_marked_created");
  }
  return { ok: violations.length === 0, violations };
}
