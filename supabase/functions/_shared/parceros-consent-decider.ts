/**
 * E5.6 / E5.7B — Parceros consent + visibility enforcement decider (pure).
 *
 * Pure synchronous helper. No DB, no network, no env reads, no side effects,
 * no Supabase imports. The caller resolves `status`, `visibility`, and `mode`
 * upstream (parceros-sync/index.ts) and passes them in.
 *
 * Contract:
 *   - mode="log_only" (default in production) → NEVER blocks.
 *   - mode="off"                              → NEVER blocks.
 *   - mode="enforce"                          → blocks unless
 *       consent.status === "granted" AND profile_visibility === "public".
 *
 * Fail-closed:
 *   - consent.status === "error"           → blocks under enforce.
 *   - profile_visibility null/undefined    → blocks under enforce (visibility_unknown).
 *   - profile_visibility any value other than "public" (including "private",
 *     "limited", legacy "hidden", or any unknown string) → blocks under enforce.
 *
 * E5.7B: the previous version only blocked when the literal string equalled
 * "hidden". The real Postgres enum `profile_visibility` is
 *   private | limited | public
 * so that check was a no-op. The operational rule is: only `public` is
 * publishable to the external Parceros sync; everything else is treated as
 * non-publishable until a richer marketplace-sharing model is defined.
 *
 * Per-field visibility flags (show_reputation, show_work_history, show_skills,
 * show_city, show_photo, show_first_name, show_last_name) are NOT evaluated
 * here. They are applied inside toParcerosSyncBody() and verified by E5.5.
 */

export type ConsentStatus = "granted" | "revoked" | "denied" | "missing" | "error";
export type EnforcementMode = "log_only" | "enforce" | "off";

export type BlockedReason =
  | "consent_missing"
  | "consent_revoked"
  | "consent_denied"
  | "consent_error"
  | "visibility_private"
  | "visibility_limited"
  | "visibility_hidden"
  | "visibility_unknown";

export interface DeciderVisibility {
  profile_visibility?: string | null;
}

export interface EnforcementDecision {
  /** Whether the payload should be pushed under the current mode. */
  allow: boolean;
  /** Reason the payload was blocked, or null when allowed. */
  blocked_reason: BlockedReason | null;
  /** Mode actually applied (normalized). */
  mode: EnforcementMode;
  /** Consent status echoed back for log emission. */
  consent_status: ConsentStatus;
  /** Whether enforce mode would have blocked (useful for log_only telemetry). */
  would_block_in_enforce: boolean;
}

export function normalizeMode(input: string | null | undefined): EnforcementMode {
  const v = (input ?? "log_only").toString().toLowerCase().trim();
  if (v === "enforce" || v === "off" || v === "log_only") return v;
  return "log_only";
}

/**
 * Evaluate visibility against the real enum (private | limited | public) plus
 * a fail-closed bucket for null/undefined/unknown values and the legacy
 * "hidden" string. Returns the BlockedReason or null when allowed.
 */
function visibilityBlockReason(
  visibility: DeciderVisibility | null | undefined,
): BlockedReason | null {
  const raw = visibility?.profile_visibility;
  if (raw === null || raw === undefined) return "visibility_unknown";
  const v = raw.toString().toLowerCase().trim();
  if (v === "public") return null;
  if (v === "private") return "visibility_private";
  if (v === "limited") return "visibility_limited";
  if (v === "hidden") return "visibility_hidden"; // legacy literal, preserved
  return "visibility_unknown";
}

/**
 * Decide whether a Parceros payload may be pushed.
 *
 * @param status     Consent status from worker_consent_records (data_sharing).
 * @param visibility Visibility row (only profile_visibility is read here).
 * @param mode       Enforcement mode (already normalized; or accepts raw string).
 */
export function decideEnforcement(
  status: ConsentStatus,
  visibility: DeciderVisibility | null | undefined,
  mode: EnforcementMode | string,
): EnforcementDecision {
  const normalizedMode = normalizeMode(mode);

  // Compute "would block in enforce" purely (independent of current mode).
  let wouldBlockReason: BlockedReason | null = null;
  if (status === "missing") wouldBlockReason = "consent_missing";
  else if (status === "revoked") wouldBlockReason = "consent_revoked";
  else if (status === "denied") wouldBlockReason = "consent_denied";
  else if (status === "error") wouldBlockReason = "consent_error";
  else if (status === "granted") wouldBlockReason = visibilityBlockReason(visibility);

  const wouldBlockInEnforce = wouldBlockReason !== null;

  // log_only and off never block in this phase.
  if (normalizedMode !== "enforce") {
    return {
      allow: true,
      blocked_reason: null,
      mode: normalizedMode,
      consent_status: status,
      would_block_in_enforce: wouldBlockInEnforce,
    };
  }

  // enforce
  return {
    allow: wouldBlockReason === null,
    blocked_reason: wouldBlockReason,
    mode: normalizedMode,
    consent_status: status,
    would_block_in_enforce: wouldBlockInEnforce,
  };
}
