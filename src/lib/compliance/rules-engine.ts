/**
 * Worker Update Center — rules engine (Phase 1).
 *
 * Pure, stateless functions that turn an employee snapshot + documents
 * snapshot into a list of currently-missing requirements. No DB writes.
 * No payroll math. No enforcement.
 *
 * Phase 1 has no deadlines, no grace periods, no restrictions — every
 * missing requirement is reported as `status: "pending"`. Future phases
 * layer `worker_requirement_status` on top and turn this into `in_grace`,
 * `overdue`, `restricted`, etc.
 */

import {
  REQUIREMENT_CATALOG,
  type RequirementDef,
  type RequirementCategory,
} from "./requirement-catalog";

export type RequirementStatus =
  | "pending"
  | "complete"
  | "not_applicable";

export interface ComputedRequirement {
  def: RequirementDef;
  status: RequirementStatus;
}

export interface EmployeeComplianceSnapshot {
  // Identity / contact / address — same shape as `employees` row subset.
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  ssn_last4?: string | null;
  address_line?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  avatar_url?: string | null;
  has_car?: boolean | null;
  can_drive?: boolean | null;
  // Document categories the worker has APPROVED. Pending/rejected don't satisfy.
  approvedDocumentCategories: Set<string>;
}

function present(v: unknown): boolean {
  return v != null && String(v).trim().length > 0;
}

function isComplete(req: RequirementDef, s: EmployeeComplianceSnapshot): RequirementStatus {
  switch (req.key) {
    case "identity.legal_name":
      return present(s.first_name) && present(s.last_name) ? "complete" : "pending";
    case "identity.date_of_birth":
      return present(s.date_of_birth) ? "complete" : "pending";
    case "identity.ssn_last4":
      return present(s.ssn_last4) && String(s.ssn_last4).length === 4
        ? "complete"
        : "pending";
    case "contact.phone":
      return present(s.phone_number) ? "complete" : "pending";
    case "contact.email":
      return present(s.email) ? "complete" : "pending";
    case "address.full":
      return present(s.address_line) &&
        present(s.address_city) &&
        present(s.address_state) &&
        present(s.address_zip)
        ? "complete"
        : "pending";
    case "emergency.contact":
      return present(s.emergency_contact_name) && present(s.emergency_contact_phone)
        ? "complete"
        : "pending";
    case "portal.photo":
      return present(s.avatar_url) ? "complete" : "pending";
    case "documents.w9":
      return s.approvedDocumentCategories.has("w9") ? "complete" : "pending";
    case "documents.id":
      return s.approvedDocumentCategories.has("id") ? "complete" : "pending";
    case "driver.license":
      if (!s.has_car && !s.can_drive) return "not_applicable";
      return s.approvedDocumentCategories.has("drivers_license") ? "complete" : "pending";
    default:
      return "pending";
  }
}

/** Compute status of every requirement in the catalog for one worker. */
export function computeRequirements(
  snapshot: EmployeeComplianceSnapshot,
): ComputedRequirement[] {
  return REQUIREMENT_CATALOG.map((def) => ({
    def,
    status: isComplete(def, snapshot),
  }));
}

export interface CompletionSummary {
  totalApplicable: number;
  completed: number;
  pending: number;
  pct: number;
  missingByCategory: Record<RequirementCategory, ComputedRequirement[]>;
}

export function summarizeCompletion(items: ComputedRequirement[]): CompletionSummary {
  const applicable = items.filter((i) => i.status !== "not_applicable");
  const completed = applicable.filter((i) => i.status === "complete").length;
  const pending = applicable.filter((i) => i.status === "pending");
  const total = applicable.length || 1;

  const missingByCategory = pending.reduce((acc, item) => {
    const k = item.def.category;
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<RequirementCategory, ComputedRequirement[]>);

  return {
    totalApplicable: applicable.length,
    completed,
    pending: pending.length,
    pct: Math.round((completed / total) * 100),
    missingByCategory,
  };
}
