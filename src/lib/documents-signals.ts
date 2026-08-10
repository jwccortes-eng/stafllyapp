/**
 * Unified document signals — Phase 1 (read-only).
 *
 * Two existing tables back this code:
 *   - employee_documents              (admin/manager uploads, review_status, category)
 *   - employee_onboarding_documents   (worker onboarding wizard, status: pending|verified|rejected|expired)
 *
 * This file produces:
 *   1. UnifiedDocumentRow[]           — single shape both tables collapse into.
 *   2. WorkerDocumentSignals map      — per-worker compliance summary used by:
 *        · Workers Data Quality risk panel (extra cards)
 *        · Risk tags on each worker row
 *        · Worker drawer compliance section
 *        · Operations Command Center health snapshot + Smart Action Queue
 *
 * No writes, no payroll math, no schema changes. Tenants are filtered upstream
 * via selectedCompanyId; helpers are pure on the rows passed to them.
 */

import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";

/** Visual status — superset across both tables. */
export type UnifiedDocStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "expired"
  | "expiring_soon";

/** Where the document came from. */
export type UnifiedDocSource = "admin_upload" | "onboarding" | "worker_upload" | "imported";

export interface UnifiedDocumentRow {
  id: string;                       // namespaced: ed-<uuid> | onb-<uuid>
  rawId: string;                    // original UUID
  source: UnifiedDocSource;
  employee_id: string;
  company_id: string;
  worker_name: string;
  document_type: string;            // human label (e.g. "Driver's License")
  category: DocumentCategory | string;
  status: UnifiedDocStatus;
  expires_at: string | null;
  file_path: string;                // bucket path or legacy URL — caller resolves to signed URL
  bucket: "employee-documents" | "employee-onboarding-documents" | "unknown";
  file_name: string | null;
  /** MIME persisted with the upload when the source table provides it. */
  file_type: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  /** VWC Fase 3B: versión observada, obligatoria para revisar o editar. */
  version: number | null;
}

const ONBOARDING_LABEL: Record<string, string> = {
  driver_license: "Driver's License",
  vehicle_registration: "Vehicle Registration",
  id_document: "Government ID",
  work_authorization: "Work Authorization",
  other: "Other",
};

/** Map admin-upload categories to a friendly label. */
function categoryLabel(cat: string | null | undefined): string {
  if (!cat) return "Other";
  const meta = (DOCUMENT_CATEGORIES as any)[cat];
  return meta?.label ?? cat;
}

/** Map an onboarding doc type to a category that aligns with required-documents. */
function onboardingTypeToCategory(t: string): DocumentCategory | string {
  switch (t) {
    case "driver_license":      return "drivers_license";
    case "id_document":         return "id";
    case "work_authorization":  return "work_authorization";
    default:                    return t;
  }
}

const EXPIRING_SOON_DAYS = 30;

function classifyExpiry(expires_at: string | null | undefined): "expired" | "expiring_soon" | null {
  if (!expires_at) return null;
  const t = new Date(expires_at).getTime();
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  if (t <= now) return "expired";
  const days = (t - now) / (1000 * 60 * 60 * 24);
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return null;
}

interface NormalizeArgs {
  adminDocs?: any[];
  onboardingDocs?: any[];
  /** Map<employee_id, "First Last"> to populate worker_name. */
  workerNames?: Map<string, string>;
}

export function normalizeDocuments({
  adminDocs = [],
  onboardingDocs = [],
  workerNames,
}: NormalizeArgs): UnifiedDocumentRow[] {
  const rows: UnifiedDocumentRow[] = [];

  for (const d of adminDocs) {
    const expClass = classifyExpiry((d as any).expires_at);
    const reviewStatus = (d.review_status ?? "pending") as "pending" | "approved" | "rejected";
    let status: UnifiedDocStatus =
      reviewStatus === "approved" ? "approved" :
      reviewStatus === "rejected" ? "rejected" : "pending";
    // Expiry overlays approval (an approved-but-expired doc should surface as expired/expiring).
    if (status === "approved" && expClass) status = expClass;

    rows.push({
      id: `ed-${d.id}`,
      rawId: d.id,
      source: "admin_upload",
      employee_id: d.employee_id,
      company_id: d.company_id,
      worker_name: workerNames?.get(d.employee_id) ?? "—",
      document_type: d.name || categoryLabel(d.category),
      category: d.category ?? "other",
      status,
      expires_at: (d as any).expires_at ?? null,
      file_path: d.file_url ?? "",
      bucket: "employee-documents",
      file_name: d.name ?? null,
      file_type: d.file_type ?? null,
      created_at: d.created_at ?? null,
      reviewed_at: d.reviewed_at ?? null,
      rejection_reason: d.rejection_reason ?? null,
      version: (d as any).version ?? null,
    });
  }

  for (const d of onboardingDocs) {
    const expClass = classifyExpiry((d as any).expires_at);
    const raw = (d.status ?? "pending") as string;
    let status: UnifiedDocStatus =
      raw === "verified" || raw === "approved" ? "approved" :
      raw === "rejected" ? "rejected" :
      raw === "expired" ? "expired" : "pending";
    if (status === "approved" && expClass) status = expClass;

    rows.push({
      id: `onb-${d.id}`,
      rawId: d.id,
      source: "onboarding",
      employee_id: d.employee_id,
      company_id: d.company_id,
      worker_name: workerNames?.get(d.employee_id) ?? "—",
      document_type: ONBOARDING_LABEL[d.document_type] ?? d.document_type,
      category: onboardingTypeToCategory(d.document_type),
      status,
      expires_at: (d as any).expires_at ?? null,
      file_path: d.file_url ?? "",
      bucket: "employee-onboarding-documents",
      file_name: d.file_name ?? null,
      file_type: null,
      created_at: d.created_at ?? d.uploaded_at ?? null,
      version: (d as any).version ?? null,
      reviewed_at: d.verified_at ?? null,
      rejection_reason: (d as any).notes ?? null,
    });
  }

  return rows.sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Per-worker compliance signals                                            */
/* ──────────────────────────────────────────────────────────────────────── */

export interface WorkerDocumentSignals {
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  /** Required categories that have no APPROVED non-expired document. */
  missingRequiredLabels: string[];
}

/**
 * Build a per-worker compliance map.
 *
 * @param rows                Unified documents already filtered by company_id.
 * @param requiredByEmployee  Map<employee_id, DocumentCategory[]> required for that worker.
 *                            Caller is expected to honor `can_drive` etc.
 */
export function buildWorkerDocSignals(
  rows: UnifiedDocumentRow[],
  requiredByEmployee: Map<string, DocumentCategory[]>,
): Map<string, WorkerDocumentSignals> {
  const out = new Map<string, WorkerDocumentSignals>();

  // Group rows per worker for fast lookups.
  const byWorker = new Map<string, UnifiedDocumentRow[]>();
  for (const r of rows) {
    const arr = byWorker.get(r.employee_id) ?? [];
    arr.push(r);
    byWorker.set(r.employee_id, arr);
  }

  // Union of all employee_ids appearing in either source.
  const employeeIds = new Set<string>([
    ...byWorker.keys(),
    ...requiredByEmployee.keys(),
  ]);

  for (const empId of employeeIds) {
    const docs = byWorker.get(empId) ?? [];
    const required = requiredByEmployee.get(empId) ?? [];

    const sig: WorkerDocumentSignals = {
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      missingRequiredLabels: [],
    };

    for (const d of docs) {
      switch (d.status) {
        case "approved":      sig.approvedCount++; break;
        case "pending":       sig.pendingCount++; break;
        case "rejected":      sig.rejectedCount++; break;
        case "expired":       sig.expiredCount++; break;
        case "expiring_soon": sig.expiringSoonCount++; break;
      }
    }

    // Required categories satisfied = approved (non-expired) doc with same category.
    const owned = new Set<string>(
      docs
        .filter((d) => d.status === "approved")
        .map((d) => String(d.category)),
    );
    for (const req of required) {
      if (!owned.has(req)) {
        sig.missingRequiredLabels.push(
          (DOCUMENT_CATEGORIES as any)[req]?.label ?? req,
        );
      }
    }

    out.set(empId, sig);
  }

  return out;
}

export const DOC_STATUS_LABEL: Record<UnifiedDocStatus, string> = {
  approved: "Aprobado",
  pending: "Pendiente de revisión",
  rejected: "Rechazado",
  expired: "Vencido",
  expiring_soon: "Por vencer",
};

export const DOC_SOURCE_LABEL: Record<UnifiedDocSource, string> = {
  admin_upload: "Subido por admin",
  onboarding: "Alta",
  worker_upload: "Subido por la persona",
  imported: "Importado",
};
