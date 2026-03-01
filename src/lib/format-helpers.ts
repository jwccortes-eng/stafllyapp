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
