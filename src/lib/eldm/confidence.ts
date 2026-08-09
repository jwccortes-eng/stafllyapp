/**
 * ELDM — confidence.ts
 * Confianza explicable y auditable. Sin cajas negras.
 */
import type { ConfidenceEnvelope, EcosystemSignal, SignalDomain } from "./types";

/** Semivida del recuerdo: la evidencia vieja pesa menos, no desaparece. */
export const HALF_LIFE_DAYS = 120;

/** Evidencia mínima para que una inferencia sea utilizable en una recomendación. */
export const MIN_EVIDENCE_FOR_INFERENCE = 3;

/** Umbral a partir del cual una inferencia puede mostrarse como patrón fuerte. */
export const STRONG_CONFIDENCE = 0.7;

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return ms / 86_400_000;
}

/** Peso temporal de una evidencia: 1 hoy, 0.5 a una semivida. */
export function recencyWeight(occurredAt: string, now: string): number {
  const d = daysBetween(occurredAt, now);
  if (!Number.isFinite(d)) return 0;
  return Math.pow(0.5, d / HALF_LIFE_DAYS);
}

export interface ConfidenceInput {
  supporting: EcosystemSignal[];
  contradicting: EcosystemSignal[];
  tenantScope: ConfidenceEnvelope["tenantScope"];
  now: string;
}

/**
 * Confianza = evidencia a favor ponderada por recencia contra la evidencia
 * total, amortiguada por un prior que exige volumen mínimo.
 * Siempre reproducible a mano a partir de los conteos que devuelve.
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceEnvelope {
  const { supporting, contradicting, now } = input;
  const pro = supporting.reduce((s, x) => s + recencyWeight(x.occurredAt, now), 0);
  const con = contradicting.reduce((s, x) => s + recencyWeight(x.occurredAt, now), 0);
  const total = pro + con;

  // Prior Laplace: sin volumen, la confianza no despega aunque no haya contradicción.
  const raw = total === 0 ? 0 : (pro + 1) / (total + 2);
  const volume = Math.min(1, supporting.length / MIN_EVIDENCE_FOR_INFERENCE);
  const confidence = Number((raw * volume).toFixed(4));

  const all = [...supporting, ...contradicting];
  const lastObservedAt =
    all.length === 0
      ? null
      : all
          .map((s) => s.occurredAt)
          .sort()
          .at(-1)!;

  const sourceDomains = Array.from(new Set(all.map((s) => s.domain))) as SignalDomain[];

  return {
    evidenceCount: supporting.length,
    contradictingEvidence: contradicting.length,
    confidence,
    lastObservedAt,
    sourceDomains: sourceDomains.sort(),
    tenantScope: input.tenantScope,
  };
}

/** ¿La inferencia puede usarse para recomendar? Nunca por confianza sola. */
export function isUsableInference(c: ConfidenceEnvelope): boolean {
  return c.evidenceCount >= MIN_EVIDENCE_FOR_INFERENCE && c.confidence >= 0.5;
}
