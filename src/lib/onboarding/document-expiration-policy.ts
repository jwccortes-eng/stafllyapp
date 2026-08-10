/**
 * Document Expiration Policy — v1 (visibility only).
 *
 * Declares which document categories MAY/SHOULD carry an expiration date.
 * This is read-only metadata used by the UI to:
 *  - show "Missing expiration" hints,
 *  - show the SmartDateInput in the worker upload flow,
 *  - explain why a category is OK without an expiration date.
 *
 * No enforcement, no blocking, no notifications, no payroll impact.
 */
import type { DocumentCategory } from "@/lib/onboarding/required-documents";

export type ExpirationPolicy = "required" | "recommended" | "optional" | "not_applicable";

/** Map a category → its expiration policy. Anything missing defaults to "optional". */
export const EXPIRATION_POLICY: Record<DocumentCategory, ExpirationPolicy> = {
  drivers_license:    "required",
  work_authorization: "required",
  id:                 "optional",      // some IDs expire, some don't
  background_check:   "recommended",
  tax_form:           "not_applicable",
  w9:                 "not_applicable",
  contract:           "optional",
  other:              "optional",
};

export function expirationPolicyFor(category: string | null | undefined): ExpirationPolicy {
  if (!category) return "optional";
  return (EXPIRATION_POLICY as Record<string, ExpirationPolicy>)[category] ?? "optional";
}

export const EXPIRATION_POLICY_LABEL: Record<ExpirationPolicy, string> = {
  required:       "Vencimiento obligatorio",
  recommended:    "Vencimiento recomendado",
  optional:       "Vencimiento opcional",
  not_applicable: "No necesita vencimiento",
};

/** Derived expiration state for a single document (already classified by signals). */
export type ExpirationState =
  | "no_expiration_needed"
  | "missing_expiration"
  | "valid"
  | "expiring_soon"
  | "expired";

const EXPIRING_SOON_DAYS = 30;

export function classifyExpiration(
  category: string | null | undefined,
  expires_at: string | null | undefined,
): ExpirationState {
  const policy = expirationPolicyFor(category);
  if (!expires_at) {
    if (policy === "required" || policy === "recommended") return "missing_expiration";
    return "no_expiration_needed";
  }
  const t = new Date(expires_at).getTime();
  if (Number.isNaN(t)) return "no_expiration_needed";
  const now = Date.now();
  if (t <= now) return "expired";
  const days = (t - now) / (1000 * 60 * 60 * 24);
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "valid";
}

export const EXPIRATION_STATE_LABEL: Record<ExpirationState, string> = {
  no_expiration_needed: "No necesita vencimiento",
  missing_expiration:   "Falta vencimiento",
  valid:                "Vigente",
  expiring_soon:        "Por vencer",
  expired:              "Vencido",
};
