/**
 * Smart Service Intake — resolución de cliente / venue / dirección (Fase 1).
 *
 * Reutiliza la normalización existente (`normalizeName` de employee-matcher)
 * y trabaja sobre catálogos ya cargados (clients, billing_clients, locations_v2).
 *
 * REGLAS DURAS:
 *  - Nunca crea cliente ni venue automáticamente.
 *  - Un match no exacto se muestra como "Posible coincidencia" y exige
 *    confirmación humana antes de crear el draft.
 *
 * Módulo PURO: recibe catálogos, no consulta la base de datos.
 */

import { normalizeName } from "@/lib/employee-matcher";
import type { CandidateRef } from "./candidate";
import { emptyRef } from "./candidate";

export interface CatalogEntry {
  id: string;
  name: string;
  /** Alias conocidos ya registrados (opcional). */
  aliases?: string[];
}

/** Normaliza para comparación de nombres comerciales. */
export function normalizeEntityName(raw: string | null | undefined): string {
  const base = normalizeName(raw ?? "");
  return base
    .replace(/\b(the|el|la|los|las)\b/g, " ")
    .replace(/\b(hall|banquet|banquets|venue|center|centre|ballroom|llc|inc|corp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de Levenshtein acotada — suficiente para nombres cortos. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** Similitud 0..1 tolerante a typos ("Millenium" vs "Millennium"). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  const lev = 1 - levenshtein(a, b) / max;
  // Contención: "millennium" ⊂ "millennium hall"
  const contains = a.includes(b) || b.includes(a) ? 0.92 : 0;
  return Math.max(lev, contains);
}

export interface ResolveOptions {
  /** Por encima de esto se considera coincidencia fuerte (aún confirmable). */
  strongThreshold?: number;
  /** Por debajo de esto no se sugiere nada. */
  minThreshold?: number;
}

/**
 * Resuelve un texto libre contra un catálogo.
 * - match normalizado idéntico → resolvedId (no requiere confirmación)
 * - match fuerte o débil       → suggestedId + requiresConfirmation
 * - sin match                  → raw sin sugerencia (requiere confirmación
 *   sólo si el llamador lo marca obligatorio)
 */
export function resolveEntity(
  raw: string | null | undefined,
  catalog: CatalogEntry[],
  options: ResolveOptions = {},
): CandidateRef {
  const strong = options.strongThreshold ?? 0.86;
  const min = options.minThreshold ?? 0.68;
  const text = (raw ?? "").trim();
  if (!text) return emptyRef("");

  const needle = normalizeEntityName(text);
  if (!needle) return emptyRef(text);

  let best: { entry: CatalogEntry; score: number } | null = null;
  let exactCount = 0;
  let exactEntry: CatalogEntry | null = null;

  for (const entry of catalog) {
    const names = [entry.name, ...(entry.aliases ?? [])];
    let score = 0;
    for (const n of names) {
      const cand = normalizeEntityName(n);
      if (!cand) continue;
      if (cand === needle) {
        score = 1;
        break;
      }
      score = Math.max(score, similarity(needle, cand));
    }
    if (score === 1) {
      exactCount += 1;
      exactEntry = entry;
    }
    if (!best || score > best.score) best = { entry, score };
  }

  // Exacto y único → puede resolverse sin confirmación.
  if (exactCount === 1 && exactEntry) {
    return {
      raw: text,
      resolvedId: exactEntry.id,
      suggestedId: exactEntry.id,
      suggestedLabel: exactEntry.name,
      confidence: 1,
      requiresConfirmation: false,
    };
  }

  if (best && best.score >= min) {
    return {
      raw: text,
      resolvedId: null,
      suggestedId: best.entry.id,
      suggestedLabel: best.entry.name,
      confidence: Number(best.score.toFixed(3)),
      // Ambiguo (varios exactos) o parcial → siempre confirmación humana.
      requiresConfirmation: true,
    };
  }

  return {
    raw: text,
    resolvedId: null,
    suggestedId: null,
    suggestedLabel: null,
    confidence: best ? Number(best.score.toFixed(3)) : 0,
    requiresConfirmation: false,
  };
}

/** Confirmación humana explícita de una sugerencia. */
export function confirmRef(ref: CandidateRef, entityId: string, label?: string): CandidateRef {
  return {
    ...ref,
    resolvedId: entityId,
    suggestedId: entityId,
    suggestedLabel: label ?? ref.suggestedLabel,
    requiresConfirmation: false,
  };
}

/** Rechazo humano de la sugerencia (se queda como texto libre). */
export function rejectRef(ref: CandidateRef): CandidateRef {
  return {
    ...ref,
    resolvedId: null,
    suggestedId: null,
    suggestedLabel: null,
    requiresConfirmation: false,
  };
}
