/**
 * Smart Service Intake — Fase 4: normalización de la extracción de audio.
 *
 * Módulo PURO (cero I/O). No introduce un modelo nuevo: reutiliza el contrato
 * de extracción de Fases 2/3 (`RawVisualExtraction`) y la normalización
 * canónica (`normalizeVisualExtraction`), añadiendo lo único propio del audio:
 *
 *  - fechas relativas habladas ("mañana", "el martes", "la próxima semana")
 *    resueltas con el mismo resolutor de texto de Fase 2;
 *  - ambigüedad explícita: si no se puede fijar el día, queda MISSING y el
 *    candidato pide "Revisar". Nunca se adivina.
 */

import { resolveDateFromText } from "./text-parser";
import {
  normalizeVisualExtraction,
  resolveVisualDate,
  type NormalizeVisualResult,
  type RawVisualExtraction,
  type RawVisualService,
} from "./visual-extraction";
import type { IntakeSource } from "./candidate";

export interface AudioDateResolution {
  /** ISO YYYY-MM-DD o null si no se puede fijar sin adivinar. */
  iso: string | null;
  confidence: number;
  ambiguous: boolean;
  /** true cuando la fuente no dijo el año y lo dedujimos del calendario. */
  assumedYear: boolean;
}

/**
 * Resuelve la fecha dicha en voz alta. Primero intenta el resolutor de texto
 * (relativas + absolutas de Fase 2); si no reconoce nada, cae al resolutor
 * visual (fechas tipo "Oct 13" sin año).
 */
export function resolveAudioDate(
  raw: string | null | undefined,
  referenceDate: string,
): AudioDateResolution {
  const text = String(raw ?? "").trim();
  if (!text) return { iso: null, confidence: 0, ambiguous: false, assumedYear: false };

  const hit = resolveDateFromText(text, referenceDate);
  if (hit.iso) {
    return { iso: hit.iso, confidence: hit.confidence, ambiguous: false, assumedYear: false };
  }
  if (hit.ambiguous) {
    return { iso: null, confidence: 0, ambiguous: true, assumedYear: false };
  }

  const visual = resolveVisualDate(text, referenceDate);
  if (visual.date) {
    return {
      iso: visual.date,
      confidence: visual.assumedYear ? 0.7 : 0.9,
      ambiguous: false,
      assumedYear: visual.assumedYear,
    };
  }
  return { iso: null, confidence: 0, ambiguous: false, assumedYear: false };
}

export interface NormalizeAudioInput {
  extraction: RawVisualExtraction;
  companyId: string;
  batchId: string | null;
  source: IntakeSource;
  /** Hoy del sistema, YYYY-MM-DD: ancla de las fechas relativas habladas. */
  referenceDate: string;
  fileName?: string | null;
  transcript?: string | null;
  idPrefix?: string;
}

/**
 * Pre-resuelve las fechas habladas y delega en la normalización canónica.
 * El resultado es EXACTAMENTE el mismo `ServiceCandidate` que producen texto,
 * imagen y Excel: la bandeja no distingue el origen.
 */
export function normalizeAudioExtraction(input: NormalizeAudioInput): NormalizeVisualResult {
  const services = Array.isArray(input.extraction.services) ? input.extraction.services : [];
  const ambiguousBySpoken: string[] = [];
  const assumedYearSpoken: string[] = [];

  const prepared: RawVisualService[] = services.map((service) => {
    const spoken = String(service.service_date ?? "").trim();
    if (!spoken) return service;

    const resolved = resolveAudioDate(spoken, input.referenceDate);
    if (resolved.ambiguous) {
      ambiguousBySpoken.push(spoken);
      // Sin fecha fijable: el candidato queda incompleto y pide revisión.
      return {
        ...service,
        service_date: null,
        extraction_notes: [
          service.extraction_notes,
          `Se dijo “${spoken}”, que admite más de una lectura.`,
        ]
          .filter(Boolean)
          .join(" "),
        confidence: { ...(service.confidence ?? {}), date: null },
      };
    }
    if (!resolved.iso) return service;
    if (resolved.assumedYear) assumedYearSpoken.push(spoken);

    return {
      ...service,
      service_date: resolved.iso,
      extraction_notes:
        spoken.toLowerCase() === resolved.iso
          ? service.extraction_notes
          : [service.extraction_notes, `Fecha dicha: “${spoken}”.`].filter(Boolean).join(" "),
      confidence: {
        ...(service.confidence ?? {}),
        date: Math.min(
          typeof service.confidence?.date === "number" ? service.confidence.date : 1,
          resolved.confidence,
        ),
      },
    };
  });

  const result = normalizeVisualExtraction({
    extraction: { ...input.extraction, services: prepared },
    companyId: input.companyId,
    batchId: input.batchId,
    source: input.source,
    referenceDate: input.referenceDate,
    fileName: input.fileName ?? null,
    idPrefix: input.idPrefix ?? "aud",
  });

  const notices = [...result.notices];
  for (const candidate of result.candidates) {
    if (!candidate.serviceDate) {
      notices.push({
        candidateId: candidate.id,
        message: "No entendimos qué día se dijo. Elige la fecha: no la inventamos.",
      });
    }
  }
  const warnings = [...result.warnings];
  if (ambiguousBySpoken.length > 0) {
    warnings.push(
      `No pudimos fijar la fecha de ${ambiguousBySpoken.length} servicio(s): se dijo ${ambiguousBySpoken
        .map((t) => `“${t}”`)
        .join(", ")}.`,
    );
  }
  if (assumedYearSpoken.length > 0) {
    warnings.push("La nota no dijo el año en alguna fecha. Confírmalo antes de crear el borrador.");
  }

  return { ...result, notices, warnings };
}
