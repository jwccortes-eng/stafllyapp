# Document Intake Center v1 — Bulk Scan & Human Indexing

Operational backbone for the existing backlog of scanned documents: bulk upload → AI suggests (worker / type / side / expiration) → operator confirms → row is written to `employee_documents`. **AI is never truth. Nothing is indexed without a human click.**

---

## 1. Audit findings (existing infra we reuse)

| Piece | Status | Reuse plan |
|---|---|---|
| `employee_documents` (employee_id, company_id, name, file_url, file_type, category, expires_at, review_status pending/approved/rejected) | ✅ canonical | Indexing target. **No schema change.** |
| Private bucket `employee-documents` | ✅ `public=false`, signed URLs only | Reuse. New path prefix: `<company_id>/intake/<batch_id>/<filename>`. |
| `document-extract` edge function | ✅ admin-only, suggestion-only, masks numbers, blocks `w9`/`tax_form`, PDF not supported v1 | Reuse engine. Add a sibling `document-intake-extract` that accepts `intake_item_id` instead of `employee_document_id` (same model call, same masking, same blocked categories). |
| `DocumentsCenter` admin page, `DocumentPreview`, `AssistedExtractionPanel`, `resolveEmployeeDocumentUrl`, `document-policy.ts` | ✅ working | Reuse preview + policy. Add Bandeja tab. |
| Audit / activity log | existing pattern via insert into log tables when present; otherwise rely on `reviewed_by` + `reviewed_at` on intake items | Reuse. |

**Where bulk intake plugs in:** new admin-only surface that owns *staging* (`document_intake_*`), and only writes to `employee_documents` via the existing approved insert path on confirm.

---

## 2. Proposed schema (minimal, additive, RLS-strict)

Two new tables. No changes to `employee_documents`, no changes to storage policies, no new buckets.

```text
document_intake_batches
  id uuid pk
  company_id uuid not null              -- tenant scope
  uploaded_by uuid not null              -- auth.users.id
  status text not null                   -- uploading|processing|ready_for_review|completed|failed
  total_files int not null default 0
  created_at timestamptz default now()

document_intake_items
  id uuid pk
  batch_id uuid not null fk
  company_id uuid not null               -- denormalized for RLS speed
  storage_path text not null             -- intake path in employee-documents bucket
  original_filename text
  mime_type text
  status text not null                   -- pending_extraction|extracted|needs_review|indexed|rejected|failed
  extracted_json jsonb                   -- masked extraction output only
  suggested_employee_id uuid
  suggested_document_category text
  suggested_document_side text           -- front|back|full|unknown
  suggested_expires_at date
  suggested_document_number_masked text  -- last4 + dots, NEVER raw
  confidence_score numeric(3,2)          -- 0.00–1.00
  confidence_reason text
  reviewed_by uuid
  reviewed_at timestamptz
  indexed_employee_document_id uuid      -- nullable; set on confirm
  created_at timestamptz default now()
```

**RLS (both tables):**
- SELECT/INSERT/UPDATE/DELETE: only `has_role(auth.uid(), 'company_owner', company_id)` OR `has_role(... 'admin', company_id)` via existing `canAccessAdminForCompany`-equivalent tenant-scoped helper.
- No worker access. No anon. No public grants.
- Column-level grants follow Phase 1.5 model (no extra column on `employees`, so nothing to whitelist there).

**Constraints:** CHECK on `status` values; FK `batch_id → document_intake_batches(id) ON DELETE CASCADE`. No FK to `auth.users` per cloud rules; `uploaded_by`/`reviewed_by` stored as uuid only.

---

## 3. Storage strategy

- **Bucket:** reuse private `employee-documents` (no policy widening).
- **Intake path:** `<company_id>/intake/<batch_id>/<uuid>_<safe_filename>`.
- **On confirm-and-index:** copy the object to canonical onboarding path `<company_id>/<employee_id>/onboarding/<category>/<timestamp>_<filename>` (matches existing portal-documents-unified-path rule). Intake copy kept until batch `completed` then can be left in place — no auto-delete in v1.
- **No public URLs anywhere.** All reads via short-lived signed URL (existing `resolveEmployeeDocumentUrl`).

---

## 4. Extraction pipeline (admin-only edge function)

New function `document-intake-extract`:
- Input `{ intake_item_id }`. Auth required, admin/owner of `company_id` enforced via service-role lookup (same shape as `document-extract`).
- **PDF unsupported v1** → mark item `needs_review` with `confidence_reason='pdf_not_supported_v1'`.
- **Sensitive guard:** if `original_filename` matches `/w-?9|tax/i` OR caller pre-tags `suggested_document_category in {w9, tax_form}`, AI call is skipped, item flagged `needs_review`, reason `sensitive_manual_only`. Mirrors existing `BLOCKED_CATEGORIES`.
- Calls Lovable AI Gateway (Gemini flash, same as today) with image bytes + tightly scoped JSON schema returning: `full_name, document_type, document_number_masked, issue_date, expiration_date, state_or_jurisdiction, possible_side, confidence_score, confidence_reason`.
- Numbers always masked server-side (reuse `mask()` helper). Raw never persisted.
- Writes back ONLY to `document_intake_items` (`extracted_json`, suggestions, status=`extracted` or `needs_review`). Never touches `employee_documents`.

---

## 5. Worker matching (suggestion-only)

In the same edge function after extraction (or via small RPC `suggest_intake_match(intake_item_id)`):

| Signal detected | Confidence |
|---|---|
| Stafly ID / `employer_identification` in extracted text | **high** |
| Exact phone or email match (normalized 10-digit phone) | **high** |
| Exact normalized full_name + matching city/state | **medium** |
| Normalized full_name only | **medium** |
| Fuzzy name (Levenshtein/trigram) | **low** |
| No signal | **none** → operator picks |

Sets `suggested_employee_id`, `confidence_score`, `confidence_reason`. **Never sets `employee_id` on `employee_documents`.**

---

## 6. Admin UI

Route: `/app/document-intake` (admin/owner only, mounted under existing AdminLayout guard). Also linked from `/app/documents` as new tab “Bandeja de entrada”.

Layout (desktop + 390 mobile):

```text
[ Bandeja de documentos ]   [ Subir documentos ]
Sugerencias del sistema. No se guarda nada sin revisión humana.

Lote #12  ·  Subido por Keury  ·  18/20 indexados  ·  ready_for_review
─────────────────────────────────────────
[preview thumb] · IMG_2391.jpg · Pendiente de clasificar
  Sugerencia del sistema (Confianza alta)
    Trabajador:  Jorge Cortes (#1042)         [Cambiar]
    Tipo:        ID frontal                    [Cambiar]
    Vence:       12/03/2027                    [Corregir]
    Lado:        Frente                        [Cambiar]
  [Confirmar e indexar]  [Dejar pendiente]  [Rechazar]
```

Actions:
- **Confirmar e indexar** → RPC `intake_confirm_and_index(intake_item_id, overrides)` (single transaction): copies file to canonical path, inserts `employee_documents` (`review_status='pending'` by default to keep existing review flow; operator may also pick *Confirmar y aprobar* which sets `approved` only if current pattern already allows admin one-shot approval), sets `indexed_employee_document_id`, item status → `indexed`.
- **Rechazar** → status=`rejected`, no doc row.
- **Dejar pendiente** → status=`needs_review`.
- All actions write `reviewed_by`/`reviewed_at`.

All copy Spanish-first per spec.

---

## 7. Sensitive & W-9 handling

- W-9 / tax forms detected by filename OR explicit category → AI **skipped**, item shown with banner “Documento sensible: revisar manualmente. La extracción automática está desactivada.” Operator can still confirm/index manually (which routes the user to the existing `MyW9`/admin W-9 flow rather than creating an arbitrary employee_documents row). No raw TIN ever touched.

---

## 8. What this sprint will NOT touch

Payroll math · `time_entries` · `scheduled_shifts` · `shift_assignments` · employer_identification generation · SSN/EIN columns/exposure · portal permissions · notifications/SMS/email · photo review · auto-blocking · bucket public flag · existing `document-extract` function behavior · existing `employee_documents` schema · existing review flow rules.

---

## 9. Delivery order (gated)

1. **STOP HERE for approval of schema + bucket-path strategy.** No migration runs until you say go.
2. Migration: 2 tables + RLS + indexes (`batch_id`, `company_id`, `status`, `suggested_employee_id`).
3. Edge function `document-intake-extract` (admin guard, masking, sensitive block, PDF v1 fallback).
4. RPC `intake_confirm_and_index` (security definer, tenant-checked, single transaction).
5. Hooks: `useIntakeBatches`, `useIntakeItems`, `useIntakeActions`.
6. UI: `/app/document-intake` page + “Bandeja de entrada” tab in `DocumentsCenter`.
7. AdminSidebar link under existing “Documents” group.
8. Live QA: 2 image fixtures (1 high-confidence ID, 1 low-confidence), 1 W-9-named file (AI must skip), 1 PDF (v1 fallback). Confirm cross-tenant isolation, signed URLs only, no SSN/EIN leak, mobile 390 clean.

---

## Technical section

- Files to add: `supabase/migrations/<ts>_document_intake_v1.sql`, `supabase/functions/document-intake-extract/index.ts`, `src/pages/admin/DocumentIntakeCenter.tsx`, `src/hooks/useDocumentIntake.tsx`, `src/components/documents/intake/{IntakeUploader,IntakeItemCard,IntakeWorkerPicker,IntakeConfirmDialog}.tsx`, `src/lib/documents/intake-policy.ts`.
- Files to edit: `src/App.tsx` (route), `src/components/AdminSidebar.tsx` (link), `src/pages/admin/DocumentsCenter.tsx` (tab).
- No edits to: `employee_documents` schema, `document-extract`, `MyW9`, `MyDocuments`, storage policies, payroll/shifts/time_entries code, types.ts (auto-regen after migration).
- Auth: admin/owner only via tenant-scoped `has_role`. Worker portal sees nothing new.
- Performance: items list paginated 50/page; preview signed URLs on-demand.

**Awaiting approval before applying migration or writing code.**
