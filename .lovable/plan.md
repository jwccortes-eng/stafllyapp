# Security Hardening Sprint — StaflyApps

Security-only batch. No UI work, no payroll/business logic changes, no RLS loosening. Each fix is isolated and auditable.

## Approach

One migration per finding (or tight group), reviewed before apply. Edge function edits are surgical. After each block I'll pause for QA before moving on, so we don't touch payroll/portal/shifts in an uncontrolled way.

Order is by risk × blast radius (criticals first, hard ones last).

---

## Phase 1 — RLS hardening (DB migrations)

### M1. `auth_rate_limits` (Finding #1)
- Drop the `has_role(auth.uid(),'admin')` SELECT policy.
- Replace with `is_global_owner(auth.uid())` only (service role already bypasses RLS for the edge functions that write it).
- No writes touched.

### M2. Compensation / pay-rate tables (Finding #2)
Tables: `compensation_analysis_summary`, `compensation_change_log`, `company_compensation_rules`, `payroll_rate_snapshots`.
- Replace broad member SELECT with the same gate used on `compensation_profiles`:
  `is_global_owner(uid) OR is_company_owner(uid, company_id) OR user_is_company_admin(uid, company_id) OR has_action_permission(uid, company_id, 'manage_compensation')`.
- Workers keep their own data via existing self-scoped policies (verify each table has one; if not, add a `WHERE employee_id = current employee` policy so the worker portal doesn't break).

### M3. `locations_v2` cross-tenant writes (Finding #7)
- Drop bare `has_role(...,'admin')` on INSERT/UPDATE/DELETE.
- Replace with `is_global_owner(uid) OR user_is_company_admin(uid, company_id)`.
- SELECT already scoped — untouched.

---

## Phase 2 — SECURITY DEFINER audit (DB migration)

### M4. Findings #5, #10, #11
- Run `supabase--linter` + query `pg_proc`/`pg_views` to list all SECURITY DEFINER functions and views in `public`.
- For each:
  - Add `SET search_path = public` if missing.
  - `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` unless intentionally callable.
  - Re-`GRANT EXECUTE` only to the roles that actually need it (mostly `authenticated` for self-scoped RPCs, none for internal helpers).
- For SECURITY DEFINER views: convert to SECURITY INVOKER where possible, or wrap behind an RPC.
- Document each kept-as-is function with reason.

Risk: this is the highest-blast-radius migration. I'll list every function + intended grant in the migration description and pause for explicit approval before applying.

---

## Phase 3 — Storage policies

### M5. `kiosk-photos` UPDATE/DELETE (Finding #9)
Add scoped policies mirroring existing `kiosk_photos_insert_scoped`:
- DELETE: `is_global_owner OR user_is_company_admin(uid, try_path_uuid(name,1))`
- UPDATE: same gate.

---

## Phase 4 — Edge functions

### EF1. Cron fail-closed (Finding #4)
Files: `auto-close-periods`, `trial-downgrade`, `shift-reminders`, `invite-reminders`, `generate-reviews`.
- Change gate from "check only if set" to:
  ```ts
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) return 401;
  ```
- Remove the TODO comments.
- Confirm `CRON_SECRET` is configured via `secrets--fetch_secrets`; if missing, ask user to add it before deploy so cron doesn't break.

### EF2. `front-desk-checkin` auth + error sanitization (Findings #3, #6)
- `update_self`, `capture_kiosk_photo`: require `phone + pin`, verify against `employees.access_pin` (matches existing kiosk-clock pattern) before any write. Reject otherwise.
- `list_payments`: require same phone+PIN gate.
- `update_visit`, `close_visit`, `submit_rating`, `start_visit`: require the visit's `employee_id` to match the PIN-verified employee.
- Replace every `err.message` returned to caller with static `"Internal error"`; keep `console.error` server-side for debugging.
- Same sanitization on `auto-close-periods` line 48.

---

## Phase 5 — PINs (Finding #8)

PIN hashing is a hard, multi-touch change (kiosk-clock, employee-auth provision/change, password reset flows, migration of existing rows). It also affects worker login at scale.

**Recommendation:** do NOT bundle this into the security batch. Instead:
- Open a dedicated tracked task (PIN-Hashing Sprint) with: bcrypt RPC, migration of existing PINs to hash on next successful login (lazy upgrade), kiosk-clock + employee-auth refactor, QA across portal/kiosk/invite/reset.
- This batch: tighten the surface only — confirm no client query selects `access_pin` (already enforced via RPCs in `src/lib/access-pin.ts`), and grep to verify.

I'll mark finding #8 as **deferred with documented plan**, not "fixed".

---

## Phase 6 — QA

After each phase:
- `supabase--linter`
- `bunx tsc --noEmit`
- `bunx vitest run`
- Re-run `security--run_security_scan`.
- Manual smoke (you): admin shifts loads, worker portal loads, payroll page loads for admin only, kiosk clock-in still works, kiosk profile-update now requires PIN.

Final report: per-finding PASS / DEFERRED / FALSE_POSITIVE table, files/migrations/policies/grants changed.

---

## What I will NOT touch
- `time_entries`, `scheduled_shifts`, `shift_assignments`, payroll math, notifications.
- S1/S3/S4 shifts work (just shipped).
- Worker portal UI.
- Any business logic.

## Open questions before I start
1. Approve deferring PIN hashing (Finding #8) to its own sprint? Or do you want it in-scope now (much bigger change, higher regression risk)?
2. For `front-desk-checkin` — confirm the kiosk uses phone+PIN (same pattern as `kiosk-clock`) as the auth gate? If kiosk has a different auth model (device token, etc.), tell me before I wire PIN verification.
3. OK to apply migrations one phase at a time with your approval between each, or batch Phase 1+2+3 together?
