/**
 * Global text formatting & sorting helpers.
 * These NEVER mutate stored data — display-only transformations.
 */

// ── Particles that stay lowercase in Spanish/English names ──
const LOWERCASE_PARTICLES = new Set([
  "de", "del", "la", "las", "los", "el", "y", "e",
  "da", "do", "dos", "van", "von", "di",
]);

/**
 * Capitalise a single word respecting particles.
 */
function capitalizeWord(word: string, isFirst: boolean): string {
  const lower = word.toLowerCase();
  if (!isFirst && LOWERCASE_PARTICLES.has(lower)) return lower;
  if (lower.length === 0) return "";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Format a person name for display (Title Case with particles).
 * Preserves accents (ñ, á, é …). Never mutates stored data.
 *
 * Examples:
 *   "JORGE CORTÉS" → "Jorge Cortés"
 *   "maria de los angeles" → "Maria de los Angeles"
 */
export function formatPersonName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";

  return trimmed
    .split(" ")
    .map((w, i) => capitalizeWord(w, i === 0))
    .join(" ");
}

type TextContext = "title" | "label" | "sentence" | "name" | "badge";

/**
 * General-purpose display formatter.
 *
 * - Removes ALL CAPS in UI text
 * - Applies proper casing based on context
 * - Preserves accents and special characters
 * - Trims double spaces
 */
export function formatDisplayText(
  value: string | null | undefined,
  context: TextContext = "sentence",
): string {
  if (!value) return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";

  // Check if text is ALL CAPS (3+ chars, all uppercase letters)
  const isAllCaps =
    trimmed.length >= 3 &&
    trimmed === trimmed.toUpperCase() &&
    /[A-ZÁÉÍÓÚÑÜ]/.test(trimmed);

  if (!isAllCaps) return trimmed;

  switch (context) {
    case "name":
      return formatPersonName(trimmed);

    case "title":
    case "badge":
    case "label":
      // Title Case: capitalise every word
      return trimmed
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");

    case "sentence":
    default:
      // Sentence case: first letter uppercase, rest lowercase
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
}

/**
 * Locale-aware, case/accent-insensitive comparator.
 * Use for sorting selects, lists, and default table ordering.
 *
 * Usage:  array.sort((a, b) => localeSort(a.name, b.name))
 */
export function localeSort(
  a: string | null | undefined,
  b: string | null | undefined,
  locale: string = "es",
): number {
  const sa = (a ?? "").toLowerCase();
  const sb = (b ?? "").toLowerCase();
  return sa.localeCompare(sb, locale, { sensitivity: "base", numeric: true });
}

/**
 * Sort an array of objects by a string key using localeSort.
 *
 * Usage:  localeSortBy(employees, "first_name")
 */
export function localeSortBy<T>(
  arr: T[],
  key: keyof T,
  locale: string = "es",
): T[] {
  return [...arr].sort((a, b) =>
    localeSort(a[key] as unknown as string, b[key] as unknown as string, locale),
  );
}

// ── Common short acronyms preserved as-is when formatting display names ──
const PRESERVED_ACRONYMS = new Set([
  "VIP", "USA", "US", "UK", "EU", "NYC", "LA", "DC", "DJ", "AV", "IT",
  "HR", "PR", "CEO", "CFO", "CTO", "COO", "BBQ", "FAQ", "ID", "TBA", "TBD",
  "JFK", "LAX", "ATL", "SF", "MIA", "QA", "QC", "NJ", "NY",
]);

/**
 * Format a free-form display name (client, job, location, title) for the UI.
 *
 * Rules:
 *  - Convert sustained ALL CAPS to Title Case (preserving short acronyms).
 *  - Collapse repeated dashes/pipes/double-spaces.
 *  - Replace heavy separators (" - ", " | ", " / ") with " · " for premium feel.
 *  - Keep mixed-case strings intact (already human-formatted).
 *  - Never truncate; truncation is a CSS concern.
 *
 * Examples:
 *   "CHEF KAUFMAN - 3"     → "Chef Kaufman · Team 3" (caller may map "- 3" → "Team 3")
 *   "CHEF KAUFMAN - 3"     → "Chef Kaufman · 3"
 *   "VIP Production - R..." → "VIP Production · R..."
 *   "ZEMER HALL"           → "Zemer Hall"
 *   "Passover - Team 2"    → "Passover · Team 2"
 */
export function formatDisplayName(value: string | null | undefined): string {
  if (!value) return "";
  let s = value.replace(/\s+/g, " ").trim();
  if (!s) return "";

  // If the input has NO uppercase letters at all, treat it as already
  // human-formatted lowercase (e.g. "vip production") and leave casing intact.
  const hasUppercase = /[A-ZÁÉÍÓÚÑÜ]/.test(s);

  // Collapse runs of separators
  s = s
    .replace(/\s*[-–—]{1,}\s*/g, " - ")
    .replace(/\s*\|\s*/g, " - ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s{2,}/g, " ");

  // English particles that stay lowercase mid-string (in addition to Spanish set)
  const EN_PARTICLES = new Set([
    "of", "and", "the", "for", "in", "on", "at", "to", "or", "a", "an", "by",
  ]);

  // Title-case word-by-word, preserving acronyms
  const words = s.split(" ").map((raw) => {
    if (!raw) return raw;

    // Pure separator passes through; will be normalised below
    if (raw === "-" || raw === "/" || raw === "·") return raw;

    // Preserve known acronyms (uppercase form)
    const upper = raw.toUpperCase();
    if (PRESERVED_ACRONYMS.has(upper)) return upper;

    // Token contains only digits/punct → keep as-is ("3", "#145")
    if (/^[\d#.\-]+$/.test(raw)) return raw;

    if (!hasUppercase) return raw; // user-typed lowercase: leave alone

    const letters = raw.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
    const isAllCaps = letters.length >= 2 && letters === letters.toUpperCase();
    const isAllLower = letters.length >= 2 && letters === letters.toLowerCase();

    // Mixed-case word inside a string that has uppercase elsewhere → keep
    if (!isAllCaps && !isAllLower) return raw;

    // ALL CAPS → Title Case; already lowercase → leave (might be a particle)
    if (isAllCaps) return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    return raw;
  });

  // Apply particle lowercase rule (except first word)
  const cased = words
    .map((w, i) => {
      if (i === 0) return w;
      const lower = w.toLowerCase();
      if (LOWERCASE_PARTICLES.has(lower) || EN_PARTICLES.has(lower)) return lower;
      return w;
    })
    .join(" ");

  // Replace heavy " - " separator with premium middle-dot
  return cased.replace(/ - /g, " · ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Unified period label: "Periodo N · YYYY-MM-DD → YYYY-MM-DD"
 * Falls back to date range when sequence_number is unavailable.
 */
export function formatPeriodLabel(
  startDate: string,
  endDate: string,
  sequenceNumber?: number | null,
  fallbackLabel?: string | null,
): string {
  const seq = sequenceNumber ? `Periodo ${sequenceNumber} · ` : "";
  const range = `${startDate} → ${endDate}`;
  if (seq) return `${seq}${range}`;
  if (fallbackLabel && fallbackLabel !== range) return fallbackLabel;
  return range;
}
