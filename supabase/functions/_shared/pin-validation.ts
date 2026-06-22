/**
 * Sprint S7-D / S7-G / S7-K — dual-mode PIN validation helper (demo-only consumer).
 *
 * Validates a plaintext 4-digit PIN against an optional bcrypt hash stored
 * in `employees.access_pin_hash` (S4) AND against the legacy plaintext
 * `employees.access_pin`. Returns a structured result that the caller
 * (employee-auth login / kiosk-clock / front-desk-checkin, demo dual branch)
 * uses for telemetry and gating.
 *
 * Modes (S7-K capability, NOT yet activated on any tenant):
 *   - "dual"             — hash-first + plaintext fallback (current demo prod mode)
 *   - "hash_only_ready"  — hash-first only, plaintext fallback SUPPRESSED; same
 *                          generic failure shape as wrong PIN. Plaintext data
 *                          is NEVER touched. Telemetry records why the
 *                          suppression happened so we can measure impact
 *                          before considering a real flip.
 *
 * Hard rules:
 *   - Never logs the PIN, hash, password, token, email, or phone.
 *   - Never throws — every failure path returns { ok:false } with a category.
 *   - Hash comparison runs server-side via the `internal_verify_pin_hash`
 *     SECURITY DEFINER RPC (S7-G). JS bcrypt is no longer used.
 *   - Real tenants always force "legacy" upstream and never reach this helper.
 *   - hash_only_ready does NOT delete plaintext, does NOT touch authPassword,
 *     and does NOT change the user-facing error string.
 */

export type PinValidationMode = "dual" | "hash_only_ready";

export type PinValidationSource =
  | "hash"
  | "plaintext_fallback"
  | "plaintext_only";

export type PinSuppressedReason =
  | "missing_hash"
  | "hash_mismatch"
  | "hash_error";

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
  // S7-G: required to use DB-backed hash verification. When missing under
  // "dual", the helper degrades to plaintext-only. Under "hash_only_ready"
  // a missing employeeId/client is treated as hash_error (fail-closed).
  employeeId?: string | null;
  client?: PinHashRpcClient | null;
  // S7-K: mode selector. Defaults to "dual" for back-compat with existing
  // callers. Hard rule: only Stafly Demo may ever resolve to a non-legacy
  // mode upstream — this helper does NOT re-check tenant scope.
  mode?: PinValidationMode;
}

export interface PinValidationResult {
  ok: boolean;
  source: PinValidationSource | null;
  // True iff a hash existed AND RPC verify cleanly returned false even though
  // plaintext matched (dual mode only). Caller may log a safe telemetry event.
  hashMismatch: boolean;
  // True iff the RPC itself raised or returned an error. Distinct from a
  // clean "mismatch" because it indicates infra trouble.
  hashError: boolean;
  // S7-K: true iff the helper would have allowed login under "dual" via the
  // plaintext fallback path, but suppressed it because mode="hash_only_ready".
  // Always false in "dual" mode. Useful for measuring real-world impact of a
  // future flip without changing user behavior.
  fallbackSuppressed: boolean;
  // S7-K: set only when fallbackSuppressed=true. Categorizes why the
  // hash-first decision failed.
  suppressedReason: PinSuppressedReason | null;
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
  const mode: PinValidationMode = input.mode ?? "dual";

  const empty = (): PinValidationResult => ({
    ok: false,
    source: null,
    hashMismatch: false,
    hashError: false,
    fallbackSuppressed: false,
    suppressedReason: null,
  });

  if (!inputPin || typeof inputPin !== "string") {
    return empty();
  }

  const plaintextOk = !!storedPlaintext && storedPlaintext === inputPin;

  // ---------- Mode: hash_only_ready (capability only — not activated) ----------
  if (mode === "hash_only_ready") {
    // Missing hash → fail-closed; no plaintext compare even if plaintext would match.
    if (!storedHash) {
      return {
        ok: false,
        source: null,
        hashMismatch: false,
        hashError: false,
        // Only mark suppression if plaintext *would* have allowed login under dual.
        fallbackSuppressed: plaintextOk,
        suppressedReason: "missing_hash",
      };
    }
    // Missing RPC plumbing (employeeId/client) → treat as infra error, fail-closed.
    if (!employeeId || !client) {
      return {
        ok: false,
        source: null,
        hashMismatch: false,
        hashError: true,
        fallbackSuppressed: plaintextOk,
        suppressedReason: "hash_error",
      };
    }
    const { matched, threw } = await safeRpcVerify(client, employeeId, inputPin);
    if (matched) {
      return {
        ok: true,
        source: "hash",
        hashMismatch: false,
        hashError: false,
        fallbackSuppressed: false,
        suppressedReason: null,
      };
    }
    return {
      ok: false,
      source: null,
      hashMismatch: !threw,
      hashError: threw,
      fallbackSuppressed: plaintextOk,
      suppressedReason: threw ? "hash_error" : "hash_mismatch",
    };
  }

  // ---------- Mode: dual (current demo behavior — unchanged from S7-G) ----------
  // No hash on file, or missing RPC plumbing → degrade to plaintext-only.
  if (!storedHash || !employeeId || !client) {
    return {
      ok: plaintextOk,
      source: plaintextOk ? "plaintext_fallback" : null,
      hashMismatch: false,
      hashError: false,
      fallbackSuppressed: false,
      suppressedReason: null,
    };
  }

  // Hash present → try hash-first via DB RPC.
  const { matched, threw } = await safeRpcVerify(client, employeeId, inputPin);

  if (matched) {
    return {
      ok: true,
      source: "hash",
      hashMismatch: false,
      hashError: false,
      fallbackSuppressed: false,
      suppressedReason: null,
    };
  }

  // Hash present but did not verify (clean mismatch or infra error).
  // Prototype: allow plaintext fallback to avoid lockouts.
  if (plaintextOk) {
    return {
      ok: true,
      source: "plaintext_fallback",
      hashMismatch: !threw,
      hashError: threw,
      fallbackSuppressed: false,
      suppressedReason: null,
    };
  }

  return {
    ok: false,
    source: null,
    hashMismatch: !threw,
    hashError: threw,
    fallbackSuppressed: false,
    suppressedReason: null,
  };
}
