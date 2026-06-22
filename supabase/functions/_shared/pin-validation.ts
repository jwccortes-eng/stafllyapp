/**
 * Sprint S7-D — dual-mode PIN validation helper (demo-only consumer).
 *
 * Validates a plaintext 4-digit PIN against an optional bcrypt hash stored
 * in `employees.access_pin_hash` (S4) AND against the legacy plaintext
 * `employees.access_pin`. Returns a structured result that the caller
 * (employee-auth login, demo dual branch) uses for telemetry and gating.
 *
 * Hard rules:
 *   - Never logs the PIN, hash, password, token, or phone.
 *   - Never throws — every failure path returns { ok:false } with a category.
 *   - Hash comparison runs in-edge (pure Deno bcrypt). No DB RPC, no migration.
 *   - This helper is consumed ONLY by the demo dual branch. Legacy callers
 *     keep using their existing plaintext compare and are untouched.
 *
 * Acceptance gate (demo dual prototype):
 *   - hash present + bcrypt verify ok        → ok, source="hash"
 *   - hash present + bcrypt verify fails BUT plaintext matches
 *                                            → ok, source="plaintext_fallback"
 *                                              (S7-D: allow to avoid lockout
 *                                              during prototype rollout)
 *   - hash missing + plaintext matches       → ok, source="plaintext_fallback"
 *   - bcrypt module fails to load / throws   → fall through to plaintext
 *   - plaintext mismatch                     → not ok
 */

import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

export type PinValidationSource =
  | "hash"
  | "plaintext_fallback"
  | "plaintext_only";

export interface PinValidationInput {
  inputPin: string;
  storedPlaintext: string | null | undefined;
  storedHash: string | null | undefined;
  hashVersion: string | null | undefined;
}

export interface PinValidationResult {
  ok: boolean;
  source: PinValidationSource | null;
  // True iff a hash existed AND bcrypt verify failed even though plaintext
  // matched. Caller may log a safe telemetry event (no PIN/hash) for ops.
  hashMismatch: boolean;
  // True iff hash compare itself raised (module load failure, malformed hash).
  // Distinct from a clean "mismatch" because it indicates infra trouble.
  hashError: boolean;
}

const BCRYPT_PREFIX = /^\$2[abxy]\$/;

async function safeBcryptCompare(
  pin: string,
  hash: string,
): Promise<{ matched: boolean; threw: boolean }> {
  try {
    if (!BCRYPT_PREFIX.test(hash)) {
      // Defensive: unknown hash format. Treat as infra error, not mismatch.
      return { matched: false, threw: true };
    }
    const matched = await bcrypt.compare(pin, hash);
    return { matched, threw: false };
  } catch {
    return { matched: false, threw: true };
  }
}

export async function validatePinDual(
  input: PinValidationInput,
): Promise<PinValidationResult> {
  const { inputPin, storedPlaintext, storedHash } = input;

  if (!inputPin || typeof inputPin !== "string") {
    return { ok: false, source: null, hashMismatch: false, hashError: false };
  }

  const plaintextOk =
    !!storedPlaintext && storedPlaintext === inputPin;

  // No hash on file → degrade to plaintext-only path.
  if (!storedHash) {
    return {
      ok: plaintextOk,
      source: plaintextOk ? "plaintext_fallback" : null,
      hashMismatch: false,
      hashError: false,
    };
  }

  // Hash present → try hash-first.
  const { matched, threw } = await safeBcryptCompare(inputPin, storedHash);

  if (matched) {
    return { ok: true, source: "hash", hashMismatch: false, hashError: false };
  }

  // Hash present but did not verify (clean mismatch or infra error).
  // S7-D prototype: allow plaintext fallback to avoid lockouts.
  if (plaintextOk) {
    return {
      ok: true,
      source: "plaintext_fallback",
      hashMismatch: !threw,
      hashError: threw,
    };
  }

  return {
    ok: false,
    source: null,
    hashMismatch: !threw,
    hashError: threw,
  };
}
