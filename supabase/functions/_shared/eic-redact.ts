// EIC Token Redaction — shared sanitizer for any edge function that
// touches Ecosystem Identity Checkpoint RPC responses.
//
// Rules:
//   - Deep-walk any object/array, no mutation of input.
//   - Strip exact keys (case-insensitive) on the denylist at any depth.
//   - Never return token values (no truncation, no hashing, no prefix/suffix).
//   - Where a denied key existed, sibling indicators
//     (`match_token_returned`, `token_not_logged`) are injected so the
//     caller can prove a token was issued without leaking it.
//   - `buildEicSafeResponse` is allowlist-first: any future RPC column
//     is dropped unless explicitly added here.

const DENY_KEYS_LOWER: ReadonlySet<string> = new Set([
  "match_token",
  "token",
  "p_match_token",
  "signed_token",
  "eic_token",
  "match_token_hash",
  "signature",
  "hmac",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Recursively strip token-bearing keys from any value. Returns a fresh
 * copy; input is never mutated. Where a denied key existed on an object,
 * the sibling indicators `match_token_returned: true` and
 * `token_not_logged: true` are added (unless already present and truthy).
 */
export function deepRedactTokens(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepRedactTokens(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  let hadToken = false;

  for (const [key, v] of Object.entries(value)) {
    if (DENY_KEYS_LOWER.has(key.toLowerCase())) {
      hadToken = true;
      continue; // drop entirely; never serialize the value
    }
    out[key] = deepRedactTokens(v);
  }

  if (hadToken) {
    if (out.match_token_returned !== true) out.match_token_returned = true;
    if (out.token_not_logged !== true) out.token_not_logged = true;
  }

  return out;
}

// Allowlist for EIC lookup result rows. Anything outside this list is dropped.
const SAFE_FIELDS = [
  "match_strength",
  "reasons",
  "source_company_name",
  "masked_name",
  "masked_phone",
  "masked_email",
] as const;

type SafeRow = Partial<Record<(typeof SAFE_FIELDS)[number], unknown>> & {
  match_token_returned: boolean;
  token_not_logged: true;
};

/**
 * Allowlist-first projection of a raw EIC RPC row. Returns ONLY the
 * declared safe fields plus boolean indicators. New RPC columns added
 * upstream will NOT leak through automatically — they must be added to
 * SAFE_FIELDS deliberately after a redaction review.
 */
export function buildEicSafeResponse(rpcRow: unknown): SafeRow {
  const row = isPlainObject(rpcRow) ? rpcRow : {};

  // Detect token presence at any depth before redaction.
  const hadToken = hasAnyDeniedKey(row);

  const safe: SafeRow = {
    match_token_returned: hadToken,
    token_not_logged: true,
  };

  for (const field of SAFE_FIELDS) {
    if (field in row) {
      // Mask-shaped values are scalars (string/array of strings). Still
      // run them through deepRedactTokens defensively in case upstream
      // ever nests a token under one of these names.
      safe[field] = deepRedactTokens(row[field]);
    }
  }

  return safe;
}

function hasAnyDeniedKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasAnyDeniedKey);
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (DENY_KEYS_LOWER.has(key.toLowerCase())) return true;
    if (hasAnyDeniedKey(value[key])) return true;
  }
  return false;
}

export const __INTERNAL__ = { DENY_KEYS_LOWER, SAFE_FIELDS };
