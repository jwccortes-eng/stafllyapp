/**
 * E5.6 — Parceros consent + visibility enforcement decider (pure).
 *
 * Pure synchronous helper. No DB, no network, no env reads, no side effects,
 * no Supabase imports. The caller resolves `status`, `visibility`, and `mode`
 * upstream (parceros-sync/index.ts) and passes them in.
 *
 * Contract:
 *   - mode="log_only" (default in production at E5.6 close) → NEVER blocks.
 *   - mode="off"                                            → NEVER blocks.
 *   - mode="enforce"                                        → blocks unless
 *       consent.status === "granted" AND visibility != "hidden".
 *
 * Fail-closed: consent.status === "error" blocks under enforce.
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
  | "visibility_hidden";

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
  const isHidden = (visibility?.profile_visibility ?? "").toString().toLowerCase() === "hidden";

  // Compute "would block in enforce" purely (independent of current mode).
  let wouldBlockReason: BlockedReason | null = null;
  if (status === "missing") wouldBlockReason = "consent_missing";
  else if (status === "revoked") wouldBlockReason = "consent_revoked";
  else if (status === "denied") wouldBlockReason = "consent_denied";
  else if (status === "error") wouldBlockReason = "consent_error";
  else if (status === "granted" && isHidden) wouldBlockReason = "visibility_hidden";

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
