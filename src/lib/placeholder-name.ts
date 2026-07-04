/**
 * Placeholder name detection · Phase 2C-C
 *
 * Shared, side-effect-free helper used by:
 *  - Frontend surfaces (data-quality risks, identity UIs)
 *  - Edge import functions (Connecteam / bulk imports) — regex mirrored inline
 *    in Deno code since edge functions cannot import from src/.
 *
 * If you change patterns here, mirror them in:
 *   supabase/functions/import-inactive-employees/index.ts (PLACEHOLDER_NAME_RE)
 */

// Broadened placeholder pattern: covers names that begin with a generic
// placeholder token like "System 3", "SYSTEM", "User Pend 12", "Unknown Worker",
// "Temp 1", "Temporary", "Placeholder", "Pending Identity", "Pend 4".
// Anchored at the start; case-insensitive; the trailing token is optional so
// bare "System" / "Unknown" also match.
export const PLACEHOLDER_NAME_RE =
  /^\s*(system|user\s*pend(iente)?|unknown|temp(orary)?|placeholder|pending|pend)\b/i;

export interface PlaceholderCandidate {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}

/** True when the incoming (imported) name looks like a placeholder. */
export function isPlaceholderName(c: PlaceholderCandidate | null | undefined): boolean {
  if (!c) return false;
  const full = (
    c.full_name ?? `${c.first_name ?? ""} ${c.last_name ?? ""}`
  )
    .trim();
  if (!full) return false;
  return PLACEHOLDER_NAME_RE.test(full);
}
