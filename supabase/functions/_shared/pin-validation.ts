/**
 * Sprint S7-D / S7-G — dual-mode PIN validation helper (demo-only consumer).
 *
 * Validates a plaintext 4-digit PIN against an optional bcrypt hash stored
 * in `employees.access_pin_hash` (S4) AND against the legacy plaintext
 * `employees.access_pin`. Returns a structured result that the caller
 * (employee-auth login / kiosk-clock / front-desk-checkin, demo dual branch)
 * uses for telemetry and gating.
 *
 * Hard rules:
 *   - Never logs the PIN, hash, password, token, or phone.
 *   - Never throws — every failure path returns { ok:false } with a category.
 *   - Hash comparison runs server-side via the `internal_verify_pin_hash`
 *     SECURITY DEFINER RPC (S7-G). JS bcrypt is no longer used because
 *     `deno.land/x/bcrypt@v0.4.1 compare()` fails in the Deno Edge runtime
 *     (no Web Worker support → hash_error in every call). See S7-F audit.
 *   - This helper is consumed ONLY by the demo dual branch. Legacy callers
 *     keep using their existing plaintext compare and are untouched.
 *
 * Acceptance gate (demo dual prototype):
 *   - hash present + RPC verify ok           → ok, source="hash"
 *   - hash present + RPC verify fails BUT plaintext matches
 *                                            → ok, source="plaintext_fallback"
 *                                              (allow to avoid lockout during
 *                                              prototype rollout)
 *   - hash missing + plaintext matches       → ok, source="plaintext_fallback"
 *   - RPC throws / network blip + plaintext matches
 *                                            → ok, source="plaintext_fallback"
 *                                              with hashError=true
 *   - plaintext mismatch                     → not ok
 */

export type PinValidationSource =
  | "hash"
  | "plaintext_fallback"
  | "plaintext_only";

// Minimal structural type for the service-role supabase client. We avoid
// importing the SDK here to keep this helper dependency-free.
export interface PinHashRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
}

export interface PinValidationInput {
  inputPin: string;
  storedPlaintext: string | null | undefined;
  storedHash: string | null | undefined;
  hashVersion: string | null | undefined;
  // S7-G: required to use DB-backed hash verification. When missing, the
  // helper degrades to plaintext-only (hash compare skipped entirely).
  employeeId?: string | null;
  client?: PinHashRpcClient | null;
}

export interface PinValidationResult {
  ok: boolean;
  source: PinValidationSource | null;
  // True iff a hash existed AND RPC verify cleanly returned false even though
  // plaintext matched. Caller may log a safe telemetry event (no PIN/hash).
  hashMismatch: boolean;
  // True iff the RPC itself raised or returned an error. Distinct from a
  // clean "mismatch" because it indicates infra trouble.
  hashError: boolean;
}

async function safeRpcVerify(
  client: PinHashRpcClient,
  employeeId: string,
  pin: string,
): Promise<{ matched: boolean; threw: boolean }> {
  try {
    const { data, error } = await client.rpc("internal_verify_pin_hash", {
      _employee_id: employeeId,
      _pin: pin,
    });
    if (error) return { matched: false, threw: true };
    return { matched: data === true, threw: false };
  } catch {
    return { matched: false, threw: true };
  }
}

export async function validatePinDual(
  input: PinValidationInput,
): Promise<PinValidationResult> {
  const { inputPin, storedPlaintext, storedHash, employeeId, client } = input;

  if (!inputPin || typeof inputPin !== "string") {
    return { ok: false, source: null, hashMismatch: false, hashError: false };
  }

  const plaintextOk = !!storedPlaintext && storedPlaintext === inputPin;

  // No hash on file, or missing RPC plumbing → degrade to plaintext-only.
  if (!storedHash || !employeeId || !client) {
    return {
      ok: plaintextOk,
      source: plaintextOk ? "plaintext_fallback" : null,
      hashMismatch: false,
      hashError: false,
    };
  }

  // Hash present → try hash-first via DB RPC.
  const { matched, threw } = await safeRpcVerify(client, employeeId, inputPin);

  if (matched) {
    return { ok: true, source: "hash", hashMismatch: false, hashError: false };
  }

  // Hash present but did not verify (clean mismatch or infra error).
  // Prototype: allow plaintext fallback to avoid lockouts.
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
