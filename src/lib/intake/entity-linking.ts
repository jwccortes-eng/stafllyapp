/**
 * Ecosystem Intake Engine — FASE 1: modelo canónico de resolución de entidades.
 *
 * Ciclo único: DETECTAR → BUSCAR → RECOMENDAR → CONFIRMAR → VINCULAR O CREAR.
 *
 * Este módulo es la CAPA DE DECISIÓN. Es puro (cero I/O) y no crea nada:
 * sólo explica qué encontró, qué recomienda y qué exige confirmación humana.
 * La escritura vive en `assisted-creation.ts` y siempre requiere confirmación.
 *
 * REGLAS DURAS
 *  - La IA propone, la persona confirma. Nunca se vincula ni se crea solo.
 *  - Un match exacto y único puede vincularse sin fricción; todo lo demás
 *    (parcial, ambiguo, aprendido con baja confianza) exige confirmación.
 *  - Toda decisión es explicable en una frase de negocio.
 *  - Cero cross-tenant: los catálogos ya vienen filtrados por company_id.
 */

import type { CandidateRef } from "./candidate";
import {
  normalizeEntityName,
  similarity,
  type CatalogEntry,
} from "./entity-resolution";

export type IntakeEntityKind = "client" | "venue" | "contact" | "address";

export type EntityResolutionStatus =
  /** No hay texto detectado: no hay nada que resolver. */
  | "empty"
  /** Coincidencia exacta y única: se puede vincular directo. */
  | "linked"
  /** Hay una recomendación clara, pero la decide una persona. */
  | "suggested"
  /** Varias opciones compiten: jamás automático. */
  | "ambiguous"
  /** No existe nada parecido en el catálogo del tenant. */
  | "unknown";

export interface EntityResolutionOption {
  id: string;
  label: string;
  /** 0..1 */
  score: number;
  /** Explicación corta y humana de por qué aparece. */
  reason: string;
}

export interface EntityResolutionDecision {
  kind: IntakeEntityKind;
  /** Texto tal como llegó de la fuente. */
  raw: string;
  status: EntityResolutionStatus;
  /** Máximo 3 recomendaciones, ordenadas por score. */
  options: EntityResolutionOption[];
  best: EntityResolutionOption | null;
  /** true cuando la persona debe decidir antes de crear el servicio. */
  requiresHumanConfirmation: boolean;
  /** Se puede ofrecer "crear nuevo" con este texto. */
  canCreateNew: boolean;
  /** Frase única que la UI muestra tal cual. */
  explanation: string;
}

export const KIND_LABEL: Record<IntakeEntityKind, string> = {
  client: "cliente",
  venue: "lugar",
  contact: "contacto",
  address: "dirección",
};

export interface BuildResolutionOptions {
  /** Score mínimo para recomendar. */
  minScore?: number;
  /** Score a partir del cual la recomendación es fuerte. */
  strongScore?: number;
  /** Diferencia máxima entre dos opciones para considerarlas empatadas. */
  ambiguityWindow?: number;
  /** Máximo de recomendaciones mostradas. */
  maxOptions?: number;
}

const DEFAULTS: Required<BuildResolutionOptions> = {
  minScore: 0.68,
  strongScore: 0.86,
  ambiguityWindow: 0.04,
  maxOptions: 3,
};

function reasonFor(score: number): string {
  if (score >= 0.999) return "Coincide exactamente con el catálogo";
  if (score >= 0.86) return "Nombre casi idéntico";
  if (score >= 0.75) return "Nombre parecido";
  return "Coincidencia parcial";
}

/** Busca el texto detectado en el catálogo del tenant y ordena candidatos. */
export function rankCatalogMatches(
  raw: string | null | undefined,
  catalog: CatalogEntry[],
  options: BuildResolutionOptions = {},
): EntityResolutionOption[] {
  const cfg = { ...DEFAULTS, ...options };
  const needle = normalizeEntityName(raw ?? "");
  if (!needle) return [];

  const scored: EntityResolutionOption[] = [];
  for (const entry of catalog) {
    const names = [entry.name, ...(entry.aliases ?? [])];
    let score = 0;
    for (const n of names) {
      const cand = normalizeEntityName(n);
      if (!cand) continue;
      score = Math.max(score, cand === needle ? 1 : similarity(needle, cand));
      if (score === 1) break;
    }
    if (score >= cfg.minScore) {
      scored.push({
        id: entry.id,
        label: entry.name,
        score: Number(score.toFixed(3)),
        reason: reasonFor(score),
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, cfg.maxOptions);
}

/**
 * Decisión completa y explicable para una entidad detectada.
 * No escribe nada y no asume nada: si duda, devuelve confirmación humana.
 */
export function buildEntityResolution(
  kind: IntakeEntityKind,
  raw: string | null | undefined,
  catalog: CatalogEntry[],
  options: BuildResolutionOptions = {},
): EntityResolutionDecision {
  const cfg = { ...DEFAULTS, ...options };
  const text = (raw ?? "").trim();
  const label = KIND_LABEL[kind];

  if (!text) {
    return {
      kind,
      raw: "",
      status: "empty",
      options: [],
      best: null,
      requiresHumanConfirmation: false,
      canCreateNew: false,
      explanation: `No detectamos ${label} en la fuente.`,
    };
  }

  const ranked = rankCatalogMatches(text, catalog, cfg);
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;

  if (!best) {
    return {
      kind,
      raw: text,
      status: "unknown",
      options: [],
      best: null,
      requiresHumanConfirmation: true,
      canCreateNew: true,
      explanation: `No existe ningún ${label} parecido a “${text}” en esta empresa.`,
    };
  }

  const exactCount = ranked.filter((o) => o.score >= 0.999).length;
  const tied =
    !!second && best.score - second.score <= cfg.ambiguityWindow && best.score >= cfg.minScore;

  if (exactCount === 1 && best.score >= 0.999) {
    return {
      kind,
      raw: text,
      status: "linked",
      options: ranked,
      best,
      requiresHumanConfirmation: false,
      canCreateNew: false,
      explanation: `“${text}” coincide exactamente con el ${label} ${best.label}.`,
    };
  }

  if (exactCount > 1 || tied) {
    return {
      kind,
      raw: text,
      status: "ambiguous",
      options: ranked,
      best,
      requiresHumanConfirmation: true,
      canCreateNew: true,
      explanation: `“${text}” se parece a ${ranked.length} ${label}s distintos. Elige cuál es.`,
    };
  }

  return {
    kind,
    raw: text,
    status: "suggested",
    options: ranked,
    best,
    requiresHumanConfirmation: true,
    canCreateNew: true,
    explanation:
      best.score >= cfg.strongScore
        ? `Creemos que “${text}” es el ${label} ${best.label}. Confírmalo para vincularlo.`
        : `Posible ${label}: ${best.label}. Sólo se vincula si lo confirmas.`,
  };
}

/**
 * Decisión a partir de un `CandidateRef` ya resuelto por el carril de intake
 * (match exacto, diccionario del tenant o fuzzy). Preserva el aprendizaje:
 * una regla aprendida se muestra como vinculada, no como sugerencia nueva.
 */
export function decisionFromRef(
  kind: IntakeEntityKind,
  ref: CandidateRef,
  catalog: CatalogEntry[],
  options: BuildResolutionOptions = {},
): EntityResolutionDecision {
  const base = buildEntityResolution(kind, ref.raw, catalog, options);
  const label = KIND_LABEL[kind];

  if (ref.resolvedId && !ref.requiresConfirmation) {
    const entry = catalog.find((c) => c.id === ref.resolvedId);
    const name = entry?.name ?? ref.suggestedLabel ?? ref.raw;
    return {
      ...base,
      status: "linked",
      best: { id: ref.resolvedId, label: name, score: ref.confidence || 1, reason: "Vinculado" },
      requiresHumanConfirmation: false,
      canCreateNew: false,
      explanation:
        ref.matchOrigin === "dictionary"
          ? `Esta empresa ya aprendió que “${ref.raw}” es el ${label} ${name}.`
          : `“${ref.raw}” está vinculado al ${label} ${name}.`,
    };
  }

  return base;
}

/** ¿Falta resolver algo antes de poder crear el servicio? */
export function pendingResolutions(
  decisions: EntityResolutionDecision[],
): EntityResolutionDecision[] {
  return decisions.filter((d) => d.requiresHumanConfirmation);
}
