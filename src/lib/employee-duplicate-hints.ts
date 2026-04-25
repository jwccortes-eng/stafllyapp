/**
 * Employee duplicate-hint detector for the assignment selector.
 *
 * Pure helper — no DB, no React. The goal is to flag *possible* duplicates
 * when an operator is picking a worker for an orphan shift, so they don't
 * accidentally assign the wrong "Maria" or split history across two records.
 *
 * Detection rule (balanced — confirmed with the operator):
 *   Two workers are flagged as a *possible* duplicate group when they share
 *   ANY of the following:
 *     1. Same normalized phone number (digits only, ≥ 7 digits).
 *     2. Same normalized email (lower-case, trimmed).
 *     3. Same normalized full name (lower-case, accents stripped, trimmed).
 *
 * NOTE: We do NOT auto-merge anything. We only emit the set of employee ids
 * that participate in a duplicate group, plus a short reason per id.
 */

export interface DuplicateHintEmployee {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
}

/** Internal: digits-only normalization for phone numbers. */
function normPhone(v: string | null | undefined): string {
  if (!v) return "";
  const digits = String(v).replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

/** Internal: lower-case + trim for email. */
function normEmail(v: string | null | undefined): string {
  return (v ?? "").toString().trim().toLowerCase();
}

/** Internal: accent-stripped, lower-case, single-spaced full name. */
function normFullName(first: string | null | undefined, last: string | null | undefined): string {
  const raw = `${first ?? ""} ${last ?? ""}`.trim();
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface DuplicateHints {
  /** Map of employee id → short reason (e.g. "Same phone", "Same name"). */
  reasonById: Map<string, string>;
}

/**
 * Compute possible-duplicate hints across the given employees.
 * Returns a map from employee id to a short reason string, including only
 * the ids that participate in a group of size ≥ 2.
 */
export function computeDuplicateHints(employees: DuplicateHintEmployee[]): DuplicateHints {
  const byPhone = new Map<string, string[]>();
  const byEmail = new Map<string, string[]>();
  const byName = new Map<string, string[]>();

  for (const e of employees) {
    const p = normPhone(e.phone_number);
    if (p) {
      const arr = byPhone.get(p) ?? [];
      arr.push(e.id);
      byPhone.set(p, arr);
    }
    const em = normEmail(e.email);
    if (em) {
      const arr = byEmail.get(em) ?? [];
      arr.push(e.id);
      byEmail.set(em, arr);
    }
    const n = normFullName(e.first_name, e.last_name);
    if (n) {
      const arr = byName.get(n) ?? [];
      arr.push(e.id);
      byName.set(n, arr);
    }
  }

  const reasonById = new Map<string, string>();
  const tag = (ids: string[], reason: string) => {
    if (ids.length < 2) return;
    for (const id of ids) {
      // First reason wins; phone is checked first for stability.
      if (!reasonById.has(id)) reasonById.set(id, reason);
    }
  };

  for (const ids of byPhone.values()) tag(ids, "Same phone");
  for (const ids of byEmail.values()) tag(ids, "Same email");
  for (const ids of byName.values()) tag(ids, "Same name");

  return { reasonById };
}
