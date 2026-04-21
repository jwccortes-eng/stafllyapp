import type { InvoiceStatus } from "@/hooks/useInvoices";

/**
 * Canonical invoice lifecycle.
 *
 * Manual transitions allowed in the UI are tightly controlled to keep the
 * billing flow auditable. `approved` and `viewed` exist in the DB enum for
 * legacy/automation use but are NOT part of the manual flow.
 *
 * Manual lifecycle:
 *   draft → issued → sent → (partially_paid → paid) | overdue
 *   any non-terminal → voided
 *   issued|sent → draft (reopen, only while not paid)
 */
export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft:          ["issued", "voided"],
  approved:       ["issued", "voided"], // legacy compatibility
  issued:         ["sent", "draft", "voided"],
  sent:           ["partially_paid", "paid", "overdue", "draft", "voided"],
  viewed:         ["partially_paid", "paid", "overdue", "voided"], // legacy
  partially_paid: ["paid", "overdue", "voided"],
  paid:           [], // terminal
  overdue:        ["partially_paid", "paid", "voided"],
  voided:         [], // terminal
};

export const TERMINAL_INVOICE_STATUSES: InvoiceStatus[] = ["paid", "voided"];

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return false;
  return INVOICE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid transition: cannot move invoice from "${from}" to "${to}".`,
    );
  }
}

export function isTerminal(status: InvoiceStatus): boolean {
  return TERMINAL_INVOICE_STATUSES.includes(status);
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:          "Draft",
  approved:       "Approved",
  issued:         "Issued",
  sent:           "Sent",
  viewed:         "Viewed",
  partially_paid: "Partially paid",
  paid:           "Paid",
  overdue:        "Overdue",
  voided:         "Voided",
};
