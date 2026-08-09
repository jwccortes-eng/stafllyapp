/**
 * Smart Service Intake — Fase 3: normalización de extracción visual.
 *
 * Módulo PURO (cero I/O). Convierte la respuesta del extractor visual
 * (imagen, captura, foto, PDF) en candidatos del MISMO modelo canónico de
 * Fase 1/2 (`ServiceCandidate`), más una lista de elementos no resueltos
 * que jamás se descartan en silencio.
 *
 * REGLAS DURAS:
 *  - No se inventa nada: hora, personal, cliente, dirección o roles que la
 *    fuente no soporta quedan en null y se marcan como MISSING.
 *  - El color nunca es fuente de identidad: sólo se usa para agrupar y se
 *    conserva como nota de extracción.
 *  - `companyId` viene siempre del contexto autenticado del llamador.
 */

import {
  createCandidate,
  type IntakeSource,
  type ServiceCandidate,
} from "./candidate";

/** Estados de confianza mostrados en la bandeja. */
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "MISSING";

/** Campos con confianza propia (no hay una única confianza global). */
export const CONFIDENCE_FIELDS = [
  "date",
  "venue",
  "service_type",
  "start_time",
  "end_time",
  "client",
  "workers",
  "location",
] as const;

export type ConfidenceField = (typeof CONFIDENCE_FIELDS)[number];

export function confidenceLevel(value: number | null | undefined): ConfidenceLevel {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return "MISSING";
  if (value >= 0.85) return "HIGH";
  if (value >= 0.6) return "MEDIUM";
  return "LOW";
}

/** Región visual de origen (para "revisar fuente"). */
export interface VisualRegion {
  page: number | null;
  label: string | null;
  /** Caja normalizada 0..1 si el extractor la aporta. */
  box: { x: number; y: number; width: number; height: number } | null;
}

/** Servicio propuesto tal como lo devuelve el extractor visual. */
export interface RawVisualService {
  service_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  service_type?: string | null;
  client_name?: string | null;
  venue_name?: string | null;
  location_text?: string | null;
  requested_workers?: number | null;
  roles?: string[] | null;
  notes?: string | null;
  source_excerpt?: string | null;
  page_number?: number | null;
  region_label?: string | null;
  region_box?: { x: number; y: number; width: number; height: number } | null;
  color_group?: string | null;
  extraction_notes?: string | null;
  confidence?: Partial<Record<ConfidenceField, number | null>> | null;
}

/** Elemento detectado que el extractor no pudo convertir con confianza. */
export interface RawUnresolvedElement {
  detected_text?: string | null;
  reason?: string | null;
  suggestion?: string | null;
  page_number?: number | null;
  region_label?: string | null;
}

export interface RawVisualExtraction {
  services?: RawVisualService[] | null;
  unresolved?: RawUnresolvedElement[] | null;
  page_count?: number | null;
  notes?: string | null;
}

export interface UnresolvedElement {
  id: string;
  detectedText: string;
  reason: string;
  suggestion: string | null;
  region: VisualRegion;
  fileName: string | null;
}

export interface VisualCandidateMeta {
  candidateId: string;
  region: VisualRegion;
  sourceExcerpt: string | null;
  colorGroup: string | null;
  extractionNotes: string | null;
  fileName: string | null;
  /** Confianza por campo en estados legibles. */
  levels: Record<ConfidenceField, ConfidenceLevel>;
}

export interface VisualNotice {
  candidateId: string | null;
  message: string;
}

export interface NormalizeVisualInput {
  extraction: RawVisualExtraction;
  companyId: string;
  batchId: string | null;
  source: IntakeSource;
  /** Hoy del sistema, YYYY-MM-DD. Sólo para resolver años ausentes. */
  referenceDate: string;
  fileName?: string | null;
  /** Prefijo estable de ids para que un reintento no cambie referencias. */
  idPrefix?: string;
}

export interface NormalizeVisualResult {
  candidates: ServiceCandidate[];
  meta: Record<string, VisualCandidateMeta>;
  unresolved: UnresolvedElement[];
  notices: VisualNotice[];
  warnings: string[];
  pageCount: number;
}

const TIME_RE = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PARTIAL_DATE_RE = /^(\d{1,2})[-/](\d{1,2})$/;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Resuelve una fecha sin año usando la fecha de referencia: se elige el año
 * que deja la fecha más cerca del presente (preferencia hacia adelante).
 * No inventa día ni mes: si faltan, devuelve null.
 */
export function resolveVisualDate(
  raw: string | null | undefined,
  referenceDate: string,
): { date: string | null; assumedYear: boolean } {
  const text = String(raw ?? "").trim();
  if (!text) return { date: null, assumedYear: false };

  const iso = ISO_DATE_RE.exec(text);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return isValidDate(y, m, d)
      ? { date: `${y}-${pad(m)}-${pad(d)}`, assumedYear: false }
      : { date: null, assumedYear: false };
  }

  let month: number | null = null;
  let day: number | null = null;

  const partial = PARTIAL_DATE_RE.exec(text);
  if (partial) {
    month = Number(partial[1]);
    day = Number(partial[2]);
  } else {
    const words = text.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (month === null && MONTHS[w] !== undefined) month = MONTHS[w];
      else if (day === null && /^\d{1,2}$/.test(w)) day = Number(w);
    }
  }

  if (month === null || day === null) return { date: null, assumedYear: false };

  const refYear = Number(referenceDate.slice(0, 4)) || new Date().getUTCFullYear();
  const refTime = Date.parse(`${referenceDate}T00:00:00Z`);
  let best: { date: string; delta: number } | null = null;
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    if (!isValidDate(y, month, day)) continue;
    const value = `${y}-${pad(month)}-${pad(day)}`;
    const diff = Date.parse(`${value}T00:00:00Z`) - refTime;
    // Preferencia hacia adelante: el pasado penaliza al doble.
    const delta = diff >= 0 ? diff : Math.abs(diff) * 2;
    if (!best || delta < best.delta) best = { date: value, delta };
  }
  return best ? { date: best.date, assumedYear: true } : { date: null, assumedYear: false };
}

/** Normaliza hora a HH:mm. Nunca inventa: si no es interpretable, null. */
export function normalizeVisualTime(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return null;
  if (TIME_RE.test(text)) {
    const [h, m] = text.split(":");
    return `${pad(Number(h))}:${m}`;
  }
  const ampm = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/.exec(text);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2] ?? "00";
    if (h < 1 || h > 12) return null;
    if (ampm[3] === "pm" && h !== 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return `${pad(h)}:${m}`;
  }
  return null;
}

function cleanText(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  return text ? text : null;
}

function positiveInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function conf(
  value: number | null | undefined,
  present: boolean,
): number {
  if (!present) return 0;
  if (typeof value !== "number" || Number.isNaN(value)) return 0.6;
  return Math.max(0, Math.min(1, value));
}

/**
 * Recurrencia detectada en el texto visual ("Every day for 4 times",
 * "cada día por 4 veces"). No crea ocurrencias: sólo conserva la señal.
 */
export function detectVisualRecurrence(
  ...texts: Array<string | null | undefined>
): { raw: string; times: number | null } | null {
  for (const t of texts) {
    const text = String(t ?? "").trim();
    if (!text) continue;
    const m =
      /((?:every|each|cada)\s+[a-záéíóúñ]+(?:\s+(?:for|por|durante)\s+(\d{1,3})\s*(?:times|veces|x)?)?)/i.exec(
        text,
      ) ?? /(repeat[s]?\s+[^.,\n]{0,40})/i.exec(text);
    if (m) {
      const times = m[2] ? Number(m[2]) : null;
      return { raw: m[1].trim(), times: Number.isFinite(times as number) ? times : null };
    }
  }
  return null;
}

/**
 * MÍNIMO DE SERVICIO VISUAL.
 *
 * Un bloque es candidato revisable cuando tiene fecha y, además, al menos una
 * de estas señales estructurales: identidad (lugar / cliente / tipo), horario
 * o dirección. Una captura de "Shift details" con fecha + horario ya es un
 * servicio, aunque el Job quede pendiente de confirmar.
 */
export function hasMinimumEvidence(service: RawVisualService): boolean {
  const hasDate = !!cleanText(service.service_date);
  const hasIdentity = !!(
    cleanText(service.venue_name) ||
    cleanText(service.client_name) ||
    cleanText(service.service_type)
  );
  const hasSchedule = !!(cleanText(service.start_time) || cleanText(service.end_time));
  const hasAddress = !!cleanText(service.location_text);
  return hasDate && (hasIdentity || hasSchedule || hasAddress);
}


export function normalizeVisualExtraction(
  input: NormalizeVisualInput,
): NormalizeVisualResult {
  const prefix = input.idPrefix ?? "vis";
  const services = Array.isArray(input.extraction.services) ? input.extraction.services : [];
  const rawUnresolved = Array.isArray(input.extraction.unresolved)
    ? input.extraction.unresolved
    : [];

  const candidates: ServiceCandidate[] = [];
  const meta: Record<string, VisualCandidateMeta> = {};
  const notices: VisualNotice[] = [];
  const warnings: string[] = [];
  const unresolved: UnresolvedElement[] = rawUnresolved.map((u, i) => ({
    id: `${prefix}-unresolved-${i + 1}`,
    detectedText: cleanText(u.detected_text) ?? "Fragmento sin texto legible",
    reason: cleanText(u.reason) ?? "No se pudo interpretar con suficiente confianza.",
    suggestion: cleanText(u.suggestion),
    region: {
      page: positiveInt(u.page_number),
      label: cleanText(u.region_label),
      box: null,
    },
    fileName: input.fileName ?? null,
  }));

  services.forEach((service, index) => {
    const candidateId = `${prefix}-${index + 1}`;

    if (!hasMinimumEvidence(service)) {
      // Nunca se descarta en silencio: pasa a "Necesitan revisión".
      unresolved.push({
        id: `${prefix}-unresolved-service-${index + 1}`,
        detectedText:
          cleanText(service.source_excerpt) ??
          (cleanText(
            [service.service_date, service.venue_name, service.service_type]
              .filter(Boolean)
              .join(" · "),
          ) ??
            "Bloque detectado sin datos suficientes"),

        reason: cleanText(service.service_date)
          ? "No identificamos lugar, cliente ni tipo de servicio."
          : "No identificamos una fecha en este bloque.",
        suggestion: cleanText(service.extraction_notes),
        region: {
          page: positiveInt(service.page_number),
          label: cleanText(service.region_label),
          box: service.region_box ?? null,
        },
        fileName: input.fileName ?? null,
      });
      return;
    }

    const resolvedDate = resolveVisualDate(service.service_date, input.referenceDate);
    const startTime = normalizeVisualTime(service.start_time);
    const endTime = normalizeVisualTime(service.end_time);
    const workers = positiveInt(service.requested_workers);
    const venueRaw = cleanText(service.venue_name);
    const clientRaw = cleanText(service.client_name);
    const locationRaw = cleanText(service.location_text);
    const serviceType = cleanText(service.service_type);
    const c = service.confidence ?? {};

    const confidenceByField: Record<string, number> = {
      date: conf(c.date, !!resolvedDate.date),
      venue: conf(c.venue, !!venueRaw),
      service_type: conf(c.service_type, !!serviceType),
      start_time: conf(c.start_time, !!startTime),
      end_time: conf(c.end_time, !!endTime),
      client: conf(c.client, !!clientRaw),
      workers: conf(c.workers, workers !== null),
      location: conf(c.location, !!locationRaw),
    };

    const candidate = createCandidate({
      id: candidateId,
      companyId: input.companyId,
      source: input.source,
      sourceBatchId: input.batchId,
      sourceReference: [
        input.fileName ?? "archivo",
        service.page_number ? `p${service.page_number}` : null,
        service.region_label ?? null,
      ]
        .filter(Boolean)
        .join("#"),
      serviceDate: resolvedDate.date,
      startTime,
      endTime,
      serviceType,
      requestedWorkers: workers,
      roleCandidates: Array.isArray(service.roles)
        ? service.roles.map((r) => String(r).trim()).filter(Boolean)
        : [],
      notes: cleanText(service.notes),
      clientCandidate: {
        raw: clientRaw ?? "",
        resolvedId: null,
        suggestedId: null,
        suggestedLabel: null,
        confidence: confidenceByField.client,
        requiresConfirmation: false,
      },
      venueCandidate: {
        raw: venueRaw ?? "",
        resolvedId: null,
        suggestedId: null,
        suggestedLabel: null,
        confidence: confidenceByField.venue,
        requiresConfirmation: false,
      },
      locationCandidate: {
        raw: locationRaw ?? venueRaw ?? "",
        resolvedId: null,
        suggestedId: null,
        suggestedLabel: null,
        confidence: confidenceByField.location,
        requiresConfirmation: false,
      },
      confidenceByField,
    });

    candidates.push(candidate);

    const levels = CONFIDENCE_FIELDS.reduce((acc, field) => {
      acc[field] = confidenceLevel(confidenceByField[field]);
      return acc;
    }, {} as Record<ConfidenceField, ConfidenceLevel>);

    meta[candidateId] = {
      candidateId,
      region: {
        page: positiveInt(service.page_number),
        label: cleanText(service.region_label),
        box: service.region_box ?? null,
      },
      sourceExcerpt: cleanText(service.source_excerpt),
      colorGroup: cleanText(service.color_group),
      extractionNotes: cleanText(service.extraction_notes),
      fileName: input.fileName ?? null,
      levels,
    };

    if (resolvedDate.assumedYear) {
      notices.push({
        candidateId,
        message: "La imagen no muestra el año. Confirma la fecha antes de crear el borrador.",
      });
    }
    if (!startTime || !endTime) {
      notices.push({
        candidateId,
        message: "La imagen no muestra horario. Completa la hora: no la inventamos.",
      });
    }
    if (workers === null) {
      notices.push({
        candidateId,
        message: "La imagen no indica cuántas personas hacen falta.",
      });
    }
    if (meta[candidateId].colorGroup) {
      notices.push({
        candidateId,
        message: `Agrupado por color (${meta[candidateId].colorGroup}). El color no define el lugar: confirma con el texto.`,
      });
    }
  });

  if (services.length === 0) {
    warnings.push("No encontramos servicios legibles en el archivo.");
  }

  return {
    candidates,
    meta,
    unresolved,
    notices,
    warnings,
    pageCount: positiveInt(input.extraction.page_count) ?? 1,
  };
}

/** Deduplica candidatos idénticos que aparecen en varias páginas del mismo PDF. */
export function dedupeAcrossPages(
  candidates: ServiceCandidate[],
): { candidates: ServiceCandidate[]; removed: number } {
  const seen = new Set<string>();
  const kept: ServiceCandidate[] = [];
  let removed = 0;
  for (const c of candidates) {
    const key = [
      c.serviceDate ?? "",
      (c.venueCandidate.raw || "").toLowerCase().trim(),
      (c.clientCandidate.raw || "").toLowerCase().trim(),
      (c.serviceType || "").toLowerCase().trim(),
      c.startTime ?? "",
    ].join("|");
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { candidates: kept, removed };
}
