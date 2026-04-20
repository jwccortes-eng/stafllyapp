/**
 * Profile status helpers for STAFly employees.
 *
 * The DB enum `employee_profile_status` is the source of truth.
 * Computation lives server-side (compute_employee_profile_status), but this
 * module mirrors the same checks for client-side hints inside the wizard.
 */

import type { Database } from "@/integrations/supabase/types";

export type ProfileStatus = Database["public"]["Enums"]["employee_profile_status"];

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  incomplete: "Incomplete",
  pending_documents: "Missing documents",
  ready: "Ready",
  active: "Active",
};

/** Tailwind classes — uses semantic tokens from the design system, no hardcoded colors. */
export const PROFILE_STATUS_TONES: Record<ProfileStatus, string> = {
  incomplete:        "bg-deduction/10 text-deduction border-deduction/20",
  pending_documents: "bg-warning/10 text-warning border-warning/20",
  ready:             "bg-primary/10 text-primary border-primary/20",
  active:            "bg-earning/10 text-earning border-earning/20",
};

export function isReadyForShifts(status: ProfileStatus): boolean {
  return status === "ready" || status === "active";
}

/** Personal-info readiness — same fields the DB function checks. */
export interface PersonalInfoSnapshot {
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  date_of_birth?: string | null;
  ssn_last4?: string | null;
  address_line?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  employee_role?: string | null;
}

export function missingPersonalFields(e: PersonalInfoSnapshot): string[] {
  const missing: string[] = [];
  const req: [keyof PersonalInfoSnapshot, string][] = [
    ["first_name", "First name"],
    ["last_name", "Last name"],
    ["phone_number", "Phone"],
    ["date_of_birth", "Date of birth"],
    ["ssn_last4", "Last 4 of SSN"],
    ["address_line", "Street address"],
    ["address_city", "City"],
    ["address_state", "State"],
    ["address_zip", "ZIP"],
    ["employee_role", "Worker type / role"],
  ];
  for (const [k, label] of req) {
    const v = e[k];
    if (k === "ssn_last4") {
      if (!v || String(v).length !== 4) missing.push(label);
    } else if (!v || String(v).trim() === "") {
      missing.push(label);
    }
  }
  return missing;
}

/** Detects the structured DB error from enforce_employee_ready_for_shift. */
export function parseNotReadyError(err: unknown): { isNotReady: boolean; status?: ProfileStatus; message?: string } {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (!msg.includes("EMPLOYEE_NOT_READY")) return { isNotReady: false };
  const m = msg.match(/employee_profile_status:(\w+)/);
  return {
    isNotReady: true,
    status: (m?.[1] as ProfileStatus | undefined) ?? "incomplete",
    message: msg.replace(/^.*EMPLOYEE_NOT_READY:\s*/, "").split(/USING|HINT/)[0].trim(),
  };
}
