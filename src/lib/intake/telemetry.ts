/**
 * Smart Service Intake — telemetría del carril canónico (Fase 2).
 *
 * Registra el COMPORTAMIENTO del intake, no el contenido. Del texto original
 * sólo se guardan longitud y un hash corto; jamás el mensaje completo ni
 * datos personales.
 *
 * Módulo PURO: construye el evento. La persistencia (si algún día se
 * necesita) es responsabilidad del llamador.
 */

import type { ServiceCandidate, IntakeSource } from "./candidate";

export interface IntakeTelemetryEvent {
  batchId: string | null;
  companyId: string;
  source: IntakeSource;
  candidateCount: number;
  confirmedCount: number;
  excludedCount: number;
  duplicateCount: number;
  exactDuplicateCount: number;
  venueResolutions: number;
  venueConfirmationsPending: number;
  humanCorrections: number;
  extractionFailures: number;
  /** Distribución de confianza media por candidato. */
  confidenceDistribution: { high: number; medium: number; low: number };
  /** Metadatos no sensibles de la fuente. */
  sourceLength: number;
  sourceFingerprint: string;
  createdAt: string;
}

/** Hash corto, no reversible a efectos prácticos, para correlacionar reintentos. */
export function fingerprintText(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = (h1 ^ text.charCodeAt(i)) >>> 0;
    h1 = (h1 * 16777619) >>> 0;
    h2 = (h2 + h1 * (i + 1)) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`.slice(0, 16);
}

function averageConfidence(c: ServiceCandidate): number {
  const values = Object.values(c.confidenceByField ?? {});
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface BuildTelemetryInput {
  batchId: string | null;
  companyId: string;
  source: IntakeSource;
  candidates: ServiceCandidate[];
  /** Nº de ediciones/confirmaciones hechas por el humano en la bandeja. */
  humanCorrections?: number;
  extractionFailures?: number;
  sourceText?: string;
}

export function buildIntakeTelemetry(input: BuildTelemetryInput): IntakeTelemetryEvent {
  const dist = { high: 0, medium: 0, low: 0 };
  for (const c of input.candidates) {
    const avg = averageConfidence(c);
    if (avg >= 0.85) dist.high += 1;
    else if (avg >= 0.6) dist.medium += 1;
    else dist.low += 1;
  }

  const text = input.sourceText ?? "";
  return {
    batchId: input.batchId,
    companyId: input.companyId,
    source: input.source,
    candidateCount: input.candidates.length,
    confirmedCount: input.candidates.filter((c) => c.createdShiftId).length,
    excludedCount: input.candidates.filter((c) => c.reviewStatus === "excluded").length,
    duplicateCount: input.candidates.filter((c) => c.duplicateStatus !== "no_match").length,
    exactDuplicateCount: input.candidates.filter((c) => c.duplicateStatus === "exact_duplicate")
      .length,
    venueResolutions: input.candidates.filter(
      (c) => c.venueCandidate.resolvedId || c.locationCandidate.resolvedId,
    ).length,
    venueConfirmationsPending: input.candidates.filter(
      (c) => c.venueCandidate.requiresConfirmation,
    ).length,
    humanCorrections: input.humanCorrections ?? 0,
    extractionFailures: input.extractionFailures ?? 0,
    confidenceDistribution: dist,
    sourceLength: text.length,
    sourceFingerprint: text ? fingerprintText(text) : "",
    createdAt: new Date().toISOString(),
  };
}

/** Log estructurado sin contenido sensible. */
export function logIntakeTelemetry(event: IntakeTelemetryEvent): void {
  console.info("[intake][telemetry]", event);
}
