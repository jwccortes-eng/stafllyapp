/**
 * Parceros Payload Guardrail — E5.3
 *
 * Defensive exclusion list for keys that MUST NEVER leave the Stafly boundary
 * via any Parceros payload. Used by parceros-payload.ts at the end of
 * toParcerosSyncBody and by parceros-payload_test.ts for CI enforcement.
 *
 * Runtime mode is controlled by PARCEROS_GUARDRAIL_MODE:
 *   - unset / "warn" (default) → console.warn only, never throws
 *   - "enforce"                → throws Error (NOT enabled in production as of E5.3)
 *
 * This helper does NOT mutate input and does NOT change the toParcerosSyncBody
 * contract. It is a pure assertion lateral.
 */

export const PARCEROS_FORBIDDEN_KEYS: ReadonlyArray<string> = [
  // Private review content
  "comment", "comments", "note", "notes", "private", "private_notes",
  "tag", "tags", "flag", "flags",
  "reviewer", "reviewer_id", "reviewer_name",
  // Operational / tenant identifiers
  "shift_id", "client_id", "client_name",
  "location_id", "location_name",
  "company_id", "company_name", "tenant_id",
  "employee_id", "internal_id",
  "reviewed_employee_id", "worker_profile_id",
  // Fiscal & PII
  "ssn", "ein", "tax_id",
  "phone", "phone_number", "email", "address",
] as const;

const FORBIDDEN_SET = new Set(PARCEROS_FORBIDDEN_KEYS.map((k) => k.toLowerCase()));

/** Allowlist — intentional contract IDs that must NOT trigger guardrail. */
export const PARCEROS_ALLOWED_KEYS: ReadonlyArray<string> = [
  "external_worker_id",
  "stafly_worker_id",
] as const;

/**
 * Path-scoped allowlist: `{key}` is permitted ONLY when the JSON path
 * matches one of these substrings. Used for legitimate contract fields
 * whose key name collides with a generically-forbidden token.
 *
 * Example: `work_history[].company_name` is the past employer's public
 * name (verified work history), NOT the Stafly tenant name.
 */
const PATH_SCOPED_ALLOWLIST: ReadonlyArray<{ key: string; pathContains: string }> = [
  { key: "company_name", pathContains: ".work_history[" },
];

function isAllowedAtPath(key: string, path: string): boolean {
  const k = key.toLowerCase();
  for (const rule of PATH_SCOPED_ALLOWLIST) {
    if (rule.key === k && path.includes(rule.pathContains)) return true;
  }
  return false;
}

export interface ForbiddenHit {
  key: string;
  path: string;
}

/** Recursively scan a value and return every forbidden key occurrence with JSON path. */
export function findForbiddenKeys(value: unknown, path = "$"): ForbiddenHit[] {
  const hits: ForbiddenHit[] = [];
  if (value === null || value === undefined) return hits;
  if (typeof value !== "object") return hits;

  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      hits.push(...findForbiddenKeys(v, `${path}[${i}]`));
    });
    return hits;
  }

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${k}`;
    if (FORBIDDEN_SET.has(k.toLowerCase()) && !isAllowedAtPath(k, childPath)) {
      hits.push({ key: k, path: childPath });
    }
    hits.push(...findForbiddenKeys(v, childPath));
  }
  return hits;
}

/**
 * Assert that `value` contains no forbidden keys anywhere in its tree.
 * Behavior depends on PARCEROS_GUARDRAIL_MODE env var.
 * Default = "warn": logs to console, never throws. Never blocks sync.
 */
export function assertNoForbiddenKeys(value: unknown, context = "parceros-payload"): ForbiddenHit[] {
  const hits = findForbiddenKeys(value);
  if (hits.length === 0) return hits;

  let mode = "warn";
  try {
    // Deno is available in edge runtime; guarded for non-Deno test environments.
    // deno-lint-ignore no-explicit-any
    const denoGlobal = (globalThis as any).Deno;
    if (denoGlobal && typeof denoGlobal.env?.get === "function") {
      mode = String(denoGlobal.env.get("PARCEROS_GUARDRAIL_MODE") ?? "warn").toLowerCase();
    }
  } catch {
    mode = "warn";
  }

  const summary = `[${context}] Forbidden key(s) detected in Parceros payload: ` +
    hits.map((h) => `${h.key} @ ${h.path}`).join(", ");

  if (mode === "enforce") {
    throw new Error(summary);
  }
  // Default: warn-only. Never block sync.
  console.warn(summary);
  return hits;
}
