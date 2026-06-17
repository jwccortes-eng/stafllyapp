/**
 * ConsentGate — presentational gate that conditionally renders its children
 * only when the worker has granted consent for the given cross-tenant surface
 * (Parceros, public Passport, Referrals).
 *
 * @status foundation-only — do not wire until E2 approved
 *
 * This is a STUB. It accepts `hasConsent` as a prop so it can be unit-tested
 * and remains inert until E3 wires it to `useWorkerConsent`. It does NOT
 * read from `worker_consent_records`, does NOT call Supabase, and does NOT
 * mutate any state.
 *
 * See: docs/ECOSYSTEM_PROFILE_STANDARD.md
 */
import type { ReactNode } from "react";

export type ConsentGateType = "parceros" | "passport" | "referrals";

interface ConsentGateProps {
  type: ConsentGateType;
  hasConsent: boolean;
  children: ReactNode;
  /** Optional render when consent is not granted. Defaults to null. */
  fallback?: ReactNode;
}

export function ConsentGate({
  hasConsent,
  children,
  fallback = null,
}: ConsentGateProps) {
  if (!hasConsent) return <>{fallback}</>;
  return <>{children}</>;
}
