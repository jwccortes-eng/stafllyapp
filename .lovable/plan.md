# Document Preview & Assisted Extraction v1 — Plan

## Audit findings

**Current preview capabilities**
- `/app/documents` (DocumentsCenter): "View" button → opens signed URL in new tab. No inline preview.
- Employee profile (`WorkerDocumentsCompliance.tsx`): same — open-in-new-tab only.
- `/portal/documents` (MyDocuments): open-in-new-tab only. After upload, no preview shown to worker.
- Helper `resolveEmployeeDocumentUrl` already returns short‑lived signed URLs from the private `employee-documents` bucket. ✅ safe to reuse.

**OCR / AI infra**
- No OCR. No Tesseract. No vision pipeline.
- BUT Lovable AI Gateway is wired (`supabase/functions/ai-workforce`, uses `LOVABLE_API_KEY` + `ai.gateway.lovable.dev`). Vision-capable models (`google/gemini-2.5-flash`, `google/gemini-2.5-pro`) are available — image extraction is feasible without new infra.
- No extraction-result storage anywhere today.

**Verdict**: v1 = **Preview everywhere + manual extraction form**. AI suggestion ("Leer documento") is implemented behind a feature flag as a *suggestion-only* path, never auto-applied. No DB writes from AI.

---

## v1 scope (what we ship)

### Part 1 — Inline preview (no DB changes)
New shared component: `src/components/documents/DocumentPreview.tsx`
- Resolves signed URL via existing helper.
- If `file_type` starts with `image/` → `<img>` with `max-h-[70vh]`, contain.
- If `application/pdf` → `<iframe>` of signed URL (height 70vh) + "Abrir en pestaña nueva" fallback button.
- Other → file icon + "Abrir archivo" button only.
- Header chips: file name · category · uploaded date · expiration (with state color) · review status · worker name.
- Footer slot for `actions` (approve/reject/correct expiration buttons are passed by parent — no logic moved).

New shared dialog: `src/components/documents/DocumentPreviewDialog.tsx` (Sheet/Dialog wrapper).

Wire it in:
- `DocumentsCenter.tsx` — "View" button opens the dialog (keeps new-tab as secondary action).
- `WorkerDocumentsCompliance.tsx` — same.
- `MyDocuments.tsx` — same, plus auto-open after successful upload (worker sees what they uploaded).

Mobile 390: dialog → full-screen Sheet; PDF iframe falls back to "Abrir archivo" button on touch devices where iframe PDF is unreliable (detect by `navigator.userAgent` iOS → button-only).

### Part 2 — Extraction result shape (TypeScript only, no DB yet)
New file `src/lib/documents/extraction-types.ts`:

```ts
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ExtractionSource = 'manual' | 'ai' | 'ocr';

export interface DocumentExtraction {
  extracted_full_name?: string | null;
  extracted_document_type?: string | null;
  extracted_document_number_masked?: string | null; // ALWAYS masked: last 4 only
  extracted_issue_date?: string | null;             // ISO date
  extracted_expiration_date?: string | null;        // ISO date
  extracted_state_or_jurisdiction?: string | null;
  extracted_birth_date?: string | null;             // optional, dropped for SSN/W-9 categories
  confidence_score?: number | null;                 // 0..1
  confidence_level?: ConfidenceLevel | null;
  extraction_source: ExtractionSource;
  extracted_at: string;
  needs_human_confirmation: boolean;                // default true
  confirmed_by?: string | null;
  confirmed_at?: string | null;
}
```

Plus a masking helper `maskDocumentNumber(raw: string): string` → `••• ••• 1234`.

### Part 3 — Manual extraction form (admin)
New component `src/components/documents/AssistedExtractionPanel.tsx`, rendered inside the preview dialog (admin only):
- Inputs: full name, doc type (select), document number (masked-on-blur), issue date (SmartDateInput), expiration (SmartDateInput), state/jurisdiction, birth date (collapsed, off by default).
- Buttons:
  - "Confirmar y guardar" → only writes `expires_at` to `employee_documents` via existing `updateDocumentExpiration` (no new column writes).
  - Other fields display-only in v1 until DB schema is approved (see Part 8).
- Banner: "Estos datos son sugerencias. Solo se guardará la fecha de vencimiento confirmada por un administrador."

### Part 4 — "Leer documento" AI suggestion (feature-flagged, suggestion-only)
- New edge function `supabase/functions/document-extract/index.ts` (verify_jwt = true).
  - Input: `{ employee_document_id }`.
  - Loads row, signs URL, fetches file bytes, posts to Lovable AI Gateway (`google/gemini-2.5-flash`) as image (PDFs: first-page render skipped in v1 — returns "PDF aún no soportado").
  - Strict JSON response schema matching `DocumentExtraction` minus confirmation fields.
  - **Always masks document number server-side** (regex keeps last 4).
  - **Returns suggestion only — writes nothing to DB.**
  - RLS gate: caller must be admin/owner of the document's `company_id` (reuse `has_role` / company membership helper used elsewhere).
- Frontend: "Leer documento (beta)" button inside `AssistedExtractionPanel` (admin only, hidden behind `import.meta.env.DEV || feature flag`). On click → calls function → pre-fills form fields (read-only highlight). Admin must explicitly Confirm.

### Part 5 — Portal upload flow
In `MyDocuments.tsx`:
- After upload → open `DocumentPreviewDialog` automatically.
- If expiration is required by policy and missing → inline "Agrega la fecha de vencimiento" with `SmartDateInput` (already exists, just wire to post-upload state).
- Helper text: "Revisaremos el documento antes de marcarlo como aprobado."
- No worker access to extraction panel. No auto-approve.

### Part 6 — Admin review flow additions
In preview dialog (admin) show a "Mismatch warnings" strip computed client-side from row + employee:
- Name on document differs from worker profile (only flagged if extraction confirmed by admin).
- Expiration missing (uses existing policy).
- Document expired (uses `classifyExpiration`).
- Category may be wrong (only when AI suggestion's `extracted_document_type` differs from saved category — pure suggestion).

Approve/reject buttons remain owned by `WorkerDocumentsCompliance` / existing action layer — preview dialog accepts them via prop, doesn't reimplement.

### Part 7 — Privacy / security
- Document number never stored raw client-side — masking helper applied before any state set.
- Edge function masks before returning.
- No new storage buckets. No policy changes. Signed URLs only (1h TTL, existing).
- SSN/EIN doc categories (`w9`, `tax_form`) → AI button hidden, extraction panel shows "Categoría sensible — extracción asistida deshabilitada."
- Audit trail: reuse existing `document_actions` audit log (already called by `updateDocumentExpiration`).

### Part 8 — DB schema (deferred, propose only)
**Not applied in this sprint.** Proposed for v1.1 if approved:
```sql
ALTER TABLE public.employee_documents
  ADD COLUMN extraction jsonb,                       -- masked-only DocumentExtraction
  ADD COLUMN extraction_confirmed_by uuid,           -- auth.users.id
  ADD COLUMN extraction_confirmed_at timestamptz;
```
RLS: admins of the same `company_id` may read/write `extraction*`. Workers may read only `extraction_expiration_date` projection if confirmed (handled via view, not direct grant).

Stop here for explicit approval before migrating.

---

## Files to change / create

**Create**
- `src/components/documents/DocumentPreview.tsx`
- `src/components/documents/DocumentPreviewDialog.tsx`
- `src/components/documents/AssistedExtractionPanel.tsx`
- `src/lib/documents/extraction-types.ts`
- `supabase/functions/document-extract/index.ts` (+ config.toml block with `verify_jwt = true`)

**Edit**
- `src/pages/admin/DocumentsCenter.tsx` — wire preview dialog into "View".
- `src/pages/portal/MyDocuments.tsx` — preview dialog + post-upload auto-open + expiration prompt.
- `src/components/employee/WorkerDocumentsCompliance.tsx` — wire preview dialog + pass approve/reject actions through.

**Untouched (regression guard)**
- payroll math, time_entries, scheduled_shifts, shift_assignments
- employee ID generation
- notifications / SMS / email
- photo review pipeline
- existing RLS, storage policies, buckets
- existing approve/reject logic (only passed through)

---

## QA checklist (run live after build)
- Admin: open `/app/documents` → "View" → image and PDF previews render; expiration still editable; AI button hidden for w9/tax_form; "Leer documento" returns suggestion + does not write to DB.
- Profile: same preview dialog opens in `WorkerDocumentsCompliance`.
- Portal: upload → dialog opens → expiration prompt for required categories → "Revisaremos el documento..." copy visible → no auto-approve.
- Mobile 390: dialog full-screen, no overflow, buttons tappable, iOS shows "Abrir archivo" fallback for PDFs.
- Security: no SSN/EIN visible anywhere, document number always masked, signed URL still 1h, no new buckets/policies in network tab.
- Regression: no payroll/time_entries/shifts/employee-id/notification/photo-review changes.

**Return after build**: files changed, whether edge function deployed, QA PASS/FAIL, and explicit ask for approval before applying Part 8 schema.
