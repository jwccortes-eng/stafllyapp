E4.1 — Read-only display of `preferred_name` in the admin worker profile

1. Objective

Surface the worker-editable `preferred_name` alias inside the admin worker profile (`/app/employees/:id`) as read-only metadata. The legal name (`first_name` / `last_name`) remains the primary identity everywhere. This is purely informational for operators and admins.

Scope: read-only UI only. No new tables, no migrations, no RLS, no policies, no data writes, no payroll/time_entries/tenants/auth changes. The column already exists from E4.

2. Surface proposed

Two read-only locations inside the existing admin profile page:

A. Hero header (`UnifiedPersonProfile.tsx`)
   - Keep the current large legal name as the main title.
   - If `employee.preferred_name` is non-null and non-empty, render a muted secondary line immediately below or beside the legal name, e.g.:
     "También conocido/a como: <preferred_name>"
   - The alias is never the headline, never used in page title, and never replaces the avatar initials (which stay based on legal name).

B. "Datos principales" card (`ProfileSummaryGrid.tsx`)
   - Add a new `Row` in the first card, shown only when `employee.preferred_name` exists:
     - Icon: `ContactRound` (or a lightweight alias icon if available)
     - Label: "Alias"
     - Value: `employee.preferred_name`
   - If `preferred_name` is null/empty, the row is simply omitted. No "Sin alias" placeholder.

3. Files to touch

- `src/lib/employee-columns.ts`
  - Add `preferred_name` to the `EMPLOYEE_COLUMNS_NO_FISCAL` select list so the admin profile fetch already returns it.

- `src/pages/admin/UnifiedPersonProfile.tsx`
  - Add display of `preferred_name` in the hero header (read-only, no edit control).

- `src/components/employee/ProfileSummaryGrid.tsx`
  - Add a conditional `Row` in the "Datos principales" card.

- `src/integrations/supabase/types.ts`
  - Likely already updated by E4 final; verify it is present, no manual change required unless the type is stale.

Files NOT touched:
- `src/pages/portal/UpdateCenter.tsx`
- `src/components/portal/WorkerSelfServiceSections.tsx`
- `worker_consent_records`, `ConsentCenterCard`, `useWorkerConsent`, `parceros-sync`, `PARCEROS_CONSENT_MODE`, `PublicPassport`, `worker_profiles`, `profiles`, `passport_profiles`, `contractor_w9`, `employee_documents`, `review_scores`, payroll, time_entries, companies/tenants, auth, RLS, edge functions, storage.

4. Display behavior

- Legal name is always the primary displayed name in every surface.
- Preferred name is rendered as a subordinate, muted badge/line, never as a replacement.
- If `preferred_name` is null or empty string, no alias UI is shown. No empty states, no "Sin alias" labels.
- If the worker changes `preferred_name` in the portal, admins will see the updated value on the next profile load (existing fetch already happens on mount and snapshot refresh does not touch the core record, but navigating back re-fetches).

5. No-impact confirmation

- Payroll: `preferred_name` is never used in payroll math, pay periods, `period_base_pay`, or `time_entries`.
- W-9 / 1099 / SSN: legal name remains `first_name` / `last_name`; no changes to `contractor_w9`, `tax_forms_1099`, `verification_ssn_ein`, or `ssn_last4`.
- Documents: no change to document generation, review, or storage; `preferred_name` is not used in documents.
- PublicPassport: not consumed by `PublicPassport` or `passport_profiles`.
- Parceros: not consumed by `parceros-sync`, `PARCEROS_CONSENT_MODE`, or marketplace surfaces.
- Auth / tenants / RLS / schema: no changes. The column already exists from E4; we only read it and display it.
- Data writes: zero. The change is read-only from the admin side.

6. QA mobile / desktop

Desktop (1280+ CSS px):
- Navigate to `/app/employees/:id` for a worker with `preferred_name` set.
- Confirm hero shows legal name first, then the alias as muted secondary text.
- Confirm "Datos principales" card includes the alias row.
- Confirm the alias is not shown when the value is null/empty.
- Confirm no layout breaks, overflow, or truncation issues with 60-character aliases.
- Confirm the existing "Editar" button and all other hero actions still work.

Mobile (390x844 CSS px):
- Open the same profile on mobile viewport.
- Confirm hero alias line wraps correctly and does not push action buttons off-screen.
- Confirm "Datos principales" card still stacks in one column and the alias row fits.
- Confirm no horizontal scroll is introduced.

7. Rollback

If the display needs to be removed:
- Remove the `preferred_name` line from the hero in `UnifiedPersonProfile.tsx`.
- Remove the conditional `Row` in `ProfileSummaryGrid.tsx`.
- Optionally remove `preferred_name` from `EMPLOYEE_COLUMNS_NO_FISCAL` (safe, but leaving it has no functional impact).
- No database rollback required because no schema or data was changed.
- No RLS/policy rollback required.

8. Acceptance criteria

- [ ] `preferred_name` is added to `EMPLOYEE_COLUMNS_NO_FISCAL` so it is fetched on the admin profile page.
- [ ] Admin profile hero shows the legal name first and the alias only as secondary, muted text.
- [ ] "Datos principales" card shows the alias row only when `preferred_name` is non-null/non-empty.
- [ ] No alias UI is shown when `preferred_name` is null/empty.
- [ ] No admin edit control for `preferred_name` is introduced; it remains editable only by the worker in `/portal/update-center`.
- [ ] No changes to payroll, W-9, documents, PublicPassport, Parceros, time_entries, tenants, auth, RLS, or schema.
- [ ] Mobile and desktop visual QA passes without overflow or layout regressions.
- [ ] Rollback steps are documented and reversible without data loss.

Deuda técnica a mantener: la policy `Employees can update own profile` sigue siendo amplia. E4 documentó esto como deuda técnica futura. E4.1 no la amplía ni la modifica.