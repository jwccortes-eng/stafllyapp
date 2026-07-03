/**
 * Data Quality Phase 2 — action helpers.
 *
 * Pure utilities for the actionable layer of Workers Data Quality:
 *  - Map a RiskKey to the EmployeeProfileTabs tab id where it gets fixed.
 *  - Build human-readable WhatsApp reminder messages.
 *  - Build wa.me URLs from a normalized 10-digit US phone.
 *
 * NO database writes here. NO payroll math. Caller decides when to act.
 */

import { normalizePhone } from "@/lib/phone";
import type { RiskKey } from "@/lib/data-quality-risks";

/**
 * Tab id inside EmployeeProfileTabs where the operator can fix this risk.
 *  - "info"        → InfoTab (phone, email, role, location, emergency contact)
 *  - "profile"     → WorkerProfileTab (avatar/photo)
 *  - "access"      → AccessTab (portal invite / portal_not_active)
 *  - "docs"        → Documents tab (any document risk)
 *  - "compensation"→ Pay/comp risks (none currently mapped)
 */
export type ProfileTabId =
  | "info"
  | "profile"
  | "compensation"
  | "access"
  | "docs"
  | "shifts"
  | "activity";

const RISK_TO_TAB: Record<RiskKey, ProfileTabId> = {
  pending_identity: "info",
  system_placeholder: "info",
  test_account: "info",
  duplicate_review: "info",
  historical_active: "info",
  suspicious_email: "info",
  phone_invalid: "info",
  missing_role: "info",
  missing_location: "info",
  inactive_with_payroll: "info",
  missing_phone: "info",
  missing_email: "info",
  missing_photo: "profile",
  missing_emergency_contact: "info",
  portal_not_active: "access",
  missing_required_document: "docs",
  pending_document_review: "docs",
  expired_document: "docs",
  expiring_document: "docs",
  rejected_document: "docs",
};

export function tabForRisk(key: RiskKey): ProfileTabId {
  return RISK_TO_TAB[key] ?? "info";
}

/**
 * Risks that the worker themselves can resolve from the portal once invited
 * (vs. internal-only signals like duplicate_review or inactive_with_payroll).
 */
const WORKER_FACING: ReadonlySet<RiskKey> = new Set<RiskKey>([
  "missing_phone",
  "missing_email",
  "missing_photo",
  "missing_emergency_contact",
  "missing_required_document",
  "pending_document_review",
  "expired_document",
  "expiring_document",
  "rejected_document",
]);

/** Short human label for the WhatsApp reminder bullet list. */
const ITEM_LABEL: Partial<Record<RiskKey, string>> = {
  missing_phone: "phone number",
  missing_email: "email address",
  missing_photo: "profile photo",
  missing_emergency_contact: "emergency contact",
  missing_required_document: "required documents",
  pending_document_review: "documents pending review",
  expired_document: "expired documents",
  expiring_document: "documents expiring soon",
  rejected_document: "rejected documents (please re-upload)",
};

export interface WhatsappReminderInput {
  firstName?: string | null;
  risks: RiskKey[];
  companyName?: string | null;
  /** Optional portal URL to include in the message footer. */
  portalUrl?: string | null;
}

/**
 * Build a friendly EN reminder message listing only worker-facing missing items.
 * Returns null when there is nothing actionable to ask the worker for.
 */
export function buildWhatsappReminder(input: WhatsappReminderInput): string | null {
  const items = input.risks
    .filter((r) => WORKER_FACING.has(r))
    .map((r) => ITEM_LABEL[r])
    .filter((label): label is string => !!label);

  if (items.length === 0) return null;

  const greeting = input.firstName?.trim()
    ? `Hi ${input.firstName.trim()},`
    : "Hi,";
  const company = input.companyName?.trim() || "the team";
  const lines = [
    greeting,
    "",
    `To finish setting up your profile with ${company}, please complete the following:`,
    ...items.map((i) => `• ${i}`),
  ];
  if (input.portalUrl) {
    lines.push("", `Open your portal: ${input.portalUrl}`);
  }
  lines.push("", "Thank you!");
  return lines.join("\n");
}

/** Build a wa.me deep link. Returns null when phone is not a valid US 10-digit. */
export function buildWaMeUrl(phone: string | null | undefined, message: string): string | null {
  const norm = normalizePhone(phone ?? "");
  if (!norm || norm.length !== 10) return null;
  // wa.me expects country code; default US (+1).
  return `https://wa.me/1${norm}?text=${encodeURIComponent(message)}`;
}

/**
 * Bulk: build a single big text block joining one message per worker, separated
 * by a divider. Useful for "Copy all messages" so the operator can paste into
 * WhatsApp Web manually. Workers without actionable items or without a phone
 * are skipped.
 */
export interface BulkReminderRow {
  employeeId: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  risks: RiskKey[];
}

export function buildBulkRemindersText(
  rows: BulkReminderRow[],
  opts: { companyName?: string | null; portalUrl?: string | null } = {},
): { text: string; included: number; skipped: number } {
  const sections: string[] = [];
  let included = 0;
  let skipped = 0;
  for (const r of rows) {
    const msg = buildWhatsappReminder({
      firstName: r.firstName,
      risks: r.risks,
      companyName: opts.companyName,
      portalUrl: opts.portalUrl,
    });
    if (!msg) {
      skipped += 1;
      continue;
    }
    const phoneNorm = normalizePhone(r.phone ?? "");
    const header = `— ${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() +
      (phoneNorm.length === 10 ? `  (+1 ${phoneNorm})` : "  (no phone)");
    sections.push(`${header}\n${msg}`);
    included += 1;
  }
  return {
    text: sections.join("\n\n———\n\n"),
    included,
    skipped,
  };
}
