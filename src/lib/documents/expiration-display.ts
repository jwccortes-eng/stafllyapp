/**
 * expiration-display.ts — presentational helpers for document expiration.
 *
 * Some historical records use a far-future sentinel (e.g. 3000-01-01) to mean
 * "does not expire". We never rewrite the DB value; we just render it as
 * "No requiere vencimiento" so admins are not confused by "01/01/3000".
 *
 * No writes, no schema changes. Frontend-only.
 */
import { formatDateUS } from "@/lib/date-format";

/** Any year >= 2999 is treated as a "never expires" sentinel. */
export function isSentinelExpiration(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCFullYear() >= 2999;
}

/**
 * Format an expiration date for display.
 *  - null/empty  → returns `fallback` (default "—")
 *  - sentinel    → "No requiere vencimiento"
 *  - otherwise   → MM/DD/YYYY via formatDateUS
 */
export function formatExpirationDisplay(
  value: string | Date | null | undefined,
  fallback: string = "—",
): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  if (d.getUTCFullYear() >= 2999) return "No requiere vencimiento";
  return formatDateUS(d) || fallback;
}
