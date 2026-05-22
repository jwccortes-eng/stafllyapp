/**
 * Document Type Policy — v1 (visibility + UX only, no enforcement).
 *
 * Single source of truth for per-document-type requirements used by both the
 * worker portal upload UX and the admin review surfaces:
 *
 *   - expiration policy (required/recommended/optional/not_applicable)
 *   - side policy        (single/front_back_required/front_back_recommended/multi_page)
 *   - AI extraction allowed
 *   - sensitive (PII heavy → AI off, extra care)
 *   - admin review required (always true in v1)
 *
 * v1 does NOT add schema. Sides are inferred from the existing
 * `employee_documents.name` field via a "— Frente" / "— Reverso" suffix
 * appended at upload time. Existing rows without a suffix → "unknown" (treated
 * as a single full document). A future v2 may promote this to a real column
 * (`document_side` + `document_group_id`) once we have approval.
 */

import type { DocumentCategory } from "@/lib/onboarding/required-documents";
import {
  EXPIRATION_POLICY,
  type ExpirationPolicy,
} from "@/lib/onboarding/document-expiration-policy";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SidePolicy =
  | "single"
  | "front_back_required"
  | "front_back_recommended"
  | "multi_page";

export type DocumentSide = "front" | "back" | "full" | "unknown";

export interface DocumentTypePolicy {
  category: DocumentCategory | "other";
  label: string;
  expiration: ExpirationPolicy;
  side: SidePolicy;
  ai_extraction_allowed: boolean;
  sensitive: boolean;
  admin_review_required: boolean;
  /** Optional UX copy override; falls back to a sensible default per side. */
  upload_copy?: string;
}

// ─── Policy table ────────────────────────────────────────────────────────────

const POLICY: Record<DocumentCategory, DocumentTypePolicy> = {
  drivers_license: {
    category: "drivers_license",
    label: "Driver's License",
    expiration: EXPIRATION_POLICY.drivers_license,
    side: "front_back_required",
    ai_extraction_allowed: true,
    sensitive: false,
    admin_review_required: true,
  },
  id: {
    category: "id",
    label: "Government ID",
    expiration: EXPIRATION_POLICY.id,
    side: "front_back_recommended",
    ai_extraction_allowed: true,
    sensitive: false,
    admin_review_required: true,
  },
  work_authorization: {
    category: "work_authorization",
    label: "Work Authorization",
    expiration: EXPIRATION_POLICY.work_authorization,
    side: "front_back_required",
    ai_extraction_allowed: true,
    sensitive: false,
    admin_review_required: true,
  },
  background_check: {
    category: "background_check",
    label: "Background Check",
    expiration: EXPIRATION_POLICY.background_check,
    side: "multi_page",
    ai_extraction_allowed: false,
    sensitive: false,
    admin_review_required: true,
  },
  w9: {
    category: "w9",
    label: "W-9",
    expiration: EXPIRATION_POLICY.w9,
    side: "multi_page",
    ai_extraction_allowed: false,
    sensitive: true,
    admin_review_required: true,
  },
  tax_form: {
    category: "tax_form",
    label: "Tax Form",
    expiration: EXPIRATION_POLICY.tax_form,
    side: "multi_page",
    ai_extraction_allowed: false,
    sensitive: true,
    admin_review_required: true,
  },
  contract: {
    category: "contract",
    label: "Contract",
    expiration: EXPIRATION_POLICY.contract,
    side: "multi_page",
    ai_extraction_allowed: false,
    sensitive: false,
    admin_review_required: true,
  },
  other: {
    category: "other",
    label: "Other",
    expiration: EXPIRATION_POLICY.other,
    side: "single",
    ai_extraction_allowed: false,
    sensitive: false,
    admin_review_required: true,
  },
};

/** Lookup a policy by category. Unknown categories fall back to "other". */
export function policyFor(category: string | null | undefined): DocumentTypePolicy {
  if (!category) return POLICY.other;
  return (POLICY as Record<string, DocumentTypePolicy>)[String(category)] ?? POLICY.other;
}

// ─── Side helpers (no schema — encoded in document name) ─────────────────────

/** Suffix conventions appended to the stored `name` to encode a side. */
export const SIDE_SUFFIX = {
  front: " — Frente",
  back: " — Reverso",
} as const;

/** Build a display name for a freshly uploaded file with a known side. */
export function nameForSide(baseName: string, side: DocumentSide): string {
  if (side === "front") return `${baseName}${SIDE_SUFFIX.front}`;
  if (side === "back") return `${baseName}${SIDE_SUFFIX.back}`;
  return baseName;
}

/** Infer a side from a document name. Returns "unknown" when no marker present. */
export function inferDocumentSide(name: string | null | undefined): DocumentSide {
  if (!name) return "unknown";
  const n = String(name).toLowerCase();
  if (/(frente|—\s*front|\bfront\b)/.test(n)) return "front";
  if (/(reverso|—\s*back|\bback\b)/.test(n)) return "back";
  return "unknown";
}

export const SIDE_LABEL: Record<DocumentSide, string> = {
  front: "Frente",
  back: "Reverso",
  full: "Documento completo",
  unknown: "Documento completo",
};

/**
 * Given the policy + the docs uploaded for a category, return which sides are
 * still missing. Returns an empty array for `single`/`multi_page` categories.
 *
 * Approved/pending docs both count as "present" — the worker shouldn't be
 * asked to re-upload while admin review is in progress.
 */
export function missingSidesFor(
  category: string | null | undefined,
  uploadedNames: ReadonlyArray<string | null | undefined>,
): DocumentSide[] {
  const policy = policyFor(category);
  if (policy.side !== "front_back_required" && policy.side !== "front_back_recommended") {
    return [];
  }
  const sides = new Set(uploadedNames.map(inferDocumentSide));
  const missing: DocumentSide[] = [];
  if (!sides.has("front")) missing.push("front");
  if (!sides.has("back")) missing.push("back");
  return missing;
}

/** Short helper copy describing what the worker should upload for a category. */
export function uploadHintFor(category: string | null | undefined): string {
  const p = policyFor(category);
  if (p.upload_copy) return p.upload_copy;
  switch (p.side) {
    case "front_back_required":
      return "Sube el frente y el reverso del documento.";
    case "front_back_recommended":
      return "Sube el frente (requerido). El reverso es recomendado.";
    case "multi_page":
      return "Sube el documento completo. Puedes subir varias páginas.";
    case "single":
    default:
      return "Sube el documento completo.";
  }
}
