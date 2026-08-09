/**
 * Smart Service Intake — Fase 2: parser de texto libre / WhatsApp pegado.
 *
 * Módulo PURO (cero I/O, cero supabase, cero react). Convierte texto no
 * tabular en `ServiceCandidate[]` del modelo canónico de Fase 1.
 *
 * REGLAS DURAS:
 *  - Nunca inventa datos: lo que no está en el texto queda `null` y se
 *    reporta en `missingFields`.
 *  - `company_id` SIEMPRE viene del contexto autenticado del llamador.
 *    Jamás se infiere del contenido del mensaje.
 *  - Las abreviaciones (BM, SB…) son suggestion-only: se proponen con
 *    confianza y un aviso para que un humano confirme; no se guardan como
 *    regla global.
 *  - Una fecha ambigua NO se decide en silencio: se deja `null` y se emite
 *    el aviso "Fecha por confirmar".
 */

import {
  createCandidate,
  emptyRef,
  recomputeCandidate,
  type IntakeSource,
  type ServiceCandidate,
} from "./candidate";
import { expandDateList } from "./date-expansion";


/* -------------------------------------------------------------------------
 * Contexto y salida
 * ---------------------------------------------------------------------- */

export interface TextParseContext {
  /** SIEMPRE del contexto autenticado. */
  companyId: string;
  /** `import_batches.id` si ya existe (puede resolverse después). */
  batchId?: string | null;
  source?: IntakeSource;
  /** Fecha de referencia YYYY-MM-DD (hoy del sistema) para "mañana", "el martes". */
  referenceDate: string;
}

export type TextNoticeKind =
  | "abbreviation_suggested"
  | "ambiguous_date"
  | "missing_date"
  | "inferred_year"
  | "approximate_time"
  | "pending_workers"
  | "missing_venue"
  | "no_service_detected";


export interface TextParseNotice {
  candidateId: string | null;
  kind: TextNoticeKind;
  message: string;
  raw?: string;
  suggestion?: string;
}

export interface TextParseResult {
  candidates: ServiceCandidate[];
  notices: TextParseNotice[];
  warnings: string[];
  /** Fragmentos exactos que originaron cada candidato (trazabilidad). */
  segments: Array<{ candidateId: string; excerpt: string; lineNumber: number }>;
}

/* -------------------------------------------------------------------------
 * 1. Limpieza de WhatsApp / emojis
 * ---------------------------------------------------------------------- */

const WHATSAPP_PREFIXES: RegExp[] = [
  // [13/10/25, 9:15:03 p. m.] Nombre:
  /^\s*\[\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4},?\s*\d{1,2}:\d{2}(:\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)?\s*\]\s*[^:]{1,60}:\s*/i,
  // 13/10/25, 21:15 - Nombre:
  /^\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4},?\s*\d{1,2}:\d{2}(:\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)?\s*[-–]\s*[^:]{1,60}:\s*/i,
];

const WHATSAPP_NOISE = [
  /<multimedia omitido>/gi,
  /<media omitted>/gi,
  /este mensaje fue eliminado/gi,
  /this message was deleted/gi,
  /los mensajes.*cifrados de extremo a extremo/gi,
];

const EMOJI_RE =
  /[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F\u{1F000}-\u{1FAFF}]/gu;

/** Quita cabeceras de WhatsApp, ruido del export y emojis. Preserva saltos. */
export function normalizePastedText(raw: string): string {
  let text = (raw ?? "").replace(/\r\n?/g, "\n");
  for (const noise of WHATSAPP_NOISE) text = text.replace(noise, " ");
  text = text.replace(EMOJI_RE, " ");

  const lines = text.split("\n").map((line) => {
    let out = line;
    for (const re of WHATSAPP_PREFIXES) out = out.replace(re, "");
    // viñetas y guiones de lista
    out = out.replace(/^\s*([-*•·–—]|\d{1,2}[.)])\s+/, "");
    return out.replace(/\s{2,}/g, " ").trim();
  });

  return lines.join("\n").trim();
}

/* -------------------------------------------------------------------------
 * 2. Diccionarios (suggestion-only)
 * ---------------------------------------------------------------------- */

/** Abreviaciones frecuentes. NUNCA se aplican como hecho: se sugieren. */
export const SERVICE_ABBREVIATIONS: Record<string, { expansion: string; confidence: number }> = {
  bm: { expansion: "Bar Mitzvah", confidence: 0.72 },
  "bat m": { expansion: "Bat Mitzvah", confidence: 0.72 },
  batm: { expansion: "Bat Mitzvah", confidence: 0.72 },
  sb: { expansion: "Sheva Brochos", confidence: 0.72 },
  kd: { expansion: "Kiddush", confidence: 0.65 },
  wed: { expansion: "Wedding", confidence: 0.65 },
  bd: { expansion: "Brit Milah", confidence: 0.6 },
};

/** Tipos de servicio escritos completos (match directo, alta confianza). */
export const SERVICE_TYPE_PHRASES: string[] = [
  "bar mitzvah",
  "bat mitzvah",
  "sheva brochos",
  "sheva brachos",
  "kiddush",
  "brit milah",
  "wedding",
  "boda",
  "engagement",
  "vort",
  "aufruf",
  "dinner",
  "cena",
  "lunch",
  "almuerzo",
  "breakfast",
  "desayuno",
  "corporate",
  "corporativo",
  "conference",
  "conferencia",
  "gala",
  "cocktail",
  "coctel",
  "brunch",
  "birthday",
  "cumpleanos",
  "cumpleaños",
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

/** 0 = domingo. */
const WEEKDAYS: Record<string, number> = {
  domingo: 0, sunday: 0, sun: 0, dom: 0,
  lunes: 1, monday: 1, mon: 1, lun: 1,
  martes: 2, tuesday: 2, tue: 2, tues: 2, mar_: 2,
  miercoles: 3, "miércoles": 3, wednesday: 3, wed_: 3,
  jueves: 4, thursday: 4, thu: 4, thurs: 4, jue: 4,
  viernes: 5, friday: 5, fri: 5, vie: 5,
  sabado: 6, "sábado": 6, saturday: 6, sat: 6, sab: 6,
};

const WORKER_NOUNS =
  /(workers?|staff|meseros?|mesoneros?|camareros?|mozos?|personas?|people|servers?|bartenders?|waiters?)/i;

const WEEK_ANCHORS =
  /(pr[oó]xima semana|next week|semana que viene|la semana entrante|esta semana|this week)/i;

/* -------------------------------------------------------------------------
 * 3. Utilidades de fecha
 * ---------------------------------------------------------------------- */

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toISO(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return "";
  return dt.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

interface DateHit {
  iso: string | null;
  confidence: number;
  ambiguous: boolean;
  matched: string;
  reason?: string;
}

/**
 * Resuelve la fecha de un fragmento. Nunca adivina en silencio:
 * si hay más de una lectura razonable devuelve `ambiguous: true` con `iso = null`.
 */
export function resolveDateFromText(
  segment: string,
  referenceDate: string,
  opts: { weekAnchor?: boolean } = {},
): DateHit {
  const text = stripAccents(segment.toLowerCase());

  // ISO explícito
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const value = toISO(+iso[1], +iso[2], +iso[3]);
    return { iso: value || null, confidence: value ? 0.98 : 0, ambiguous: false, matched: iso[0] };
  }

  // Numérico M/D o M/D/Y (formato US, el usado por la operación)
  const num = text.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/);
  if (num) {
    const month = +num[1];
    const day = +num[2];
    let year = num[3] ? +num[3] : NaN;
    if (!Number.isNaN(year) && year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      if (Number.isNaN(year)) {
        const guess = rollYear(month, day, referenceDate);
        return { iso: guess, confidence: 0.85, ambiguous: false, matched: num[0], reason: "year_inferred" };
      }
      const value = toISO(year, month, day);
      return { iso: value || null, confidence: value ? 0.95 : 0, ambiguous: false, matched: num[0] };
    }
  }

  // "Oct 13" / "13 de octubre" / "octubre 13"
  const monthNames = Object.keys(MONTHS).join("|");
  const md = text.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})\\b`));
  const dm = text.match(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${monthNames})\\b`));
  const hit = md ?? dm;
  if (hit) {
    const month = md ? MONTHS[md[1]] : MONTHS[dm![2]];
    const day = md ? +md[2] : +dm![1];
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const value = toISO(+yearMatch[1], month, day);
      return { iso: value || null, confidence: value ? 0.95 : 0, ambiguous: false, matched: hit[0] };
    }
    const guess = rollYear(month, day, referenceDate);
    return { iso: guess, confidence: 0.88, ambiguous: false, matched: hit[0], reason: "year_inferred" };
  }

  // Relativas explícitas
  if (/\bpasado ma[nñ]ana\b|\bday after tomorrow\b/.test(text)) {
    return { iso: addDays(referenceDate, 2), confidence: 0.9, ambiguous: false, matched: "pasado mañana" };
  }
  if (/\bma[nñ]ana\b|\btomorrow\b/.test(text)) {
    return { iso: addDays(referenceDate, 1), confidence: 0.9, ambiguous: false, matched: "mañana" };
  }
  if (/\bhoy\b|\btoday\b/.test(text)) {
    return { iso: referenceDate, confidence: 0.95, ambiguous: false, matched: "hoy" };
  }

  // Día de la semana
  const weekdayNames = Object.keys(WEEKDAYS)
    .filter((k) => !k.endsWith("_"))
    .map(stripAccents)
    .join("|");
  const wd = text.match(new RegExp(`\\b(${weekdayNames})\\b`));
  if (wd) {
    const target = WEEKDAYS[wd[1]] ?? WEEKDAYS[`${wd[1]}_`];
    const explicitNext = /\b(proximo|proxima|next|el que viene|entrante)\b/.test(text);
    const anchored = opts.weekAnchor || explicitNext || /\b(este|esta|this)\b/.test(text);
    if (target === undefined) {
      return { iso: null, confidence: 0, ambiguous: true, matched: wd[0] };
    }
    if (!anchored) {
      // "el martes" sin ancla: puede ser esta semana o la próxima.
      return {
        iso: null,
        confidence: 0.4,
        ambiguous: true,
        matched: wd[0],
        reason: "weekday_without_anchor",
      };
    }
    let delta = (target - weekdayOf(referenceDate) + 7) % 7;
    if (delta === 0) delta = 7;
    if (opts.weekAnchor || explicitNext) {
      // Ancla de "próxima semana": la ocurrencia siguiente a esta semana.
      const thisWeekEnd = 7 - weekdayOf(referenceDate);
      if (delta < thisWeekEnd && explicitNext) delta += 7;
    }
    return {
      iso: addDays(referenceDate, delta),
      confidence: 0.7,
      ambiguous: false,
      matched: wd[0],
      reason: "weekday_anchored",
    };
  }

  return { iso: null, confidence: 0, ambiguous: false, matched: "" };
}

/** Sin año explícito: usa el año que deja la fecha más cerca del futuro. */
function rollYear(month: number, day: number, referenceDate: string): string | null {
  const refYear = +referenceDate.slice(0, 4);
  const candidates = [refYear, refYear + 1, refYear - 1]
    .map((y) => toISO(y, month, day))
    .filter(Boolean);
  if (candidates.length === 0) return null;
  const ref = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const future = candidates
    .filter((iso) => new Date(`${iso}T00:00:00Z`).getTime() >= ref - 45 * 86400000)
    .sort();
  return future[0] ?? candidates[0];
}

/* -------------------------------------------------------------------------
 * 4. Horas, personal, tipo de servicio
 * ---------------------------------------------------------------------- */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function to24h(hour: number, minute: number, meridiem?: string | null): string | null {
  let h = hour;
  if (meridiem) {
    const pm = /p/i.test(meridiem);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (h > 23 || minute > 59) return null;
  return `${pad(h)}:${pad(minute)}`;
}

export function resolveTimesFromText(segment: string): {
  start: string | null;
  end: string | null;
  confidence: number;
  matched: string;
} {
  const text = stripAccents(segment.toLowerCase());
  const range = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|a|to|hasta|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
  );
  if (range) {
    const endMer = range[6] ?? null;
    const startMer = range[3] ?? (endMer && +range[1] <= 12 && +range[1] >= 6 ? endMer : null);
    const start = to24h(+range[1], range[2] ? +range[2] : 0, startMer);
    const end = to24h(+range[4], range[5] ? +range[5] : 0, endMer);
    if (start && end) return { start, end, confidence: 0.85, matched: range[0] };
  }
  const single = text.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/);
  if (single) {
    const hour = single[1] ? +single[1] : +single[4];
    const minute = single[2] ? +single[2] : 0;
    const mer = single[3] ?? single[5] ?? null;
    const start = to24h(hour, minute, mer);
    if (start) return { start, end: null, confidence: 0.7, matched: single[0] };
  }
  return { start: null, end: null, confidence: 0, matched: "" };
}

export function resolveWorkersFromText(segment: string): { count: number | null; matched: string } {
  const text = stripAccents(segment.toLowerCase());
  const withNoun = text.match(new RegExp(`\\b(\\d{1,2})\\s*${WORKER_NOUNS.source}`, "i"));
  if (withNoun) return { count: +withNoun[1], matched: withNoun[0] };
  const nounFirst = text.match(new RegExp(`${WORKER_NOUNS.source}\\s*[:x]?\\s*(\\d{1,2})\\b`, "i"));
  if (nounFirst) return { count: +nounFirst[nounFirst.length - 1], matched: nounFirst[0] };
  const xN = text.match(/\bx\s?(\d{1,2})\b/);
  if (xN) return { count: +xN[1], matched: xN[0] };
  return { count: null, matched: "" };
}

export interface ServiceTypeHit {
  value: string | null;
  confidence: number;
  matched: string;
  /** Abreviación detectada (suggestion-only). */
  abbreviation?: { raw: string; expansion: string };
}

export function resolveServiceTypeFromText(segment: string): ServiceTypeHit {
  const text = stripAccents(segment.toLowerCase());
  for (const phrase of SERVICE_TYPE_PHRASES) {
    const needle = stripAccents(phrase);
    if (text.includes(needle)) {
      return { value: titleCase(phrase), confidence: 0.92, matched: needle };
    }
  }
  for (const [abbr, info] of Object.entries(SERVICE_ABBREVIATIONS)) {
    const re = new RegExp(`(^|[^a-z])${abbr.replace(/\s/g, "\\s?")}([^a-z]|$)`, "i");
    if (re.test(text)) {
      return {
        value: info.expansion,
        confidence: info.confidence,
        matched: abbr,
        abbreviation: { raw: abbr.toUpperCase(), expansion: info.expansion },
      };
    }
  }
  return { value: null, confidence: 0, matched: "" };
}

function titleCase(s: string): string {
  return s.replace(/\b[a-záéíóúñ]/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------
 * 5. Segmentación multi-servicio
 * ---------------------------------------------------------------------- */

const DATE_SIGNAL = new RegExp(
  `\\b(${Object.keys(MONTHS).join("|")})\\b|\\b\\d{1,2}[/.\\-]\\d{1,2}\\b|\\b(${Object.keys(WEEKDAYS)
    .filter((k) => !k.endsWith("_"))
    .map(stripAccents)
    .join("|")})\\b|\\bma[nñ]ana\\b|\\btomorrow\\b|\\bhoy\\b|\\btoday\\b`,
  "i",
);

function hasDateSignal(s: string): boolean {
  return DATE_SIGNAL.test(stripAccents(s.toLowerCase()));
}

interface Segment {
  text: string;
  lineNumber: number;
  contextVenue: string | null;
  weekAnchor: boolean;
  /** Bloque al que pertenece: cambia con cada cabecera de venue/cliente. */
  blockIndex: number;
  /**
   * `service` = fragmento que puede volverse candidato.
   * `context` = línea de contexto común (hora aproximada, personal pendiente)
   * que se hereda por los candidatos del MISMO bloque.
   */
  kind: "service" | "context";
}

const TIME_SIGNAL = /\b\d{1,2}\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i;
const PENDING_SIGNAL =
  /(pendiente|pendientes|por confirmar|to be confirmed|tbd|sin definir|no definid)/i;

function hasTimeSignal(s: string): boolean {
  return TIME_SIGNAL.test(stripAccents(s.toLowerCase()));
}

/** Cabecera suelta sin dos puntos: "Imperial". Nunca contiene datos. */
function isBareHeader(line: string): boolean {
  const t = stripAccents(line.toLowerCase());
  if (hasDateSignal(line) || hasTimeSignal(line)) return false;
  if (/\d/.test(t)) return false;
  if (WORKER_NOUNS.test(t) || PENDING_SIGNAL.test(t)) return false;
  if (resolveServiceTypeFromText(line).value) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
}

/** Divide el texto limpio en fragmentos, uno por posible servicio. */
export function segmentText(clean: string): Segment[] {
  const lines = clean.split("\n").map((l) => l.trim());
  const segments: Segment[] = [];
  let contextVenue: string | null = null;
  let weekAnchor = false;
  let blockIndex = 0;

  lines.forEach((line, index) => {
    if (!line) return;

    // Cabecera de contexto: "Zemer:" / "Millennium:" (sin fecha propia).
    const header = line.match(/^(.{2,60}?):\s*$/);
    if (header) {
      const label = header[1].trim();
      if (WEEK_ANCHORS.test(stripAccents(label.toLowerCase()))) {
        weekAnchor = true;
      } else if (!hasDateSignal(label)) {
        contextVenue = label;
        blockIndex += 1;
      }
      return;
    }
    if (WEEK_ANCHORS.test(stripAccents(line.toLowerCase())) && !hasDateSignal(line)) {
      weekAnchor = true;
      return;
    }

    // Cabecera suelta en su propia línea: "Imperial".
    if (isBareHeader(line)) {
      contextVenue = line;
      blockIndex += 1;
      return;
    }

    // Línea de contexto común del bloque: "sin hora definida pero aprox 5pm",
    // "cantidad de meseros pendientes".
    if (!hasDateSignal(line) && (hasTimeSignal(line) || WORKER_NOUNS.test(stripAccents(line.toLowerCase())))) {
      segments.push({
        text: line,
        lineNumber: index + 1,
        contextVenue,
        weekAnchor,
        blockIndex,
        kind: "context",
      });
      return;
    }

    // Cabecera con contenido en la misma línea: "Zemer: Oct 14 SB"
    let body = line;
    let localVenue = contextVenue;
    const inline = line.match(/^([^:]{2,60}):\s*(.+)$/);
    if (inline && !hasDateSignal(inline[1])) {
      localVenue = inline[1].trim();
      contextVenue = localVenue;
      blockIndex += 1;
      body = inline[2].trim();
    }

    // Multi-servicio dentro de la línea.
    const parts = body
      .split(/\s*[,;]\s*|\s+\/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const dated = parts.filter(hasDateSignal);
    const chunks = parts.length > 1 && dated.length > 1 ? parts : [body];

    chunks.forEach((chunk) => {
      segments.push({
        text: chunk,
        lineNumber: index + 1,
        contextVenue: localVenue,
        weekAnchor,
        blockIndex,
        kind: "service",
      });
    });
  });

  return segments;
}



/* -------------------------------------------------------------------------
 * 6. Parser principal
 * ---------------------------------------------------------------------- */

const STOPWORDS = new Set([
  "para", "la", "el", "los", "las", "de", "del", "en", "y", "con", "a",
  "por", "próxima", "proxima", "semana", "next", "week", "the", "on", "at",
  "and", "for", "hola", "buenas", "gracias", "ok", "favor", "porfa",
  "necesito", "necesitamos", "tenemos", "please", "need", "hi", "hey",
]);

function extractVenueText(segment: string, consumed: string[]): string {
  let rest = segment;
  for (const token of consumed) {
    if (!token) continue;
    rest = rest.replace(new RegExp(escapeRe(token), "ig"), " ");
  }
  const words = rest
    .split(/\s+/)
    .map((w) => w.replace(/^[^\wÁÉÍÓÚÑáéíóúñ]+|[^\wÁÉÍÓÚÑáéíóúñ]+$/g, ""))
    .filter((w) => w.length > 1)
    .filter((w) => !STOPWORDS.has(stripAccents(w.toLowerCase())))
    .filter((w) => !/^\d+$/.test(w));
  return words.join(" ").trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseTextToCandidates(
  rawText: string,
  ctx: TextParseContext,
): TextParseResult {
  if (!ctx.companyId) throw new Error("companyId requerido (contexto autenticado)");

  const clean = normalizePastedText(rawText);
  const notices: TextParseNotice[] = [];
  const warnings: string[] = [];
  const candidates: ServiceCandidate[] = [];
  const segments: TextParseResult["segments"] = [];

  if (!clean) {
    warnings.push("El texto está vacío.");
    return { candidates, notices, warnings, segments };
  }

  const source: IntakeSource = ctx.source ?? "pasted_text";
  const parsedSegments = segmentText(clean);
  let index = 0;
  /** Venue heredado del fragmento anterior de la MISMA línea. */
  let lastLine = -1;
  let lastVenue = "";
  /** blockIndex de cada candidato, para heredar el contexto común. */
  const blockOf = new Map<string, number>();
  const dedupe = new Set<string>();

  for (const seg of parsedSegments) {
    if (seg.kind === "context") continue;

    const date = resolveDateFromText(seg.text, ctx.referenceDate, { weekAnchor: seg.weekAnchor });
    const expansion = expandDateList(seg.text, ctx.referenceDate);
    const multi = expansion.dates.length > 1;

    // Texto sin fechas: base para venue, hora y personal comunes al fragmento.
    const dateTokens = multi
      ? [...expansion.matchedFragments, ...expansion.dates.map((d) => d.matched)]
      : [date.matched];
    let withoutDates = seg.text;
    for (const token of dateTokens) {
      if (token) withoutDates = withoutDates.replace(new RegExp(escapeRe(token), "ig"), " ");
    }

    const times = resolveTimesFromText(withoutDates);
    const workers = resolveWorkersFromText(seg.text);
    const type = resolveServiceTypeFromText(seg.text);
    const approximate = times.start ? isApproximateTime(seg.text) : false;

    const consumed = [...dateTokens, times.matched, workers.matched, type.matched].filter(Boolean);
    const venueFromText = extractVenueText(seg.text, consumed);
    if (seg.lineNumber !== lastLine) {
      lastLine = seg.lineNumber;
      lastVenue = "";
    }
    const venueRaw = venueFromText || seg.contextVenue || lastVenue || "";
    if (venueRaw) lastVenue = venueRaw;

    // Un fragmento sólo es un trabajo si trae fecha (o fecha ambigua) o un
    // tipo de servicio reconocible. Un texto suelto NO inventa un servicio.
    const hasSignal = Boolean(multi || date.iso || date.ambiguous || type.value);
    if (!hasSignal) {
      notices.push({
        candidateId: null,
        kind: "no_service_detected",
        message: "No se detectó ningún trabajo en este fragmento.",
        raw: seg.text,
      });
      continue;
    }

    // Una lista de días ("Aug 30/31", "Sep 1/2/3") es un servicio por día.
    const occurrences: Array<{
      iso: string | null;
      confidence: number;
      ambiguous: boolean;
      matched: string;
      yearInferred: boolean;
    }> = multi
      ? expansion.dates.map((d) => ({
          iso: d.iso,
          confidence: d.confidence,
          ambiguous: false,
          matched: d.matched,
          yearInferred: d.yearInferred,
        }))
      : [
          {
            iso: date.iso,
            confidence: date.confidence,
            ambiguous: date.ambiguous,
            matched: date.matched,
            yearInferred: date.reason === "year_inferred",
          },
        ];

    for (const occ of occurrences) {
      const key = `${seg.blockIndex}|${occ.iso ?? seg.text}|${stripAccents(venueRaw.toLowerCase())}|${times.start ?? ""}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);

      const candidateId = `text-${index}-${seg.lineNumber}`;
      index += 1;

      const confidenceByField: Record<string, number> = {};
      if (occ.iso) confidenceByField.service_date = occ.confidence;
      if (times.start) confidenceByField.start_time = approximate ? 0.5 : times.confidence;
      if (times.end) confidenceByField.end_time = times.confidence;
      if (type.value) confidenceByField.service_type = type.confidence;
      if (venueRaw) confidenceByField.venue = venueFromText ? 0.6 : 0.5;
      if (workers.count) confidenceByField.requested_workers = 0.8;

      const candidate = createCandidate({
        id: candidateId,
        companyId: ctx.companyId, // nunca del contenido
        source,
        sourceBatchId: ctx.batchId ?? null,
        sourceRowId: null,
        sourceReference: `${seg.lineNumber}:${occ.matched || seg.text}`,
        serviceDate: occ.iso,
        startTime: times.start,
        endTime: times.end,
        venueCandidate: { ...emptyRef(venueRaw) },
        clientCandidate: { ...emptyRef("") },
        serviceType: type.value,
        requestedWorkers: workers.count,
        notes: seg.text,
        confidenceByField,
      });

      candidates.push(candidate);
      blockOf.set(candidateId, seg.blockIndex);
      segments.push({
        candidateId,
        excerpt: multi ? `${occ.matched} — ${seg.text}` : seg.text,
        lineNumber: seg.lineNumber,
      });

      if (type.abbreviation) {
        notices.push({
          candidateId,
          kind: "abbreviation_suggested",
          message: `Interpretamos ${type.abbreviation.raw} como ${type.abbreviation.expansion}. Confirma antes de crear.`,
          raw: type.abbreviation.raw,
          suggestion: type.abbreviation.expansion,
        });
      }
      if (occ.ambiguous || !occ.iso) {
        notices.push({
          candidateId,
          kind: occ.ambiguous ? "ambiguous_date" : "missing_date",
          message: occ.ambiguous
            ? "Fecha por confirmar: hay más de una interpretación razonable."
            : "Fecha por confirmar: el mensaje no indica la fecha.",
          raw: occ.matched || undefined,
        });
      } else if (occ.yearInferred) {
        notices.push({
          candidateId,
          kind: "inferred_year",
          message: "El año no está escrito en la fuente: lo dedujimos por cercanía. Revisa antes de crear.",
          raw: occ.matched,
          suggestion: occ.iso,
        });
      }
      if (approximate) {
        notices.push({
          candidateId,
          kind: "approximate_time",
          message: "La fuente indica que la hora es aproximada. Confirma el horario antes de crear.",
          raw: times.matched,
          suggestion: times.start ?? undefined,
        });
      }
      if (!venueRaw) {
        notices.push({
          candidateId,
          kind: "missing_venue",
          message: "Falta el lugar o cliente. Complétalo antes de crear el borrador.",
        });
      }
    }
  }

  // Contexto común del bloque: hora aproximada y personal pendiente.
  for (const seg of parsedSegments) {
    if (seg.kind !== "context") continue;
    const times = resolveTimesFromText(seg.text);
    const approximate = times.start ? isApproximateTime(seg.text) : false;
    const workers = resolveWorkersFromText(seg.text);
    const pending = PENDING_SIGNAL.test(stripAccents(seg.text.toLowerCase()));
    const roles = detectRoleCandidates(seg.text);

    for (const candidate of candidates) {
      if (blockOf.get(candidate.id) !== seg.blockIndex) continue;

      if (times.start && !candidate.startTime) {
        candidate.startTime = times.start;
        candidate.confidenceByField.start_time = approximate ? 0.5 : times.confidence;
        if (approximate) {
          notices.push({
            candidateId: candidate.id,
            kind: "approximate_time",
            message: "La fuente indica que la hora es aproximada. Confirma el horario antes de crear.",
            raw: times.matched,
            suggestion: times.start,
          });
        }
      }
      // Nunca se inventa la hora de fin.
      if (workers.count !== null && candidate.requestedWorkers === null && !pending) {
        candidate.requestedWorkers = workers.count;
        candidate.confidenceByField.requested_workers = 0.8;
      }
      if (roles.length > 0) {
        candidate.roleCandidates = Array.from(new Set([...candidate.roleCandidates, ...roles]));
      }
      if (pending && candidate.requestedWorkers === null) {
        // "pendiente" nunca es 0: se mantiene desconocido y se avisa.
        notices.push({
          candidateId: candidate.id,
          kind: "pending_workers",
          message: "La fuente dice que la cantidad de personal está pendiente. Complétala antes de crear.",
          raw: seg.text,
        });
      }
      recomputeCandidate(candidate);
    }
  }


  if (candidates.length === 0) {
    warnings.push("No se encontraron trabajos en el texto pegado.");
  }

  return { candidates, notices, warnings, segments };
}
