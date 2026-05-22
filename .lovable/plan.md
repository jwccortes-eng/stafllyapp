## Worker W-9 Guided Form v1 — Plan

### Audit findings (already in the codebase)

- **Table `contractor_w9` exists** with the right shape for safety:
  - `legal_name, business_name, tax_classification, tin_last4` (only last 4 stored — no raw SSN/EIN column)
  - `address_line1/2, city, state, zip_code, signed_at, signed_by, w9_file_url, status, submitted_at, reviewed_at, reviewed_by`
  - RLS already enforces: employees can view/insert/update only their own row; company admins/global owners can manage company-scoped rows. No anon, no public.
- **Worker portal page exists**: `src/pages/portal/MyW9.tsx` (`/portal/w9`) — basic form, no certification, no signature, no PDF, no `employee_documents` linkage.
- **Admin page exists**: `src/pages/admin/ContractorW9.tsx` (`/app/contractor-w9`) — table view with approve action; W-9 is NOT surfaced in `/app/documents`.
- **PDF generation is available**: `jspdf` + `jspdf-autotable` already used by `src/lib/passport-pdf.ts` and `src/lib/shift-pdf.ts`.
- **Private buckets ready**: `employee-documents` and `worker-documents` are both `public:false`.
- **`employee_documents` table** has: `category, file_url, file_type, file_size, review_status, expires_at, reviewed_by/at, rejection_reason` — already used by Documents Center + worker portal documents.
- **Document policy** (`src/lib/documents/document-policy.ts`) already marks `w9` as sensitive, no expiration, AI extraction blocked.

### Recommended sensitive-storage model — Option A (preferred)

- Worker types full TIN in the form **only in memory during submission**.
- We **never persist raw SSN/EIN** in any DB column or in the PDF stored on disk.
- We store:
  - `contractor_w9.tin_last4` (already exists) + `tax_id_type` ('ssn' | 'ein')
  - Generated signed PDF in **private `employee-documents` bucket** at `company_id/employee_id/w9/w9_<timestamp>.pdf`
  - An `employee_documents` row with `category='w9'`, `review_status='pending_review'`, `file_url=<storage path>` so the W-9 shows up in `/app/documents` and the existing review flow.
  - `contractor_w9.w9_file_url` = same storage path (cross-link).
- The PDF rendered inside the bucket shows **`***-**-1234`** for the TIN (masked). Raw TIN is discarded after the client builds the PDF.
- No edge function needed for v1 — the worker browser builds the PDF with `jspdf` and uploads via the existing authenticated Supabase client (RLS already restricts).

### Schema changes proposed (small, additive)

Only if you approve, one migration adds:

- `contractor_w9.tax_id_type text check (tax_id_type in ('ssn','ein')) null`
- `contractor_w9.llc_tax_classification text null` (C/S/P when classification = LLC)
- `contractor_w9.exempt_payee_code text null`
- `contractor_w9.fatca_code text null`
- `contractor_w9.account_numbers text null`
- `contractor_w9.signature_name text null` (typed signature)
- `contractor_w9.certification_accepted boolean default false`

No raw TIN column. No SSN/EIN exposure. Existing RLS already covers new columns.

### Worker portal UX (`/portal/w9`, also a card on `/portal/documents` and `/portal/update-center`)

1. Card titled **"Formulario W-9"** with copy *"Completa y firma tu W-9 para mantener tu información fiscal actualizada."*
2. Full IRS-aligned field set (legal name, business name, federal classification, LLC sub-classification when LLC, exempt payee, FATCA, address line 1/2, city/state/zip, account numbers optional).
3. Tax ID block: `tax_id_type` toggle (SSN / EIN), masked input (`type="password"`), helper text *"Tu número no se guarda en texto plano — solo los últimos 4 dígitos quedan visibles."*
4. Certification block:
   - Checkbox: *"Certifico bajo pena de perjurio que la información es correcta…"* (IRS-style summary, Spanish)
   - Typed signature input (must exactly match `legal_name`)
   - On submit: stamp `signed_at` (MM/DD/YYYY in UI), build PDF client-side, upload to private bucket, write `contractor_w9` row + `employee_documents` row with `status='pending_review'`.
5. After submit: shows pending state, signed date, masked TIN, *"W-9 enviado para revisión."* If rejected, allow re-submit.

### Admin review

- `/app/documents` now lists the new `employee_documents` row (`category=w9`) so it flows through the existing approve/reject UI and preview dialog.
- `/app/contractor-w9` keeps its overview; the row gains a *"Ver PDF"* button that opens a short-lived signed URL.
- Nowhere in admin lists or profile screens do we show raw SSN/EIN — only `***-**-1234`.

### Things explicitly NOT done in v1

- No IRS e-file, no SSN/EIN persistence, no AI/OCR (policy already blocks it).
- No notifications, no auto-approval.
- No portal-permission, payroll, time_entries, shifts, or employee-ID changes.
- No public storage. No new broad SELECT grants.

### Files to touch (if approved)

- New: `src/lib/w9/w9-pdf.ts` (jsPDF builder, accepts in-memory full TIN to render masked PDF, never returns/saves raw)
- New: `src/lib/w9/w9-types.ts` (form schema + zod validation)
- New: `src/components/portal/W9GuidedForm.tsx`
- Edit: `src/pages/portal/MyW9.tsx` (use new form + PDF upload + `employee_documents` insert)
- Edit: `src/pages/portal/MyDocuments.tsx` and `src/pages/portal/UpdateCenter.tsx` (add W-9 card entry)
- Edit: `src/pages/admin/ContractorW9.tsx` (add "Ver PDF" via signed URL; show masked TIN only)
- Optional small touch: `src/pages/admin/DocumentsCenter.tsx` already lists `employee_documents` rows — verify W-9 appears with sensitive badge (no extraction button).
- Migration: additive columns on `contractor_w9` (only with approval).

### QA plan (run after implementation)

- Worker `/portal/w9`: validate required fields; typed signature must equal legal name; submit creates PDF + `employee_documents` row + `contractor_w9` row; pending state visible; only `***-**-1234` shown after.
- Admin `/app/documents`: W-9 visible as pending; signed-URL preview opens; approve/reject works; no SSN/EIN in DOM/network.
- Network tab: submit request body contains TIN only in the encoded PDF blob (server side stores the masked PDF + last4); no raw TIN in `contractor_w9` payload.
- RLS: a second worker cannot SELECT another's `contractor_w9` row; anon blocked.
- Regression: payroll, shifts, time_entries, employee IDs, photo review, notifications — untouched.

### Awaiting approval

I will not run the migration or write any code until you confirm Storage Model A and the additive `contractor_w9` columns above.
