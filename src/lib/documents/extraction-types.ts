/**
 * Document extraction types — v1.
 *
 * Shape for assisted (manual or AI-suggested) document field extraction.
 * v1 is suggestion-only: nothing in this shape is trusted until an admin
 * sets `confirmed_by` + `confirmed_at`.
 *
 * Document numbers are ALWAYS stored masked (last 4 digits only).
 * Raw numbers must never leave the edge function or be put in React state.
 */

export type ConfidenceLevel = "high" | "medium" | "low";
export type ExtractionSource = "manual" | "ai" | "ocr";

export interface DocumentExtraction {
  extracted_full_name?: string | null;
  extracted_document_type?: string | null;
  /** Always masked: e.g. "••• ••• 1234". Never store the raw number. */
  extracted_document_number_masked?: string | null;
  extracted_issue_date?: string | null;       // ISO YYYY-MM-DD
  extracted_expiration_date?: string | null;  // ISO YYYY-MM-DD
  extracted_state_or_jurisdiction?: string | null;
  extracted_birth_date?: string | null;       // optional, hidden for w9/tax_form
  confidence_score?: number | null;           // 0..1
  confidence_level?: ConfidenceLevel | null;
  extraction_source: ExtractionSource;
  extracted_at: string;                       // ISO timestamp
  needs_human_confirmation: boolean;          // default true
  confirmed_by?: string | null;               // auth.users.id
  confirmed_at?: string | null;               // ISO timestamp
}

/** Replace all but the last 4 characters of a document number with bullets. */
export function maskDocumentNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Keep only the last 4 alphanumerics; mask the rest.
  const alnum = trimmed.replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length === 0) return null;
  const last4 = alnum.slice(-4);
  const dotCount = Math.max(1, Math.min(8, alnum.length - last4.length));
  return `${"•".repeat(dotCount)} ${last4}`;
}

/** Document categories where assisted extraction is disabled for privacy. */
export const EXTRACTION_BLOCKED_CATEGORIES = new Set<string>([
  "w9",
  "tax_form",
]);

export function isExtractionAllowed(category: string | null | undefined): boolean {
  if (!category) return true;
  return !EXTRACTION_BLOCKED_CATEGORIES.has(String(category));
}

export function confidenceLevelFromScore(score: number | null | undefined): ConfidenceLevel | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}
