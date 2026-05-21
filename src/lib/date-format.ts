/**
 * Centralized US date formatting & parsing utilities.
 *
 * Display standard: MM/DD/YYYY
 * Internal/storage standard: ISO YYYY-MM-DD
 *
 * Used by SmartDateInput and any read-only date label that should render
 * in US format. Storage, payroll math, time_entries, scheduled_shifts and
 * pay period logic are NOT touched — these helpers only translate at the
 * presentation boundary.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const DIGITS_8 = /^(\d{2})(\d{2})(\d{4})$/;
const DIGITS_6 = /^(\d{2})(\d{2})(\d{2})$/;

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

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, dom: 0, domingo: 0,
  mon: 1, monday: 1, lun: 1, lunes: 1,
  tue: 2, tues: 2, tuesday: 2, mar: 2, martes: 2,
  wed: 3, weds: 3, wednesday: 3, mie: 3, mié: 3, miercoles: 3, miércoles: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, jue: 4, jueves: 4,
  fri: 5, friday: 5, vie: 5, viernes: 5,
  sat: 6, saturday: 6, sab: 6, sáb: 6, sabado: 6, sábado: 6,
};

function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIso(y: number, m: number, d: number): string | null {
  if (!isValidYMD(y, m, d)) return null;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

function todayLocalIso(): string {
  const n = new Date();
  return toIso(n.getFullYear(), n.getMonth() + 1, n.getDate())!;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())!;
}

function expandYear(yy: number): number {
  if (yy >= 100) return yy;
  // 00-69 => 2000-2069, 70-99 => 1970-1999
  return yy <= 69 ? 2000 + yy : 1900 + yy;
}

/** Format any ISO YYYY-MM-DD, MM/DD/YYYY string or Date into MM/DD/YYYY. Returns "" for empty/invalid. */
export function formatDateUS(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return `${(value.getMonth() + 1).toString().padStart(2, "0")}/${value
      .getDate()
      .toString()
      .padStart(2, "0")}/${value.getFullYear()}`;
  }
  const s = value.trim();
  if (!s) return "";
  if (ISO_RE.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    if (!isValidYMD(y, m, d)) return "";
    return `${m.toString().padStart(2, "0")}/${d.toString().padStart(2, "0")}/${y}`;
  }
  const us = US_RE.exec(s);
  if (us) {
    const m = Number(us[1]);
    const d = Number(us[2]);
    const y = expandYear(Number(us[3]));
    if (!isValidYMD(y, m, d)) return "";
    return `${m.toString().padStart(2, "0")}/${d.toString().padStart(2, "0")}/${y}`;
  }
  return "";
}

/** Parse a flexible user input into ISO YYYY-MM-DD. Returns null if invalid. */
export function parseDateUS(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Natural language
  if (lower === "today" || lower === "hoy") return todayLocalIso();
  if (lower === "tomorrow" || lower === "mañana" || lower === "manana") {
    return addDaysIso(todayLocalIso(), 1);
  }
  if (lower === "yesterday" || lower === "ayer") {
    return addDaysIso(todayLocalIso(), -1);
  }

  // "in N days"
  const inDays = /^in\s+(\d{1,3})\s+days?$/i.exec(lower) || /^en\s+(\d{1,3})\s+d[ií]as?$/i.exec(lower);
  if (inDays) return addDaysIso(todayLocalIso(), Number(inDays[1]));

  // "next <weekday>"
  const nextWk = /^next\s+([a-záéíóú]+)$/i.exec(lower) || /^pr[oó]ximo\s+([a-záéíóú]+)$/i.exec(lower);
  if (nextWk) {
    const target = WEEKDAYS[nextWk[1].toLowerCase()];
    if (target !== undefined) {
      const todayIso = todayLocalIso();
      const [y, m, d] = todayIso.split("-").map(Number);
      const todayDow = new Date(y, m - 1, d).getDay();
      let delta = target - todayDow;
      if (delta <= 0) delta += 7;
      return addDaysIso(todayIso, delta);
    }
  }

  // ISO
  if (ISO_RE.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return toIso(y, m, d);
  }

  // MM/DD/YYYY or M/D/YY
  const us = US_RE.exec(raw);
  if (us) {
    const m = Number(us[1]);
    const d = Number(us[2]);
    const y = expandYear(Number(us[3]));
    return toIso(y, m, d);
  }

  // MMDDYYYY pure digits
  const d8 = DIGITS_8.exec(raw);
  if (d8) {
    return toIso(Number(d8[3]), Number(d8[1]), Number(d8[2]));
  }
  const d6 = DIGITS_6.exec(raw);
  if (d6) {
    return toIso(expandYear(Number(d6[3])), Number(d6[1]), Number(d6[2]));
  }

  // "May 20 2026" / "May 20, 2026" / "20 May 2026"
  const cleaned = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ");
  if (parts.length === 3) {
    const tryMonthFirst = MONTHS[parts[0].toLowerCase()];
    const tryMonthSecond = MONTHS[parts[1].toLowerCase()];
    if (tryMonthFirst) {
      const day = Number(parts[1]);
      const year = expandYear(Number(parts[2]));
      const iso = toIso(year, tryMonthFirst, day);
      if (iso) return iso;
    }
    if (tryMonthSecond) {
      const day = Number(parts[0]);
      const year = expandYear(Number(parts[2]));
      const iso = toIso(year, tryMonthSecond, day);
      if (iso) return iso;
    }
  }

  return null;
}

/** Returns true if input parses to a real calendar date. Empty string is NOT valid. */
export function validateDateUS(input: string | null | undefined): boolean {
  return parseDateUS(input ?? "") !== null;
}

export interface SmartDateSuggestion {
  label: string;
  iso: string;
  display: string;
  hint?: string;
}

/** Build the smart suggestion list shown under the SmartDateInput. */
export function getSmartDateSuggestions(input: string): SmartDateSuggestion[] {
  const out: SmartDateSuggestion[] = [];
  const todayIso = todayLocalIso();
  const tomorrowIso = addDaysIso(todayIso, 1);

  // Always show today + tomorrow as anchors when input is empty or short.
  const raw = (input ?? "").trim();
  const showAnchors = raw.length < 3;

  // Parsed result first if any
  const parsed = parseDateUS(raw);
  if (parsed && raw.length > 0) {
    out.push({
      label: "Usar esta fecha",
      iso: parsed,
      display: formatDateUS(parsed),
      hint: raw,
    });
  }

  if (showAnchors || raw.toLowerCase().startsWith("to") || raw.toLowerCase().startsWith("ho")) {
    out.push({ label: "Hoy", iso: todayIso, display: formatDateUS(todayIso) });
  }
  if (showAnchors || raw.toLowerCase().startsWith("to") || raw.toLowerCase().startsWith("ma")) {
    out.push({ label: "Mañana", iso: tomorrowIso, display: formatDateUS(tomorrowIso) });
  }

  if (showAnchors || raw.toLowerCase().startsWith("ne") || raw.toLowerCase().startsWith("pr")) {
    // Next Friday
    const [y, m, d] = todayIso.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    let delta = 5 - dow;
    if (delta <= 0) delta += 7;
    const fri = addDaysIso(todayIso, delta);
    out.push({ label: "Próximo viernes", iso: fri, display: formatDateUS(fri) });
  }

  // Deduplicate by iso
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.iso) ? false : (seen.add(s.iso), true))).slice(0, 5);
}

/** Convenience: ISO today for callers that need it. */
export function todayIso(): string {
  return todayLocalIso();
}
