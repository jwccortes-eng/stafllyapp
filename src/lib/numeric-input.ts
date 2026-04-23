/**
 * Numeric input helpers for forms that write into Postgres `double precision` /
 * `integer` columns. Solves three real bugs:
 *  1. "" passed to a numeric DB column → INSERT fails ("invalid input syntax")
 *  2. `Number("")` → 0 (silent overwrite when user clears a field)
 *  3. `parseFloat()` of garbage → NaN (rejected by Postgres or stored as null)
 *
 * Use in onChange where the form keeps a string draft, then call `toNumOrNull`
 * right before persisting.
 */

/** Convert a form draft string to a finite number, or `null` if empty/invalid. */
export function toNumOrNull(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Convert a form draft to an integer, or `null` if empty/invalid. */
export function toIntOrNull(raw: string | number | null | undefined): number | null {
  const n = toNumOrNull(raw);
  if (n === null) return null;
  return Math.trunc(n);
}

/**
 * Coerce required numeric value with a fallback (use for required configs
 * like `overdue_grace_days` where DB column is NOT NULL).
 * Returns the fallback when the user clears the field instead of silently 0.
 */
export function toNumOrFallback(raw: string | number | null | undefined, fallback: number): number {
  const n = toNumOrNull(raw);
  return n === null ? fallback : n;
}

/** Strip non-digit chars from input (for phones, IDs, postal codes). */
export function digitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}
