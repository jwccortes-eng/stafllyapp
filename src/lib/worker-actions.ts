/**
 * Worker operational state map + action permissions.
 *
 * Single source of truth for "what can the operator do with this worker?".
 * Mirrors the visible badges (PortalAccessBadge, PremiumStatusBadge) without
 * touching schema or backend logic — purely a UI safety + clarity layer.
 *
 * Status legend (derived from existing columns):
 *   inactive       → is_active === false                       → reactivate first
 *   active         → has user_id (portal accessed)              → no activation CTA
 *   invite_failed  → last invitation in failed/bounced/dlq      → re-invite recommended
 *   invited        → invitation exists, not failed, not active  → resend allowed
 *   ready          → has phone + PIN, no invitation, no portal  → invite recommended
 *   incomplete     → missing phone or PIN                       → resolve gaps first
 *
 * Note: there is no schema-level "blocked" today; we treat `is_active=false`
 * as the only critical block. Everything else is operational guidance.
 */

import { isInviteStatusFailure } from "@/lib/invitation-status";
import type { EmployeeInvitation } from "@/hooks/useEmployeeInvitations";

export type WorkerOperationalStatus =
  | "inactive"
  | "active"
  | "invite_failed"
  | "invited"
  | "ready"
  | "incomplete";

export interface WorkerLike {
  id?: string;
  is_active?: boolean | null;
  user_id?: string | null;
  access_pin?: string | null;
  phone_number?: string | null;
  email?: string | null;
}

const digits = (v: unknown) => (v == null ? "" : String(v).replace(/\D/g, ""));

export function getWorkerOperationalStatus(
  w: WorkerLike,
  invitation?: EmployeeInvitation | null,
): WorkerOperationalStatus {
  if (w.is_active === false) return "inactive";
  if (w.user_id) return "active";
  if (invitation && isInviteStatusFailure(invitation.status)) return "invite_failed";
  if (invitation) return "invited";
  const hasPhone = !!digits(w.phone_number);
  const hasPin = !!(w.access_pin ?? "").toString().trim();
  return hasPhone && hasPin ? "ready" : "incomplete";
}

// ── Action permissions ──────────────────────────────────────────────────────

export interface ActionDecision {
  /** Whether the action should be enabled. */
  allowed: boolean;
  /** Short, operator-facing reason (used for tooltip / disabled hint). */
  reason?: string;
}

/** Send a brand-new invite. */
export function canInviteWorker(
  w: WorkerLike,
  invitation?: EmployeeInvitation | null,
): ActionDecision {
  if (w.is_active === false) return { allowed: false, reason: "Reactivate the worker before inviting." };
  if (w.user_id) return { allowed: true, reason: "Worker already has portal access — sending a fresh invite is optional." };
  const hasPhone = !!digits(w.phone_number);
  const hasEmail = !!w.email;
  if (!hasPhone && !hasEmail) return { allowed: false, reason: "Add a phone or email before inviting." };
  if (invitation && isInviteStatusFailure(invitation.status)) {
    return { allowed: true, reason: "Last invite failed — a retry will create a fresh attempt." };
  }
  return { allowed: true };
}

/** Resend an existing invite (only relevant when one already exists). */
export function canResendInvite(
  w: WorkerLike,
  invitation?: EmployeeInvitation | null,
): ActionDecision {
  if (w.is_active === false) return { allowed: false, reason: "Reactivate the worker first." };
  if (!invitation) return { allowed: false, reason: "No invitation to resend yet — send the first invite." };
  const hasPhone = !!digits(w.phone_number);
  const hasEmail = !!w.email;
  if (!hasPhone && !hasEmail) return { allowed: false, reason: "Add a phone or email before resending." };
  return { allowed: true };
}

/** Activate (reactivate) a previously archived worker. */
export function canActivateWorker(w: WorkerLike): ActionDecision {
  if (w.is_active !== false) return { allowed: false, reason: "Worker is already active." };
  return { allowed: true };
}

/** Archive an active worker. */
export function canArchiveWorker(w: WorkerLike): ActionDecision {
  if (w.is_active === false) return { allowed: false, reason: "Worker is already archived." };
  return { allowed: true };
}

/** Edit profile fields. Archived workers stay editable for clean-up. */
export function canEditWorker(_w: WorkerLike): ActionDecision {
  return { allowed: true };
}

/** Bulk-action eligibility: workers whose last invite failed. */
export function isWorkerInviteFailed(
  w: WorkerLike,
  invitation?: EmployeeInvitation | null,
): boolean {
  return getWorkerOperationalStatus(w, invitation) === "invite_failed";
}
