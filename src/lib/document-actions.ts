/**
 * Document management actions — unified layer over employee_documents and
 * employee_onboarding_documents.
 *
 * Phase 1 — read+lightweight write only. No schema migrations. No payroll
 * impact. Worker portal is unaffected (these helpers are admin/manager only,
 * gated by the calling UI + RLS).
 *
 * Schema reality (verified):
 *   employee_documents
 *     review_status text in (pending|approved|rejected)
 *     reviewed_by uuid, reviewed_at timestamptz, rejection_reason text
 *     expires_at date NULL (Documents Expiration Source-of-Truth v1)
 *     no notes, no replacement_requested column
 *   employee_onboarding_documents
 *     status text in (pending|verified|rejected|expired)
 *     verified_by uuid, verified_at timestamptz, notes text
 *     no rejection_reason, no expires_at, no replacement_requested column
 *
 * Replacement workaround: we encode "[Replacement requested] <reason>" in the
 * existing reason field (rejection_reason for employee_documents, notes for
 * onboarding) and detect that prefix in the UI. A real column is Phase 2.
 */
import { supabase } from "@/integrations/supabase/client";
import { versionedWrite } from "@/lib/data/versioned-write";

export const REPLACEMENT_PREFIX = "[Replacement requested]";

export type DocumentSource = "employee_documents" | "employee_onboarding_documents";

export type DocumentReviewState =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "replacement_requested";

export interface UnifiedDocument {
  id: string;                       // synthetic prefixed id used by the list
  raw_id: string;                   // real PK
  source: DocumentSource;
  employee_id: string;
  company_id: string;
  name: string;
  category: string;                 // category (employee_documents) or document_type label
  file_url: string;
  file_size: number | null;
  created_at: string;
  reviewed_at: string | null;
  expires_at: string | null;        // ISO date or null — Phase 1: employee_documents only
  state: DocumentReviewState;
  reason: string | null;            // rejection_reason or notes (raw)
  replacement_reason: string | null; // text after prefix, when state === 'replacement_requested'
  /** VWC Fase 3B: versión observada por el revisor. */
  version: number | null;
}

/** Resultado canónico de una acción de documento (VWC Fase 3B). */
export interface DocumentActionResult {
  error: string | null;
  /** Presente cuando otra persona cambió el documento antes que nosotros. */
  conflict?: {
    expectedVersion: number | null;
    actualVersion: number | null;
    updatedAt: string | null;
    row: Record<string, any> | null;
  };
}


const ONB_LABELS: Record<string, string> = {
  driver_license: "Driver's license",
  vehicle_registration: "Vehicle registration",
  id_document: "ID document",
  work_authorization: "Work authorization",
  other: "Other",
};

/** Build a UnifiedDocument from an employee_documents row. */
export function fromEmployeeDocument(row: {
  id: string; employee_id: string; company_id: string; name: string;
  file_url: string; file_size: number | null; category: string | null;
  created_at: string; review_status: string; reviewed_at: string | null;
  rejection_reason: string | null; expires_at?: string | null;
  version?: number | null;
}): UnifiedDocument {
  const reason = row.rejection_reason ?? null;
  const isReplacement = !!reason && reason.startsWith(REPLACEMENT_PREFIX);
  const state: DocumentReviewState = isReplacement
    ? "replacement_requested"
    : (row.review_status as DocumentReviewState);
  return {
    id: `ed-${row.id}`,
    raw_id: row.id,
    source: "employee_documents",
    employee_id: row.employee_id,
    company_id: row.company_id,
    name: row.name,
    category: row.category ?? "other",
    file_url: row.file_url,
    file_size: row.file_size,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    expires_at: row.expires_at ?? null,
    state,
    reason,
    replacement_reason: isReplacement
      ? reason!.slice(REPLACEMENT_PREFIX.length).trim()
      : null,
    version: row.version ?? null,
  };
}

/** Build a UnifiedDocument from an employee_onboarding_documents row. */
export function fromOnboardingDocument(row: {
  id: string; employee_id: string; company_id: string;
  document_type: string; file_url: string; file_name: string | null;
  status: string; verified_at: string | null; notes: string | null;
  created_at: string; version?: number | null;
}): UnifiedDocument {
  const reason = row.notes ?? null;
  const isReplacement = !!reason && reason.startsWith(REPLACEMENT_PREFIX);
  // Map onboarding status to unified state vocabulary
  let state: DocumentReviewState;
  if (isReplacement) state = "replacement_requested";
  else if (row.status === "verified") state = "approved";
  else if (row.status === "expired") state = "expired";
  else if (row.status === "rejected") state = "rejected";
  else state = "pending";
  return {
    id: `eod-${row.id}`,
    raw_id: row.id,
    source: "employee_onboarding_documents",
    employee_id: row.employee_id,
    company_id: row.company_id,
    name: row.file_name || ONB_LABELS[row.document_type] || row.document_type,
    category: ONB_LABELS[row.document_type] || row.document_type,
    file_url: row.file_url,
    file_size: null,
    created_at: row.created_at,
    reviewed_at: row.verified_at,
    expires_at: null,
    state,
    reason,
    replacement_reason: isReplacement
      ? reason!.slice(REPLACEMENT_PREFIX.length).trim()
      : null,
    version: row.version ?? null,
  };
}

/** Fetch + merge both tables for a single worker. */
export async function fetchUnifiedDocuments(
  employeeId: string,
  companyId: string,
): Promise<UnifiedDocument[]> {
  const [{ data: ed }, { data: eod }] = await Promise.all([
    (supabase.from("employee_documents" as any) as any)
      .select("id, employee_id, company_id, name, file_url, file_size, category, created_at, review_status, reviewed_at, rejection_reason, expires_at, version")
      .eq("employee_id", employeeId).eq("company_id", companyId),
    (supabase.from("employee_onboarding_documents" as any) as any)
      .select("id, employee_id, company_id, document_type, file_url, file_name, status, verified_at, notes, created_at, version")
      .eq("employee_id", employeeId).eq("company_id", companyId),
  ]);
  const rows: UnifiedDocument[] = [
    ...((ed as any[]) ?? []).map(fromEmployeeDocument),
    ...((eod as any[]) ?? []).map(fromOnboardingDocument),
  ];
  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// ─── Audit log ──────────────────────────────────────────────────────────────
async function writeAuditLog(opts: {
  action: "document_approved" | "document_rejected" | "document_replacement_requested" | "document_uploaded_by_admin";
  doc: UnifiedDocument;
  reason?: string | null;
}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return; // RLS will block; skip silently
    await supabase.from("activity_log" as any).insert({
      user_id: userId,
      company_id: opts.doc.company_id,
      action: opts.action,
      entity_type: "employee_document",
      entity_id: opts.doc.raw_id,
      details: {
        source_table: opts.doc.source,
        employee_id: opts.doc.employee_id,
        document_name: opts.doc.name,
        category: opts.doc.category,
        reason: opts.reason ?? null,
      },
    } as any);
  } catch {
    // never block the user-facing action on audit logging
  }
}

// ─── Carril 3 (VWC Fase 3B): transición de revisión ─────────────────────────
/**
 * Única vía para cambiar el estado de un documento. Nunca se hace `.update()`
 * directo: la RPC valida permiso de empresa, exige la versión observada y
 * registra auditoría. Si otra persona revisó antes, devolvemos `conflict` en
 * vez de pisar su decisión.
 */
type DocumentDecision = "approved" | "rejected" | "replacement_requested" | "expired" | "pending";

async function reviewDocument(
  doc: UnifiedDocument,
  decision: DocumentDecision,
  reason: string | null,
  surface: string,
): Promise<DocumentActionResult> {
  const { data, error } = await (supabase.rpc as any)("review_employee_document", {
    p_document_id: doc.raw_id,
    p_source: doc.source,
    p_company_id: doc.company_id,
    p_decision: decision,
    p_expected_version: doc.version ?? null,
    p_reason: reason,
    p_surface: surface,
  });

  if (error) return { error: error.message };
  const res = (data ?? {}) as any;

  if (res.status === "conflict") {
    return {
      error: "Otra persona revisó este documento mientras lo tenías abierto.",
      conflict: {
        expectedVersion: res.expected_version ?? null,
        actualVersion: res.actual_version ?? null,
        updatedAt: res.updated_at ?? null,
        row: res.row ?? null,
      },
    };
  }
  if (res.status === "applied" || res.status === "noop") return { error: null };
  return { error: res.message ?? "No se pudo aplicar la revisión." };
}

// ─── Approve ────────────────────────────────────────────────────────────────
export async function approveDocument(doc: UnifiedDocument): Promise<DocumentActionResult> {
  const result = await reviewDocument(doc, "approved", null, "documents:approve");
  if (!result.error) await writeAuditLog({ action: "document_approved", doc });
  return result;
}

// ─── Reject ─────────────────────────────────────────────────────────────────
export async function rejectDocument(
  doc: UnifiedDocument,
  reason: string,
): Promise<DocumentActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { error: "Se requiere un motivo." };
  const result = await reviewDocument(doc, "rejected", trimmed, "documents:reject");
  if (!result.error) await writeAuditLog({ action: "document_rejected", doc, reason: trimmed });
  return result;
}

// ─── Request replacement ────────────────────────────────────────────────────
export async function requestReplacement(
  doc: UnifiedDocument,
  reason: string,
): Promise<DocumentActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { error: "Se requiere un motivo." };
  const result = await reviewDocument(doc, "replacement_requested", trimmed, "documents:replacement");
  if (!result.error) {
    await writeAuditLog({ action: "document_replacement_requested", doc, reason: trimmed });
  }
  return result;
}

// ─── Admin upload ───────────────────────────────────────────────────────────
const ADMIN_UPLOAD_BUCKET = "employee-documents";

export interface AdminUploadInput {
  employeeId: string;
  companyId: string;
  file: File;
  category: string;
  approveOnUpload: boolean;
  /** Optional ISO YYYY-MM-DD expiration date. */
  expiresAt?: string | null;
}

export async function uploadAdminDocument(input: AdminUploadInput): Promise<{
  error: string | null;
  doc?: UnifiedDocument;
}> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  // Sanitize filename (replace path separators / control chars)
  const safeName = input.file.name.replace(/[^\w.\- ]+/g, "_");
  const path = `${input.companyId}/${input.employeeId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ADMIN_UPLOAD_BUCKET)
    .upload(path, input.file, { contentType: input.file.type || undefined });
  if (uploadError) return { error: uploadError.message };

  const insertPayload: Record<string, unknown> = {
    employee_id: input.employeeId,
    company_id: input.companyId,
    name: input.file.name,
    file_url: path, // store storage path; we sign on read
    file_type: input.file.type || null,
    file_size: input.file.size,
    category: input.category || "other",
    uploaded_by: userId,
    review_status: input.approveOnUpload ? "approved" : "pending",
    expires_at: input.expiresAt || null,
    ...(input.approveOnUpload
      ? { reviewed_at: new Date().toISOString(), reviewed_by: userId }
      : {}),
  };

  const { data: inserted, error: insertError } = await (supabase
    .from("employee_documents" as any) as any)
    .insert(insertPayload)
    .select("id, employee_id, company_id, name, file_url, file_size, category, created_at, review_status, reviewed_at, rejection_reason, expires_at, version")
    .single();

  if (insertError || !inserted) {
    // best-effort cleanup of the uploaded blob if the row insert failed
    await supabase.storage.from(ADMIN_UPLOAD_BUCKET).remove([path]).catch(() => {});
    return { error: insertError?.message ?? "Insert failed." };
  }

  const doc = fromEmployeeDocument(inserted as any);
  await writeAuditLog({ action: "document_uploaded_by_admin", doc });
  return { error: null, doc };
}

// ─── Update expiration (admin only) ─────────────────────────────────────────
/**
 * Set or clear the expiration date for an admin-managed employee document.
 * Pass `null` (or empty string) to clear. v1 only supports employee_documents.
 */
export async function updateDocumentExpiration(
  doc: Pick<UnifiedDocument, "raw_id" | "source" | "employee_id" | "company_id" | "name" | "category"> & {
    version?: number | null;
  },
  expiresAtIso: string | null,
): Promise<DocumentActionResult> {
  if (doc.source !== "employee_documents") {
    return { error: "La edición de vencimiento sólo aplica a documentos administrados." };
  }
  const value = expiresAtIso && expiresAtIso.trim() ? expiresAtIso : null;

  // Carril 2 (VWC): PATCH parcial + expected_version. Nunca `.update()` directo.
  const result = await versionedWrite({
    entity: "employee_documents",
    id: doc.raw_id,
    companyId: doc.company_id,
    patch: { expires_at: value },
    expectedVersion: doc.version ?? null,
    surface: "documents:expiration",
  });

  if (result.status === "conflict") {
    return {
      error: "Otra persona actualizó este documento mientras lo editabas.",
      conflict: {
        expectedVersion: result.expectedVersion,
        actualVersion: result.actualVersion,
        updatedAt: result.updatedAt,
        row: result.row,
      },
    };
  }
  if (result.status === "error") return { error: result.message };

  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (userId) {
      await supabase.from("activity_log" as any).insert({
        user_id: userId,
        company_id: doc.company_id,
        action: "document_expiration_updated",
        entity_type: "employee_document",
        entity_id: doc.raw_id,
        details: {
          employee_id: doc.employee_id,
          document_name: doc.name,
          category: doc.category,
          expires_at: value,
        },
      } as any);
    }
  } catch { /* never block on audit */ }

  return { error: null };
}
