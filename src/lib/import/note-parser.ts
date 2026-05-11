/**
 * Conservative parser for free-text shift notes coming from Connecteam.
 *
 * Pure helper — no DB, no React. Only extracts structured hints; the
 * importer decides whether to write them and never overwrites existing
 * clean values without explicit rules.
 *
 * Recognized patterns (Spanish + English):
 *  - "punto de encuentro en <X>" / "meeting point <X>" / "meeting at <X>"
 *  - "a las 6 am" / "at 6:00am" / "06:00"
 *  - "driver carlos" / "conductor carlos"
 *
 * The parser is intentionally tolerant: anything it cannot extract with
 * confidence is left as `null` and the original note text is preserved.
 */

export interface ParsedNote {
  /** Original text, unchanged. */
  raw: string;
  /** Free-text candidate for the meeting point (no auto-link to canonical). */
  meetingPointText: string | null;
  /** "HH:MM" 24h, or null. */
  meetingTime: string | null;
  /** First-name hint, lowercased — never auto-assigned to a driver row. */
  driverHint: string | null;
  /** Confidence: "high" | "medium" | "low". `low` triggers NOTE_PARSE_NEEDS_REVIEW. */
  confidence: "high" | "medium" | "low";
}

const MEETING_POINT_RE =
  /(?:punto\s+de\s+encuentro(?:\s+(?:en|a))?|meeting\s+point(?:\s+at)?|meeting\s+at|nos\s+vemos\s+en)\s*[:\-]?\s*(.+?)(?=(?:\s*(?:\.|,)?\s*(?:a\s+las|at\s+\d|driver|conductor)\b)|[.\n]|$)/i;

const TIME_RE =
  /\b(?:a\s+las|@|at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i;

const TIME_NUMERIC_RE = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i;

const DRIVER_RE = /\b(?:driver|conductor|chofer)\s*[:\-]?\s*([a-záéíóúñ]+)/i;

function to24h(hourStr: string, minStr: string | undefined, ampm: string | undefined): string | null {
  let h = parseInt(hourStr, 10);
  const m = parseInt(minStr ?? "0", 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return null;
  const tag = (ampm ?? "").toLowerCase().replace(/\./g, "");
  if (tag === "am" || tag === "pm") {
    if (h < 1 || h > 12) return null;
    if (tag === "pm" && h !== 12) h += 12;
    if (tag === "am" && h === 12) h = 0;
  }
  if (m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseShiftNote(raw: string | null | undefined): ParsedNote {
  const text = (raw ?? "").trim();
  const result: ParsedNote = {
    raw: text,
    meetingPointText: null,
    meetingTime: null,
    driverHint: null,
    confidence: "high",
  };
  if (!text) return result;

  // Meeting point
  const mp = text.match(MEETING_POINT_RE);
  if (mp && mp[1]) {
    let candidate = mp[1].trim().replace(/[.;,]+$/g, "").trim();
    // Drop trailing time/driver fragments if they slipped through.
    candidate = candidate.replace(/\b(a\s+las|at)\s+\d.*$/i, "").trim();
    candidate = candidate.replace(/\b(driver|conductor|chofer)\b.*$/i, "").trim();
    if (candidate.length >= 2 && candidate.length <= 200) {
      result.meetingPointText = candidate;
    } else {
      result.confidence = "low";
    }
  }

  // Meeting time — prefer "a las HH(am|pm)" pattern, fallback to bare HH:MM.
  const tm = text.match(TIME_RE);
  if (tm) {
    const t = to24h(tm[1], tm[2], tm[3]);
    if (t) result.meetingTime = t;
  }
  if (!result.meetingTime) {
    const tm2 = text.match(TIME_NUMERIC_RE);
    if (tm2) {
      const t = to24h(tm2[1], tm2[2], tm2[3]);
      if (t) result.meetingTime = t;
    }
  }

  // Driver hint
  const dr = text.match(DRIVER_RE);
  if (dr && dr[1]) {
    const name = dr[1].trim().toLowerCase();
    if (name.length >= 2 && name.length <= 40) result.driverHint = name;
  }

  // If we extracted nothing meaningful, downgrade confidence so the importer
  // can flag NOTE_PARSE_NEEDS_REVIEW instead of silently dropping the note.
  const extracted = [result.meetingPointText, result.meetingTime, result.driverHint].filter(Boolean).length;
  if (extracted === 0) {
    result.confidence = text.length > 0 ? "low" : "high";
  } else if (extracted === 1 && !result.meetingPointText) {
    result.confidence = "medium";
  }

  return result;
}
