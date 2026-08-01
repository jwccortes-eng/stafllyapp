/**
 * Pure presentational helpers for shift cards across calendar / list views.
 *
 * Goals (UI-only, no DB writes):
 *   - Stop showing the legacy `shift_code` as the dominant title.
 *   - Avoid duplicates like "#0258 #0258 TURNO" when the title itself starts
 *     with a hash-prefixed code (legacy imports, Connecteam fallbacks, etc.).
 *   - Provide a humane fallback when the title is empty or generic.
 */

const LEADING_REF_PATTERN = /^\s*#?0*\d{2,6}\s*[-:·•|]?\s*/i;
const GENERIC_TITLES = new Set([
  "",
  "turno",
  "shift",
  "untitled",
  "sin titulo",
  "sin título",
]);

/** Remove leading "#0258 " / "0258 - " style prefixes so the human title
 *  is what reads first. The original `shift_code` is still available via the
 *  Ref chip on the card. */
export function stripLeadingShiftCode(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.trim();
  // strip up to two leading code-like prefixes (covers "#0258 #0258 TURNO")
  for (let i = 0; i < 2; i++) {
    const next = s.replace(LEADING_REF_PATTERN, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

export interface DisplayTitleInput {
  title?: string | null;
  shift_code?: string | null;
  clientName?: string | null;
  locationName?: string | null;
  category?: string | null;
}

/** Compute the visible title for a shift card.
 *  Priority: cleaned manual title → "{client} · {category}" →
 *  "{location} · {category}" → "Turno sin título". */
export function buildShiftCardTitle(input: DisplayTitleInput): string {
  const cleaned = stripLeadingShiftCode(input.title ?? "");
  if (cleaned && !GENERIC_TITLES.has(cleaned.toLowerCase())) return cleaned;

  const category = (input.category ?? "").trim();
  const client = (input.clientName ?? "").trim();
  const location = (input.locationName ?? "").trim();

  if (client) return category ? `${client} · ${category}` : client;
  if (location) return category ? `${location} · ${category}` : location;
  return "Turno sin título";
}

/**
 * @deprecated P0 · SHIFT IDENTITY: el número visible es `shift_ref`.
 * Usa `getShiftDisplayIdentity`. Este helper sólo sobrevive para trazas de import.
 */
export function formatShiftRef(code: string | null | undefined): string | null {
  if (!code) return null;
  const padded = String(code).padStart(4, "0");
  return `Ref #${padded}`;
}
