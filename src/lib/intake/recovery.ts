/**
 * Smart Service Intake — OPERATIONAL RECOVERY LAYER.
 *
 * Principio: la existencia de un Servicio real no depende de que un proveedor
 * de IA responda. Si la fuente contiene evidencia estructural suficiente de un
 * trabajo real, un fallo técnico externo NO puede concluir "0 servicios".
 *
 * Este módulo es PURO (cero I/O, cero supabase, cero react) y NO crea un
 * segundo pipeline: produce `ServiceCandidate[]` del mismo modelo canónico y
 * los entrega a la MISMA bandeja de revisión. Nada se escribe sin confirmación
 * humana.
 */

import {
  recomputeCandidate,
  type IntakeSource,
  type ServiceCandidate,
} from "./candidate";
import { parseTextToCandidates } from "./text-parser";

/* -------------------------------------------------------------------------
 * 1. Clasificación del fallo del proveedor (observabilidad técnica)
 *    NUNCA se convierte en memoria operativa (ELDM) de la compañía.
 * ---------------------------------------------------------------------- */

export type ProviderFailureKind =
  | "quota_or_credit"
  | "timeout"
  | "network"
  | "provider_unavailable"
  | "malformed_response"
  | "schema_validation"
  | "unknown";

export interface ProviderFailureInput {
  code?: string | null;
  status?: number | null;
  message?: string | null;
}

export function classifyProviderFailure(input: ProviderFailureInput): ProviderFailureKind {
  const code = String(input.code ?? "").toLowerCase();
  const msg = String(input.message ?? "").toLowerCase();
  const status = Number(input.status ?? 0);
  const hay = `${code} ${msg}`;

  if (/credit|quota|payment|billing|rate.?limit|too many/.test(hay) || status === 402 || status === 403 || status === 429) {
    return "quota_or_credit";
  }
  if (/timeout|timed out|deadline|aborted/.test(hay) || status === 408 || status === 504) return "timeout";
  if (/network|fetch failed|econn|dns|socket|download_failed/.test(hay)) return "network";
  if (/unavailable|bad gateway|overloaded|service_unavailable/.test(hay) || status === 502 || status === 503) {
    return "provider_unavailable";
  }
  if (/schema|invalid_value|json_schema|additionalproperties/.test(hay) || status === 400) return "schema_validation";
  if (/unparseable|malformed|parse|no_output/.test(hay)) return "malformed_response";
  return "unknown";
}

/** Copy humano por tipo de fallo. Nunca códigos técnicos en la UX principal. */
export function describeProviderFailure(kind: ProviderFailureKind): string {
  switch (kind) {
    case "quota_or_credit":
      return "El análisis automático no estuvo disponible en este momento.";
    case "timeout":
      return "El análisis automático tardó demasiado y se interrumpió.";
    case "network":
      return "Se cortó la conexión con el análisis automático.";
    case "provider_unavailable":
      return "El análisis automático no está respondiendo ahora mismo.";
    case "malformed_response":
    case "schema_validation":
      return "El análisis automático devolvió una respuesta incompleta.";
    default:
      return "El análisis automático no pudo completarse.";
  }
}

/* -------------------------------------------------------------------------
 * 2. Evidencia estructural (determinista y explicable)
 * ---------------------------------------------------------------------- */

export type EvidenceSignal =
  | "date"
  | "weekday"
  | "start_time"
  | "end_time"
  | "time_range"
  | "job_or_title"
  | "address"
  | "users"
  | "recurrence"
  | "shift_details_header"
  | "schedule_structure";

export interface StructuralEvidence {
  signals: EvidenceSignal[];
  /** Fragmento exacto que activó cada señal (explicabilidad, sin inventar). */
  matches: Partial<Record<EvidenceSignal, string>>;
  /** ¿La fuente representa al menos un trabajo/servicio? */
  hasMinimumServiceEvidence: boolean;
  /** Razón legible del veredicto. */
  reason: string;
}

const SIGNAL_PATTERNS: Array<{ signal: EvidenceSignal; re: RegExp }> = [
  {
    signal: "date",
    re: /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic)[a-z]*\.?\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}\s+de\s+[a-záéíóú]+)\b/i,
  },
  {
    signal: "weekday",
    re: /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i,
  },
  { signal: "start_time", re: /\b(start|inicio|comienza|desde)\b[^\n]{0,20}\d{1,2}[:.]?\d{0,2}\s*(am|pm|h)?/i },
  { signal: "end_time", re: /\b(end|fin|termina|hasta)\b[^\n]{0,20}\d{1,2}[:.]?\d{0,2}\s*(am|pm|h)?/i },
  {
    signal: "time_range",
    re: /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|a|to|hasta)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,
  },
  { signal: "job_or_title", re: /\b(job|shift title|shift|servicio|evento|event|puesto|title)\b\s*[:#-]?/i },
  {
    signal: "address",
    re: /\b(address|direcci[oó]n|ave|avenue|st\.?|street|road|rd\.?|blvd|calle|carrera|#\s*\d+|\d{1,5}\s+[A-Za-zÁÉÍÓÚñ][\w.]*\s+(ave|avenue|st|street|road|rd|blvd))\b/i,
  },
  { signal: "users", re: /\b(users?|workers?|staff|meseros?|personal|empleados?|assigned)\b/i },
  {
    signal: "recurrence",
    re: /\b((every|each|cada)\s+[a-záéíóúñ]+(\s+(for|por|durante)\s+\d{1,3}\s*(times|veces|x)?)?|repeats?|recurrence|recurrencia)\b/i,
  },
  { signal: "shift_details_header", re: /\b(shift details|detalles del turno|shift info|turno)\b/i },
  { signal: "schedule_structure", re: /\b(schedule|agenda|calendar|calendario|horario|roster)\b/i },
];

/**
 * MINIMUM SERVICE EVIDENCE — contrato canónico.
 *
 * Basta con una de estas combinaciones:
 *  - fecha (o día) + horario (start/end/rango)
 *  - fecha (o día) + job / título de turno
 *  - fecha (o día) + dirección + estructura de turno
 *  - encabezado "Shift details" + fecha (o día)
 *  - estructura de calendario/agenda + fecha (o día) + cualquier bloque de evento
 */
export function detectStructuralEvidence(...texts: Array<string | null | undefined>): StructuralEvidence {
  const text = texts.filter(Boolean).join("\n").trim();
  const signals: EvidenceSignal[] = [];
  const matches: StructuralEvidence["matches"] = {};

  if (text) {
    for (const { signal, re } of SIGNAL_PATTERNS) {
      const m = re.exec(text);
      if (m) {
        signals.push(signal);
        matches[signal] = m[0].trim();
      }
    }
  }

  const has = (s: EvidenceSignal) => signals.includes(s);
  const hasDay = has("date") || has("weekday");
  const hasSchedule = has("start_time") || has("end_time") || has("time_range");
  const hasStructure = has("shift_details_header") || has("schedule_structure") || has("users");

  let ok = false;
  let reason = "No hay señales de fecha ni de turno en la fuente.";
  if (hasDay && hasSchedule) {
    ok = true;
    reason = "Hay fecha y horario visibles.";
  } else if (hasDay && has("job_or_title")) {
    ok = true;
    reason = "Hay fecha y un trabajo/servicio identificado.";
  } else if (hasDay && has("address") && hasStructure) {
    ok = true;
    reason = "Hay fecha, dirección y estructura de turno.";
  } else if (hasDay && has("shift_details_header")) {
    ok = true;
    reason = "Hay un encabezado de turno con fecha.";
  } else if (hasDay && has("schedule_structure")) {
    ok = true;
    reason = "Hay una estructura de calendario con fecha.";
  } else if (hasDay) {
    reason = "Hay una fecha, pero no hay horario, trabajo ni estructura de turno.";
  }

  return { signals, matches, hasMinimumServiceEvidence: ok, reason };
}

/* -------------------------------------------------------------------------
 * 3. Los tres resultados posibles del análisis
 * ---------------------------------------------------------------------- */

export type IntakeAnalysisOutcome =
  | "ANALYSIS_SUCCESS"
  | "NO_SERVICE_EVIDENCE"
  | "TECHNICAL_FAILURE_WITH_EVIDENCE"
  | "TECHNICAL_FAILURE_NO_EVIDENCE";

export interface AnalysisOutcomeInput {
  candidateCount: number;
  /** ¿Algún archivo/página falló técnicamente? */
  technicalFailure: boolean;
  evidence?: StructuralEvidence | null;
}

export function classifyAnalysisOutcome(input: AnalysisOutcomeInput): IntakeAnalysisOutcome {
  if (input.candidateCount > 0) return "ANALYSIS_SUCCESS";
  if (!input.technicalFailure) return "NO_SERVICE_EVIDENCE";
  return input.evidence?.hasMinimumServiceEvidence
    ? "TECHNICAL_FAILURE_WITH_EVIDENCE"
    : "TECHNICAL_FAILURE_NO_EVIDENCE";
}

export interface OutcomeCopy {
  title: string;
  fact: string;
  consequence: string;
  tone: "info" | "warning" | "error";
}

export function describeOutcome(
  outcome: IntakeAnalysisOutcome,
  ctx: { candidateCount?: number; failureKind?: ProviderFailureKind } = {},
): OutcomeCopy {
  const failure = describeProviderFailure(ctx.failureKind ?? "unknown");
  switch (outcome) {
    case "ANALYSIS_SUCCESS":
      return {
        title: `${ctx.candidateCount ?? 0} servicios detectados`,
        fact: "El análisis terminó.",
        consequence: "Revisa y confirma: nada se crea sin tu aprobación.",
        tone: "info",
      };
    case "NO_SERVICE_EVIDENCE":
      return {
        title: "No encontramos servicios",
        fact: "La fuente no muestra fechas ni bloques de trabajo que podamos leer.",
        consequence: "No se creó nada. Prueba con una imagen más nítida o pega el texto.",
        tone: "warning",
      };
    case "TECHNICAL_FAILURE_WITH_EVIDENCE":
      return {
        title: "Tuve un problema con el análisis automático, pero encontré información suficiente para continuar",
        fact: failure,
        consequence: "Revisa lo encontrado y confirma. No se creó nada todavía.",
        tone: "warning",
      };
    default:
      return {
        title: "No pudimos completar el análisis",
        fact: failure,
        consequence: "No se creó nada. Puedes reintentar o escribir los datos del turno.",
        tone: "error",
      };
  }
}

/* -------------------------------------------------------------------------
 * 4. Origen y estado de cada campo recuperado
 * ---------------------------------------------------------------------- */

export type FieldState = "confirmed" | "detected" | "approximate" | "missing";
export type FieldSource = "ai_extraction" | "structural_recovery" | "human";

export interface RecoveredFieldMeta {
  state: FieldState;
  source: FieldSource;
}

export type RecoveryFieldMap = Record<string, RecoveredFieldMeta>;

const RECOVERY_FIELDS = ["service_date", "start_time", "end_time", "venue", "client", "location", "workers"] as const;

export function buildRecoveryFieldMap(c: ServiceCandidate): RecoveryFieldMap {
  const detected = (v: unknown): RecoveredFieldMeta => ({
    state: v === null || v === undefined || v === "" ? "missing" : "detected",
    source: v === null || v === undefined || v === "" ? "structural_recovery" : "structural_recovery",
  });
  const map: RecoveryFieldMap = {};
  const values: Record<(typeof RECOVERY_FIELDS)[number], unknown> = {
    service_date: c.serviceDate,
    start_time: c.startTime,
    end_time: c.endTime,
    venue: c.venueCandidate.raw || null,
    client: c.clientCandidate.raw || null,
    location: c.locationCandidate.raw || null,
    workers: c.requestedWorkers,
  };
  for (const f of RECOVERY_FIELDS) map[f] = detected(values[f]);
  // Una hora aproximada se declara aproximada, nunca confirmada.
  if (/aprox/i.test(c.notes ?? "") && c.startTime) {
    map.start_time = { state: "approximate", source: "structural_recovery" };
  }
  return map;
}

/* -------------------------------------------------------------------------
 * 5. Resultado de recuperación
 * ---------------------------------------------------------------------- */

export interface RecoveryInput {
  /** Texto seguro disponible (respuesta parcial del modelo, texto pegado por la persona). */
  text: string;
  companyId: string;
  batchId?: string | null;
  source: IntakeSource;
  referenceDate: string;
  sourceReference?: string;
  failureKind?: ProviderFailureKind;
}

export interface RecoveryResult {
  outcome: IntakeAnalysisOutcome;
  evidence: StructuralEvidence;
  candidates: ServiceCandidate[];
  fieldMeta: Record<string, RecoveryFieldMap>;
  /** Recurrencia detectada literal, sin expandir fechas. */
  recurrence: { raw: string; times: number | null } | null;
  notices: string[];
  failureKind: ProviderFailureKind;
}

/** Recurrencia literal: se conserva la señal, jamás se derivan fechas solas. */
export function detectRecurrenceSignal(text: string): { raw: string; times: number | null } | null {
  const m =
    /((?:every|each|cada)\s+[a-záéíóúñ]+(?:\s+(?:for|por|durante)\s+(\d{1,3})\s*(?:times|veces|x)?)?)/i.exec(text) ??
    /(repeats?\s+[^.,\n]{0,40})/i.exec(text);
  if (!m) return null;
  const times = m[2] ? Number(m[2]) : null;
  return { raw: m[1].trim(), times: Number.isFinite(times as number) ? times : null };
}

/**

 * Normaliza texto con forma de captura (etiquetas en líneas sueltas) al formato
 * de una línea por servicio que el parser canónico ya entiende.
 * No agrega información: sólo reordena lo que la fuente ya dice.
 */
export function normalizeStructuralText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // Encabezados y ruido de UI que no describen el trabajo.
    .filter((l) => !/^(shift details|detalles del turno|shift info|schedule|agenda)\s*:?$/i.test(l))
    .filter((l) => !/^(recurrence|recurrencia)\b/i.test(l));

  let start: string | null = null;
  let end: string | null = null;
  const rest: string[] = [];

  for (const line of lines) {
    const s = /^(start|inicio|desde)\b\s*:?\s*(.+)$/i.exec(line);
    if (s) {
      start = s[2].trim();
      continue;
    }
    const e = /^(end|fin|hasta)\b\s*:?\s*(.+)$/i.exec(line);
    if (e) {
      end = e[2].trim();
      continue;
    }
    rest.push(
      line
        // "Monday, Aug 10, 2026" → "Aug 10, 2026": el weekday suelto confunde al parser.
        .replace(
          /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*,\s*|^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*,\s*/i,
          "",
        )
        // Etiquetas de campo: el valor es lo que importa.
        .replace(/^(job|shift title|title|address|direcci[oó]n|users?|personal)\s*:\s*/i, ""),
    );
  }

  const schedule = start && end ? `${start} - ${end}` : start ?? end ?? "";
  const joined = [...rest, schedule].filter(Boolean).join(" · ").trim();
  return joined || text;
}

/**
 * Convierte evidencia estructural en candidatos revisables usando el parser
 * canónico ya existente. No hay OCR nuevo, ni segundo LLM, ni segundo modelo.
 */
export function runStructuralRecovery(input: RecoveryInput): RecoveryResult {
  const failureKind = input.failureKind ?? "unknown";
  const evidence = detectStructuralEvidence(input.text);
  const notices: string[] = [];
  const recurrence = detectRecurrenceSignal(input.text);

  if (!evidence.hasMinimumServiceEvidence) {
    return {
      outcome: classifyAnalysisOutcome({ candidateCount: 0, technicalFailure: true, evidence }),
      evidence,
      candidates: [],
      fieldMeta: {},
      recurrence,
      notices: [evidence.reason],
      failureKind,
    };
  }

  const parsed = parseTextToCandidates(normalizeStructuralText(input.text), {

    companyId: input.companyId, // SIEMPRE del contexto autenticado
    batchId: input.batchId ?? null,
    source: input.source,
    referenceDate: input.referenceDate,
  });

  const candidates = parsed.candidates.map((c) =>
    recomputeCandidate({
      ...c,
      companyId: input.companyId,
      sourceReference: input.sourceReference || c.sourceReference || "recuperación estructural",
      reviewStatus: "needs_input",
    }),
  );

  const fieldMeta: Record<string, RecoveryFieldMap> = {};
  for (const c of candidates) fieldMeta[c.id] = buildRecoveryFieldMap(c);

  notices.push(evidence.reason);
  if (recurrence) {
    notices.push(
      `La fuente indica recurrencia ("${recurrence.raw}")${
        recurrence.times ? `: ${recurrence.times} ocurrencias` : ""
      }. Se conserva como dato detectado; las fechas se confirman contigo.`,
    );
  }
  if (candidates.length === 0) {
    notices.push("Hay señales de un turno, pero no pudimos separar los campos. Revísalo a mano.");
  }

  return {
    outcome:
      candidates.length > 0
        ? "TECHNICAL_FAILURE_WITH_EVIDENCE"
        : classifyAnalysisOutcome({ candidateCount: 0, technicalFailure: true, evidence }),
    evidence,
    candidates,
    fieldMeta,
    recurrence,
    notices,
    failureKind,
  };
}

/* -------------------------------------------------------------------------
 * 6. Reconciliación tras un reintento
 *    Prioridad: humano > coincidencia canónica > evidencia recuperada > IA nueva
 * ---------------------------------------------------------------------- */

export type ReconcilePriority = "human" | "canonical" | "recovered" | "ai";

export interface ReconcileConflict {
  candidateId: string;
  field: string;
  kept: string | null;
  discarded: string | null;
  reason: string;
}

export interface ReconcileResult {
  candidates: ServiceCandidate[];
  conflicts: ReconcileConflict[];
  /** Candidatos nuevos del reintento que no existían antes. */
  added: number;
}

function matchKey(c: ServiceCandidate): string {
  return [c.serviceDate ?? "", (c.venueCandidate.raw || c.clientCandidate.raw || "").toLowerCase().trim()].join("|");
}

/**
 * Fusiona el resultado de un reintento de IA con lo que ya está en la bandeja.
 * Nunca sobrescribe una corrección humana (campo tocado por la persona,
 * `resolvedId` confirmado o `reviewStatus === 'accepted'`).
 */
export function reconcileAfterRetry(
  current: ServiceCandidate[],
  incoming: ServiceCandidate[],
  humanEditedIds: Set<string> = new Set(),
): ReconcileResult {
  const conflicts: ReconcileConflict[] = [];
  const byKey = new Map<string, ServiceCandidate>();
  for (const c of current) byKey.set(matchKey(c), c);

  const merged: ServiceCandidate[] = [...current];
  let added = 0;

  for (const inc of incoming) {
    const key = matchKey(inc);
    const existing = byKey.get(key);
    if (!existing) {
      // Idempotencia: un reintento no duplica lo que ya está en la bandeja.
      merged.push(inc);
      byKey.set(key, inc);
      added += 1;
      continue;
    }

    const isHuman = humanEditedIds.has(existing.id) || existing.reviewStatus === "accepted";
    const index = merged.findIndex((c) => c.id === existing.id);
    const next = { ...existing };

    const takeIfEmpty = (field: "serviceDate" | "startTime" | "endTime") => {
      if (!existing[field] && inc[field]) (next[field] as string | null) = inc[field];
      else if (existing[field] && inc[field] && existing[field] !== inc[field]) {
        conflicts.push({
          candidateId: existing.id,
          field,
          kept: existing[field],
          discarded: inc[field],
          reason: isHuman ? "Corrección humana: tiene prioridad." : "Evidencia previa recuperada: tiene prioridad.",
        });
      }
    };
    takeIfEmpty("serviceDate");
    takeIfEmpty("startTime");
    takeIfEmpty("endTime");

    for (const field of ["venueCandidate", "clientCandidate", "locationCandidate"] as const) {
      const cur = existing[field];
      const nu = inc[field];
      const curConfirmed = !!cur.resolvedId || isHuman;
      if (!cur.raw && nu.raw) {
        next[field] = nu;
      } else if (cur.raw && nu.raw && cur.raw.toLowerCase() !== nu.raw.toLowerCase()) {
        if (curConfirmed) {
          conflicts.push({
            candidateId: existing.id,
            field,
            kept: cur.raw,
            discarded: nu.raw,
            reason: "Corrección humana: tiene prioridad sobre la nueva sugerencia.",
          });
        } else {
          conflicts.push({
            candidateId: existing.id,
            field,
            kept: cur.raw,
            discarded: nu.raw,
            reason: "Evidencia recuperada: tiene prioridad sobre la nueva sugerencia.",
          });
        }
      }
    }

    if (!existing.requestedWorkers && inc.requestedWorkers) next.requestedWorkers = inc.requestedWorkers;
    if (index >= 0) merged[index] = recomputeCandidate(next);
  }

  return { candidates: merged, conflicts, added };
}
