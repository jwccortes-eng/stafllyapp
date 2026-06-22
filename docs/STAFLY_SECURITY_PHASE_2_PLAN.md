# Stafly Security Phase 2 — Plan (Sprint S3, READ-ONLY)

**Date:** 2026-06-22
**Status:** AUDIT + PLAN ONLY. No migrations, no RPC changes, no GRANT/REVOKE,
no edge function changes, no RLS changes, no PIN backfill, no writes.
**Authors:** Stafly platform.

This document is the foundation for two upcoming P1 security sprints:
**S4 — PIN hashing** and **S5 — SECURITY DEFINER hardening**. Nothing in this
document executes change. Implementation requires its own approved sprint per
section.

---

## 0. Guardrails (re-confirmed for S3)

Not touched in this sprint and not allowed in the implementation sprints
without an explicit user approval:

- `auth` logic, `RLS` policies, `user_roles`, `has_role`, `has_company_role`,
  `canAccessAdminForCompany`, `useEffectiveEmployee`.
- Payroll: `pay_periods`, `period_base_pay`, `payroll_adjustments`,
  `reconciliation_*`, `historical_payroll_entries`, payroll calculations,
  payroll exports, Connecteam pipeline.
- Operations: `time_entries`, `clock_events`, `scheduled_shifts`,
  `shift_assignments`.
- Tenants: `companies.status` / `is_active` triggers, `setup-company` edge
  function, real production tenants.
- Edge functions touched only after explicit sprint approval:
  `kiosk-clock`, `employee-auth`, `front-desk-checkin`, `approve-application`,
  `send-employee-credentials`, `bulk-portal-invite`.

---

## 1. PIN usage audit

### 1.1 Schema reality (verified via `information_schema`)

`public.employees` currently has:

| Column | Type | Notes |
|---|---|---|
| `access_pin` | `text` | **Plaintext PIN.** Used by kiosk-clock, employee-auth, front-desk-checkin. |
| `must_change_pin` | `boolean` | Set when admin issues a default/reset PIN. |

`access_pin_hash` is **NOT** a real column in `public.employees`. The single
reference in `src/components/employee/ProfileSummaryGrid.tsx` (~L220) is
**dead/forward-looking code** — it reads a property that does not exist on
the row and therefore always evaluates falsy. No runtime breakage, but it
must be ignored as evidence of an existing hash pipeline.

There is also no `pin_set_at`, `pin_attempts`, `pin_locked_until`, or
`access_pin_salt`.

### 1.2 Where PIN is read (plaintext)

| Surface | File | Behavior |
|---|---|---|
| Kiosk clock | `supabase/functions/kiosk-clock/index.ts:118,129` | `SELECT access_pin … WHERE phone_number=?`; compares `employee.access_pin === pin` string-equal. |
| Worker portal auth | `supabase/functions/employee-auth/index.ts` (many lines) | Activation: writes `access_pin = <chosen pin>` plaintext (L346). Login: string-equal compare (L589). Also seeds Supabase auth user with password derived from `authPassword(access_pin)` (L822, L765). |
| Front-desk check-in | `supabase/functions/front-desk-checkin/index.ts:144,157,160,209,210` | Comment explicitly: "PIN path — equality match against stored access_pin". |
| Admin profile UI | `src/components/employee/EmployeeAccessTab.tsx`, `PortalAccessCard.tsx`, `EmployeeProfileTabs.tsx` | Only **existence** is shown to the admin (via `employee_has_access_pin` RPC); the value itself is never returned to the browser unless freshly reset via `reset_employee_access_pin` RPC (returns the new PIN exactly once). |
| Frontend helpers | `src/lib/access-pin.ts` | Wraps three RPCs: `employee_has_access_pin`, `reset_employee_access_pin`, `set_employee_access_pin`. Frontend **never** reads `access_pin` directly anymore — Phase B already enforced that. |

### 1.3 Where PIN is written

- **`employee-auth` activation (L346, L765, L882)** — sets plaintext via
  service-role client.
- **`reset_employee_access_pin` / `set_employee_access_pin`** RPCs — issued
  by admin from the profile UI. Both write to `employees.access_pin`
  plaintext via SECURITY DEFINER.
- **`bulk-portal-invite`, `send-employee-credentials`, `seed-test-users`,
  `approve-application`, `resolve-applicant-identity`** — touch `access_pin`
  during onboarding / invite / activation paths.
- **Migrations**: 10+ historical migrations created/modified the column and
  related defaults (see grep list in §6).

### 1.4 Who can read the plaintext PIN

- Frontend: **nobody**. All UI uses the existence-only RPC.
- Edge functions: anything running with `SUPABASE_SERVICE_ROLE_KEY` (kiosk,
  employee-auth, front-desk, invites).
- DB-level: the `access_pin` column has had its column-grants hardened in
  Phase 1.5 (only allowed roles can `SELECT` it). RLS still applies on top.

### 1.5 Risks

| # | Risk | Severity |
|---|---|---|
| P1 | **Plaintext PINs at rest** — service-role logs, DB backups, or any future audit dump exposes raw PINs. | **HIGH** |
| P2 | **No PIN attempt limiting** — kiosk-clock and employee-auth do raw string-equal. A 4-digit space (10,000) is trivially brute-forceable if rate limits ever drop. | HIGH |
| P3 | **PIN reuse across tenants** — same worker phone may exist in multiple companies with different PINs; the activation path picks "first with PIN" or "first one" (employee-auth L569). Race / wrong-tenant binding risk. | MED |
| P4 | **`authPassword(access_pin)` derives the Supabase auth password from the PIN.** Rotating PIN format requires also rotating that derivation. | MED |
| P5 | **No `pin_set_at` / lockout columns** — can't tell stale PINs from fresh ones; can't lock after N failures. | MED |
| P6 | Dead reference to `access_pin_hash` in `ProfileSummaryGrid` suggests prior aborted attempt — easy to confuse future contributors. | LOW |

---

## 2. PIN hashing implementation plan (S4 proposal, NOT executed)

### 2.1 Algorithm

**Recommendation: `pgcrypto.crypt(pin || per_row_salt, bcrypt_salt)` with
work-factor 10, executed inside SECURITY DEFINER RPCs.**

Why not bcrypt-in-Deno: kiosk-clock and front-desk-checkin already round-trip
through Postgres; doing the comparison in SQL keeps the plaintext out of edge
function memory entirely (`SELECT crypt($1, access_pin_hash) = access_pin_hash`).

Why bcrypt (not sha256/argon2):

- `pgcrypto` ships in Supabase; no new extensions, no new edge runtime deps.
- Work-factor lets us slow brute-force even with the tiny 4-digit space.
- argon2 not available out-of-the-box; adding it expands surface.

### 2.2 New columns (S4 migration, NOT in S3)

```sql
ALTER TABLE public.employees
  ADD COLUMN access_pin_hash text,                   -- bcrypt output
  ADD COLUMN pin_set_at timestamptz,
  ADD COLUMN pin_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN pin_locked_until timestamptz;
```

Per-column GRANTs (Phase 1.5 model): `access_pin_hash` granted SELECT only to
`service_role` and the existing privileged column-whitelist; **never** to
`anon`/`authenticated`. `pin_locked_until` and `pin_attempts` granted to
`authenticated` only to surface lockout banners in the portal.

`access_pin` is **NOT dropped in S4.** Dual-write is the safety net.

### 2.3 Migration strategy — dual-write, single-read flip

Phase order (each phase a separate sprint, each independently reversible):

1. **S4-A (additive only)**: add columns above; backfill `access_pin_hash`
   from existing `access_pin` via one-shot `UPDATE employees SET
   access_pin_hash = crypt(access_pin, gen_salt('bf',10)), pin_set_at = now()
   WHERE access_pin IS NOT NULL`. Backfill runs once, in a transaction,
   inside a maintenance window on demo tenant first.
2. **S4-B (dual-write)**: update `set_employee_access_pin`,
   `reset_employee_access_pin`, and the `employee-auth` activation path to
   write **both** `access_pin` AND `access_pin_hash` for every new PIN.
   Readers still use `access_pin`. Zero behavior change for workers.
3. **S4-C (hash-read flip)**: kiosk-clock, employee-auth login,
   front-desk-checkin switch their comparison to
   `SELECT crypt($1, access_pin_hash) = access_pin_hash`. Plaintext
   `access_pin` kept as fallback for any row where hash is null (should be
   zero after S4-A backfill, but defensive).
4. **S4-D (kill plaintext)**: after 2 weeks of clean logs, REVOKE all SELECT
   on `access_pin` and overwrite the column to NULL. Column dropped in a
   separate later sprint after one full payroll cycle.

### 2.4 Lockout

In S4-C: each failed compare increments `pin_attempts`; on `>= 5`, set
`pin_locked_until = now() + interval '15 minutes'` and reject further
attempts until cleared. Lockout cleared on successful PIN compare or admin
reset.

### 2.5 Anti-lockout safeguards

- Backfill runs on **`Stafly Demo` tenant first** (memory: Stafly Demo
  Environment, `is_demo=true`, id `d3500000-…0001`).
- S4-B and S4-C are gated by a feature flag in `company_settings` namespace
  `security.pin_hash_enabled` (default false). Flip per-tenant, owner-only.
- Real tenants (Quality Staff, Eminence, Milenium, Hamaspik, MyStaff, Zemer,
  JKitchen, Parceros) only flipped after Stafly Demo + Quality QA tenant pass.
- `must_change_pin` flow untouched.

### 2.6 Audit (no PIN exposure)

- Never log the plaintext PIN, ever — including failure paths.
- Log only: `employee_id`, `tenant_id`, `surface` (kiosk/portal/front-desk),
  `outcome` (ok/wrong/locked), `attempt_count_after`.
- Sink: existing `sensitive_data_audit_log`.

### 2.7 Rollback

Per phase:

- **S4-A**: drop new columns. Reversible in < 1 minute.
- **S4-B**: revert RPC to single-write. Hash column populated but unused; safe.
- **S4-C**: feature-flag flip back to plaintext compare (both are dual-read).
- **S4-D**: cannot rollback once `access_pin` is nulled. Require user
  approval, payroll-cycle delay, and one-week observation.

### 2.8 QA matrix

| Scenario | Demo | Quality QA | Real (last) |
|---|---|---|---|
| Worker portal login with existing PIN | required | required | required |
| Kiosk clock-in with PIN | required | required | required |
| Front-desk PIN check-in | required | required | required |
| Admin reset PIN → worker logs in | required | required | required |
| Admin set PIN (manual) → kiosk clock | required | required | required |
| 5 failed PIN attempts → lockout | required | required | required |
| Locked worker waits 15m → can login | required | required | required |
| `must_change_pin` flow unchanged | required | required | required |
| Cross-tenant phone match (multi-record) | required | required | required |
| `authPassword(access_pin)` Supabase auth password unchanged | required | required | required |

---

## 3. SECURITY DEFINER audit (live DB snapshot)

Sampled `pg_proc` for `n.nspname='public' AND p.prosecdef=true`:

| Metric | Count |
|---|---|
| Total SECURITY DEFINER functions in `public` | **123** |
| Missing explicit `search_path` | **0** ✅ |
| Granted EXECUTE to `PUBLIC` (i.e. `anon` + `authenticated` + others) | **≥50** |
| Granted EXECUTE to `anon` directly | 0 (see Phase 2A.1 cleanup) |
| Granted EXECUTE to `authenticated` directly | 0 |

**Good news:** Phase 2A.1 already revoked PUBLIC/anon/authenticated from 40
trigger handler functions, and every SECURITY DEFINER function has
`search_path` pinned (a P0 ask in many audits — already done here).

**Still open:** 50+ callable SECURITY DEFINER RPCs still have an `EXECUTE …
TO PUBLIC` legacy grant. The default trigger from `CREATE FUNCTION` grants
EXECUTE to PUBLIC; Phase 2A.1 cleaned trigger handlers, not callable RPCs.

### 3.1 Callable PUBLIC-grant RPCs (subset, full list in pg_proc query)

Bucketed by risk for S5 prioritization:

**P0 — must keep PUBLIC (or `authenticated`) — DO NOT TOUCH:**

These are gateways used by RLS policies and routing. Revoking PUBLIC will
break RLS itself.

- `has_role`, `has_company_role`, `has_exact_company_role`, `is_company_owner`,
  `is_global_owner`, `is_founder`, `user_company_ids`, `user_is_company_admin`,
  `user_is_assigned_to_shift`, `is_conversation_member`,
  `worker_owns_employee_document_scope`, `worker_can_access_employee_doc_path`,
  `company_user_can_access_employee_doc_path`, `user_can_access_worker_docs`,
  `has_module_permission`, `has_action_permission`, `try_path_uuid`,
  `has_active_assignment_override`, `shift_closeout_can_admin`,
  `shift_closeout_can_final_approve`.

**P1 — narrow grant to `authenticated` (drop PUBLIC) in S5:**

- `compute_employee_profile_status`, `compute_profile_stage`,
  `get_employee_for_activation`, `get_employee_shift_readiness`,
  `get_profile_status`, `get_required_documents_for_company`,
  `get_company_by_invite_code`, `get_invitation_by_token`,
  `pick_workers_to_rate`, `generate_shift_review_requests`,
  `register_onboarding_document`, `recalculate_review_score`,
  `recalculate_rep_score`, `log_activity`, `log_activity_detailed`,
  `log_sensitive_access`, `find_employee_duplicate_groups`,
  `supersede_employee_invitations`, `apply_role_template`,
  `employee_has_locked_payroll`, `publish_shift_draft`.

**P2 — admin/owner-only (revoke PUBLIC, grant to `service_role` only) in S5:**

- `consolidate_passport`, `consolidate_all_passports`,
  `consolidate_period_base_pay`, `cleanup_expired_rate_limits`,
  `expire_old_invitations`, `can_manage_shift_company`.
  (These run from edge functions / cron, not the browser.)

**P3 — unauthenticated entry points (keep PUBLIC, but verify body is
tenant-safe):** `anon_can_upload_onboarding_doc`,
`get_or_create_unsubscribe_token`, `find_public_company_fuzzy`,
`application_exists`. These are called by `/apply/:slug` and unsubscribe
flows; revoking PUBLIC would break those public surfaces.

### 3.2 Callable RPCs that touch sensitive domains

| RPC | Touches | Notes |
|---|---|---|
| `consolidate_period_base_pay` | `period_base_pay` (payroll) | **Do not touch in S5.** Only privilege change allowed: drop PUBLIC, grant to `service_role`. Body untouched. |
| `employee_has_locked_payroll` | reads payroll lock state | P1 narrow to `authenticated`. |
| `assign_worker_to_shift` | `shift_assignments` | Already body-gated; only privilege review. |
| `admin_get_employees_with_fiscal` | reads `verification_ssn_ein` | Already SECURITY DEFINER + role-gated. Verify grant is `authenticated` only. |
| `employee_has_access_pin`, `reset_employee_access_pin`, `set_employee_access_pin` | reads/writes `access_pin` | Will be re-touched in S4. **Do not touch in S5** to avoid merge collisions. |

### 3.3 S5 deliverable: **privilege-only changes**

Every S5 migration is REVOKE/GRANT only. **No function bodies are modified
in S5.** Body changes require their own sprint with payroll/portal QA matrix.

---

## 4. Multi-tenant safety

| Concern | Mitigation |
|---|---|
| Cross-tenant phone resolves to wrong company on activation | S4-A backfill runs per-tenant. S4-C login compare adds explicit `company_id` filter before `crypt(...)`. |
| `effectiveEmployeeId` / `useEffectiveEmployee` | Not touched. PIN compare happens in edge functions before the browser ever loads. |
| Company switcher / `selectedCompanyId` | Untouched. PIN flow is per-employee, not per-active-tenant. |
| Demo / test / real tenant boundary | All QA on **Stafly Demo** (`d3500000-…0001`) first, then **Quality QA**. **Never** run S4 backfill on Quality Staff, Eminence, Milenium, Hamaspik, MyStaff, Zemer, JKitchen, Parceros until demo+QA pass. |
| `is_demo` / `is_test` flag preservation | S4 migration ignores these flags; backfill is `WHERE access_pin IS NOT NULL` across all tenants but feature-flag gates the read flip per-tenant. |

---

## 5. Payroll safety — explicit confirmation

This plan, when executed in S4 and S5, **WILL NOT**:

- modify payroll calculations or any function that computes `base_pay`,
  `consolidate_period_base_pay`'s body, or any reconciliation logic;
- modify `pay_periods`, `period_base_pay`, `payroll_adjustments`,
  `reconciliation_*`, `historical_payroll_entries`;
- modify `time_entries` or `clock_events` schemas or any read/write path;
- modify `scheduled_shifts` or `shift_assignments` schemas;
- change payroll authority (Connecteam reconciliation remains source of truth);
- change the Connecteam import/export pipeline;
- use `scheduled_shifts` as a payroll source.

The kiosk-clock change in S4-C is a **compare-only swap** (plaintext equality
→ `crypt()` equality). It writes the same `clock_events` row it writes today.

---

## 6. Files audited (READ ONLY in S3)

**Frontend:**

- `src/lib/access-pin.ts`
- `src/lib/worker-next-action.ts`, `src/lib/worker-actions.ts`
- `src/lib/employee-duplicates.ts`, `src/lib/employee-columns.ts`
- `src/components/employee/*` (AccessTab, ProfileSummaryGrid, PortalAccessCard,
  PortalAccessBadge, EmployeeProfileTabs, BulkActivationCampaignDialog,
  EmployeeInviteDialog, QuickAddInviteWizard)
- `src/components/shifts/SingleEmployeePicker.tsx`, `ShiftRidesPanel.tsx`,
  `types.ts`
- `src/pages/admin/Employees.tsx`, `InviteEmployees.tsx`
- `src/pages/JoinCompany.tsx`, `src/pages/ActivateAccount.tsx`
- `src/hooks/useAuditLog.tsx`

**Edge functions:**

- `supabase/functions/kiosk-clock/index.ts`
- `supabase/functions/employee-auth/index.ts`
- `supabase/functions/front-desk-checkin/index.ts`
- `supabase/functions/send-employee-credentials/index.ts`
- `supabase/functions/bulk-portal-invite/index.ts`
- `supabase/functions/seed-test-users/index.ts`
- `supabase/functions/approve-application/index.ts`
- `supabase/functions/resolve-applicant-identity/index.ts`

**Migrations (historical context, not modified):**

- `20260225014542`, `20260225045627`, `20260305212335`, `20260305212713`,
  `20260306040603`, `20260321010925`, `20260425014154`, `20260503044022`,
  `20260521020341`, `20260601192019`.

**DB introspection (read-only):**

- `pg_proc` for SECURITY DEFINER inventory
- `information_schema.routine_privileges` for EXECUTE grants
- `information_schema.columns` for `employees` PIN columns

---

## 7. Risks discovered in S3

1. **`access_pin_hash` is referenced in frontend code but does not exist in
   the DB.** Easy to mislead future contributors into thinking the hash
   pipeline is partially built. Resolution: ignore in S3, fix as part of
   S4-A by introducing the real column. Until then, the boolean
   short-circuits harmlessly.
2. **`employee-auth` activation can pick the wrong record** when a phone
   exists in multiple companies (L569: "find first with `access_pin` else
   first overall"). Pre-existing risk; S4 must not regress it but also must
   not silently rebind tenants during PIN hashing.
3. **Supabase auth password is derived from plaintext PIN** in
   `employee-auth` (L765, L822, `authPassword(access_pin)`). When S4-D
   nulls `access_pin`, that derivation must be removed or replaced or
   Supabase auth users become unable to refresh. S4-D **must include** a
   plan to disable that derivation before nulling.
4. **Connecteam import does not appear to set PIN** (no hits in
   `bulk-import-shifts` / Connecteam parser for `access_pin`). Confirmed
   no import-pipeline collision.
5. PUBLIC grants on RPCs were not addressed in Phase 2A.1 (only trigger
   handlers). Real cleanup work for S5.

---

## 8. What was NOT touched in S3

- No SQL was executed; only `SELECT` introspection.
- No code files were edited (this document is the only deliverable).
- No RLS, no auth, no payroll, no edge functions, no RPCs, no grants.

---

## 9. Recommendation for next sprint

**S4 — PIN hashing, additive only (S4-A + S4-B).**

Scope cap for S4:

1. Add columns `access_pin_hash`, `pin_set_at`, `pin_attempts`,
   `pin_locked_until` with explicit per-column grants.
2. Backfill `access_pin_hash` from `access_pin` on **Stafly Demo** only.
3. Add dual-write to `set_employee_access_pin` and
   `reset_employee_access_pin`. Activation path (`employee-auth`) also
   dual-writes.
4. **No reader flip.** Kiosk/portal/front-desk continue to compare
   plaintext. Hash sits unused but populated.
5. Remove the dead `access_pin_hash` reference in `ProfileSummaryGrid` and
   re-point it at the now-real column (existence only, no value).
6. Feature flag `security.pin_hash_enabled` introduced (default false).

Out of scope for S4: read flip (S4-C), plaintext kill (S4-D), Supabase auth
password rederivation, S5 SECURITY DEFINER REVOKE pass.

**S5 — SECURITY DEFINER PUBLIC-grant cleanup (privilege-only).** Runs in
parallel with S4 only if engineering bandwidth allows; otherwise S5 follows
S4-C. Per §3.3, bodies are not modified — only REVOKE PUBLIC + GRANT
authenticated/service_role on the P1/P2 buckets.

---

## 10. Sprint S4 execution log — Additive Foundation (2026-06-22)

S4-A executed. **No reader flip, no plaintext removed, no auth/edge/payroll change.**

### Migration

Single migration applied (additive-only):

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto` (already present, v1.3 — idempotent).
2. `ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS` for:
   - `access_pin_hash text` (nullable, no constraint)
   - `pin_hash_version text` (nullable)
   - `pin_set_at timestamptz` (nullable)
   - `pin_migrated_at timestamptz` (nullable)
3. Per-column `GRANT SELECT (…) ON public.employees TO authenticated, anon`
   on the 4 new columns. Required by Phase 1.5 column-whitelist model;
   without it any client `SELECT` touching these columns would 403 the
   whole row. Bcrypt output is safe to expose to authenticated tenant
   members (RLS still scopes by company).
4. `CREATE OR REPLACE` of `set_employee_access_pin` and
   `reset_employee_access_pin` to **dual-write**: same signature, same
   gates, same plaintext write, same `activity_log` entry — plus
   `access_pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf', 10))`,
   `pin_hash_version='bcrypt'`, `pin_set_at=now()`,
   `pin_migrated_at=COALESCE(pin_migrated_at, now())`.
5. Scoped backfill for **Stafly Demo Company** only
   (`d3500000-0000-4000-8000-000000000001`,
   `name='Stafly Demo Company'`, `is_demo=true`, verified via SELECT
   before migration). Other demo tenants (`Sandbox`, `QA Testing`) were
   intentionally excluded from this sprint to keep blast radius minimal.

### Algorithm

- **bcrypt** via `pgcrypto.crypt() + gen_salt('bf', 10)`.
- pgcrypto already installed (v1.3) — no new extension required.
- Verification path for future readers: `crypt(submitted_pin,
  access_pin_hash) = access_pin_hash` (constant-time inside Postgres,
  plaintext never leaves the database).
- `pin_hash_version='bcrypt'` tags every row so future algorithm
  rotation can be staged.

### Backfill result (post-migration, verified)

| Bucket | Rows |
|---|---|
| Stafly Demo workers with plaintext PIN | 7 |
| Stafly Demo workers with hash populated | **7** ✅ |
| Non-demo workers with hash populated | **0** ✅ |
| All workers with plaintext PIN (untouched) | 518 |

Verification: `SELECT count(*) … WHERE crypt(access_pin, access_pin_hash) = access_pin_hash`
returns **7/7** for Stafly Demo — every backfilled hash round-trips against its plaintext.

### Dual-write status

Implemented in both RPCs. Existing frontend helpers (`src/lib/access-pin.ts`)
are untouched and continue to work — return shapes preserved:

- `set_employee_access_pin(uuid, text) RETURNS boolean` — unchanged signature.
- `reset_employee_access_pin(uuid) RETURNS text` — unchanged signature
  (returns the new plaintext PIN exactly once for the admin UI).

`employee-auth` activation path also writes `access_pin` directly via the
service-role client (`employee-auth/index.ts:346, 765, 882`). **It is NOT
modified in S4** — workers activating between now and S4-B will get
plaintext-only PINs. Those rows hash-populate on first admin reset/set, or
on the global S4-B backfill sprint. Acceptable: readers still use plaintext,
no lockout risk.

### Feature flag status

`security.pin_hash_enabled` — **not introduced in this sprint**. Reader flip
(S4-C) is the first phase that needs it. Adding a per-tenant boolean column
or a `company_settings` row now would be code without behavior; deferred to
S4-C migration so the flag and its first consumer ship together.

### Files changed

- **Migration only** (single SQL file authored via `supabase--migration`):
  columns + grants + 2 RPC bodies + scoped backfill.
- `docs/STAFLY_SECURITY_PHASE_2_PLAN.md` — this S4 execution-log addendum.

No application code (`src/**`, `supabase/functions/**`) was modified in S4.

### QA checklist (post-migration verification, all PASS)

- [x] Columns exist in `information_schema.columns` for `employees`.
- [x] `access_pin` plaintext intact: 518 non-null rows across all tenants
      (matches pre-migration row count of workers with PINs — confirmed
      via the same query before changes via S3 audit).
- [x] Stafly Demo backfill: 7/7 rows hashed, all verify with `crypt()`.
- [x] No real tenant has any `access_pin_hash` row.
- [x] `set_employee_access_pin` / `reset_employee_access_pin` signatures
      unchanged → frontend `src/lib/access-pin.ts` unaffected.
- [x] `kiosk-clock`, `employee-auth`, `front-desk-checkin` edge functions
      not modified → plaintext PIN validation unchanged.
- [x] Linter findings post-migration are pre-existing PUBLIC
      SECURITY DEFINER warnings (S5 scope), not introduced by S4.

### What was NOT touched in S4

- `auth`, RLS, `user_roles`, `has_role`, `has_company_role`,
  `canAccessAdminForCompany`, `useEffectiveEmployee`.
- Payroll: `pay_periods`, `period_base_pay`, `payroll_adjustments`,
  `reconciliation_*`, `historical_payroll_entries`, Connecteam pipeline.
- Operations: `time_entries`, `clock_events`, `scheduled_shifts`,
  `shift_assignments`.
- Edge functions: `kiosk-clock`, `employee-auth`, `front-desk-checkin`,
  `setup-company`, `bulk-portal-invite`, `send-employee-credentials`,
  `seed-test-users`, `approve-application`, `resolve-applicant-identity`.
- Tenant governance, `companies.status`/`is_active` triggers.
- Worker documents, real tenants, production data.
- `access_pin` column on any row (never updated by S4 backfill or
  migration — only new RPC dual-writes touch it, and only when an admin
  was already going to overwrite it anyway).
- `authPassword(access_pin)` Supabase auth password derivation — still
  in place; will be replaced before S4-D plaintext-kill.

### Risks discovered in S4

1. **`employee-auth` activation still writes plaintext-only.** Workers
   activating between S4 and S4-B end up with `access_pin_hash IS NULL`.
   No runtime impact (readers still use plaintext). S4-B must include
   that edge function in dual-write OR rely on the global backfill.
2. **Other demo tenants (`Sandbox`, `QA Testing`) not backfilled.** Out
   of scope this sprint; can be picked up in S4-B with an explicit
   approval, or left as-is and backfilled on first admin reset.
3. **`ProfileSummaryGrid.tsx:220` `!!employee.access_pin_hash`** now
   returns a real value instead of `undefined`. If any upstream query
   selects `access_pin_hash`, the boolean is now meaningful. Spot-check
   showed no `select('*')` on `employees` in `src/`, so no behavior
   change on real tenants (where `access_pin_hash` is still null
   everywhere). Worth re-reading in S4-B if the readiness card starts
   showing different signals on Stafly Demo.
4. **Linter still flags PUBLIC EXECUTE on the 2 modified RPCs** — same
   grant they had before the migration. S5 scope.

### Rollback (S4)

Reversible in a single migration:

```sql
ALTER TABLE public.employees
  DROP COLUMN IF EXISTS access_pin_hash,
  DROP COLUMN IF EXISTS pin_hash_version,
  DROP COLUMN IF EXISTS pin_set_at,
  DROP COLUMN IF EXISTS pin_migrated_at;
-- restore prior bodies of set_employee_access_pin / reset_employee_access_pin
-- (still in migration history, copy-paste back).
```

Dropping the columns is safe because no reader uses them. The dual-write
in the RPCs becomes a no-op once the columns are gone (the RPC body
references them; rollback must also restore the prior RPC bodies in the
same migration to avoid `column does not exist` on next call).

### Recommendation for S5

Two independent tracks unblocked by S4:

- **S5 (next)** — **SECURITY DEFINER PUBLIC-grant cleanup**, privilege-only,
  per §3.3 of this plan. Bodies not modified. Do not include
  `set_employee_access_pin`, `reset_employee_access_pin`,
  `employee_has_access_pin` in S5 — they were just touched in S4 and
  shipping them again in S5 would cause review collisions.
- **S4-B (parallel-ok)** — extend dual-write to `employee-auth` activation
  path so newly-activated workers get a hash too, then backfill the
  remaining 2 demo tenants (`Sandbox`, `QA Testing`) under explicit
  approval. Still no reader flip.

**S4-C (reader flip) and S4-D (plaintext kill) remain blocked** on:

- replacing `authPassword(access_pin)` Supabase auth password derivation,
- per-tenant feature flag `security.pin_hash_enabled`,
- full payroll-cycle observation window per §2.5.

---

## Sprint S4-B — Employee Auth Dual-Write + Demo/Sandbox Backfill (executed)

Additive only. **No reader flip. No plaintext removal. No auth/login behavior change. No payroll touched.**

### 1. `employee-auth` audit

Plaintext `employees.access_pin` was written from 3 sites in `supabase/functions/employee-auth/index.ts`:

| Action            | Line (pre-S4-B) | Caller                              | Notes                                  |
| ----------------- | --------------- | ----------------------------------- | -------------------------------------- |
| `activate`        | 346/354         | Worker first activation (admin svc) | Creates auth user + sets initial PIN   |
| `provision-pin`   | 765             | Admin/owner button                  | Generates fresh 4-digit PIN            |
| `change-pin`      | 882             | Worker self-service (authenticated) | Verifies current PIN, sets new         |

`authPassword(access_pin)` Supabase password derivation is **unchanged**. Return shapes, status codes, logs, and validation flow are **unchanged**. `sync-pins` only reads — not modified.

### 2. Dual-write implementation

New SECURITY DEFINER helper `public.internal_dual_write_pin_hash(_employee_id uuid, _pin text)`:

- Mirrors plaintext into `access_pin_hash` (bcrypt cost 10) + `pin_hash_version='bcrypt'` + `pin_set_at` + `pin_migrated_at`.
- **Never touches `access_pin`.**
- `EXECUTE` revoked from `PUBLIC`, `anon`, `authenticated`. Granted only to `service_role`.
- No `auth.uid()` requirement (service-role-only by grant), no PIN/hash logged.

Each of the 3 write sites in `employee-auth/index.ts` now calls the helper in a `try/catch` immediately after the plaintext update. Failure of the hash write **never** blocks activation/reset/change.

### 3. Backfill counts

Approved sandbox/demo tenants only:

| Tenant                      | company_id                              | with_pin | hashed (after S4-B) | crypt verify_ok |
| --------------------------- | --------------------------------------- | -------- | ------------------- | --------------- |
| Stafly Demo Company (S4)    | d3500000-0000-4000-8000-000000000001    | 7        | 7                   | 7/7             |
| Sandbox                     | 876d404e-535e-4518-9541-80bc02298f90    | 5        | 5                   | 5/5             |
| QA Testing                  | 7c1458db-109a-4042-a2b0-78e04427ec2d    | 2        | 2                   | 2/2             |

Real tenants with `access_pin_hash IS NOT NULL`: **0** (Quality Staff, MyStaff, JKitchen, Eminence, Milenium, Zemer, Hamaspik, etc. all untouched).

### 4. What was NOT touched

`authPassword`, `kiosk-clock`, `front-desk-checkin`, login validation, RLS, payroll, `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline, tenant governance triggers, `setup-company`, real-tenant rows, NOT NULL constraints, SECURITY DEFINER grant cleanup.

### 5. Remaining blockers for S4-C (reader flip)

1. Refactor `authPassword(access_pin)` to a hash-derived secret (or rotate to a stored opaque token) so `access_pin` is no longer the source of the Supabase password.
2. Per-tenant feature flag `security.pin_hash_enabled` to flip readers in `kiosk-clock`, `employee-auth` (login), and `front-desk-checkin`.
3. Full payroll cycle observation window on Stafly Demo + Sandbox with hash-read enabled.
4. Then S4-D: backfill remaining tenants (gradual) → S4-E: drop plaintext.

**Recommendation:** Proceed to **Sprint S5 (SECURITY DEFINER PUBLIC grant cleanup — P2 bucket)** while S4-C design is socialized; S4-C itself stays gated on the `authPassword` refactor.

---

## Sprint S5 — SECURITY DEFINER PUBLIC Grant Cleanup (executed)

Privileges only. **No function bodies changed. No RLS, auth, payroll, PIN, or edge-function logic touched. No data writes.**

### Inventory

| Metric                                                | Before S5 | After S5 |
| ----------------------------------------------------- | --------- | -------- |
| Total SECURITY DEFINER functions (public schema)      | 124       | 124      |
| Callable (non-trigger) SECURITY DEFINER               | 83        | 83       |
| Callable SECURITY DEFINER with PUBLIC execute         | 67        | 33       |
| Lovable security-linter total findings                | 154       | 120      |

The 33 callable functions still granting PUBLIC execute are the **explicitly excluded** P0 RLS helpers + P3 anon-public flows + PIN helpers (see below).

### Bucket P2 — service_role only (7 functions)

Revoke: PUBLIC, anon, authenticated. Grant: service_role.

`_get_cron_secret()`, `cleanup_expired_rate_limits()`, `expire_old_invitations()`, `enqueue_email(text,jsonb)`, `delete_email(text,bigint)`, `read_email_batch(text,int,int)`, `move_to_dlq(text,text,bigint,jsonb)`.

Caller audit: only cron jobs (`auto-close-periods`, `invite-reminders`, `employee-auth` adminClient) and pgmq workers (`send-invite-email`, `bulk-portal-invite`) — all use the service-role admin client.

### Bucket P1 — authenticated + service_role (28 functions)

Revoke: PUBLIC, anon. Grant: authenticated, service_role.

- Shift state: `assign_worker_to_shift`, `publish_shift_draft`, `set_shift_assignment_state`, `worker_respond_to_shift_assignment`, `resolve_shift_request`
- Time corrections: `request_time_entry_correction`, `list_shift_corrections`, `review_time_entry_correction`
- Notifications + audit: `create_shift_worker_notification`, `log_activity`, `log_activity_detailed`, `log_sensitive_access`
- Documents: `intake_confirm_and_index`
- Fiscal: `admin_get_employees_with_fiscal`
- Worker prefs: `archive_worker_client_preference`, `set_worker_client_preference`
- Employee admin: `merge_employees`, `supersede_employee_invitations`, `apply_role_template`, `list_unassigned_profiles`, `get_eligible_users_for_company`, `find_employee_duplicate_groups`
- Payroll / passport / review recompute: `consolidate_period_base_pay`, `consolidate_passport`, `consolidate_all_passports`, `recalculate_rep_score`, `recalculate_review_score`, `generate_shift_review_requests`, `pick_workers_to_rate`

Caller audit (`rg`): every callsite is either an authenticated browser session (worker portal / admin app via the shared client) or a service-role admin edge function. No anon callers found.

### Excluded (intentionally left with PUBLIC execute)

**P0 — RLS gateways (33 functions; do-not-touch):** `has_role`, `has_company_role`, `has_exact_company_role`, `has_module_permission`, `has_action_permission`, `has_active_assignment_override`, `is_global_owner`, `is_company_owner`, `is_founder`, `is_conversation_member`, `user_company_ids`, `user_is_company_admin`, `user_is_assigned_to_shift`, `user_can_access_worker_docs`, `worker_can_access_employee_doc_path`, `worker_owns_employee_document_scope`, `company_user_can_access_employee_doc_path`, `anon_can_upload_onboarding_doc`, `can_manage_shift_company`, `compute_employee_profile_status`, `compute_profile_stage`, `get_profile_status`, `get_employee_shift_readiness`, `get_required_documents_for_company`, `employee_has_locked_payroll`, `shift_closeout_can_admin`, `shift_closeout_can_final_approve`, `try_path_uuid` — referenced by RLS policies; revoking PUBLIC could break anon-pathway RLS evaluation.

**P3 — anon-intentional public flows:** `get_public_company_by_slug`, `find_public_company_fuzzy`, `application_exists`, `get_public_passport`, `get_company_by_invite_code`, `get_invitation_by_token`, `update_invitation_status_by_token`, `get_or_create_unsubscribe_token`, `register_onboarding_document`, `get_employee_for_activation` — `/apply/:slug`, `/s/:token` invite/activation, `/passport/:slug`, email unsubscribe.

**PIN helpers (S4/S4-B stability lock):** `employee_has_access_pin`, `set_employee_access_pin`, `reset_employee_access_pin`, `internal_dual_write_pin_hash`, `has_switch_pin`, `set_switch_pin`, `verify_switch_pin` — frozen until S4-C reader-flip design.

### QA results

| Check                                            | Result |
| ------------------------------------------------ | ------ |
| `vitest` full suite (17 files / 201 tests)       | ✅ PASS |
| Linter delta                                     | -34 findings (154 → 120) |
| Remaining PUBLIC-execute callable SECURITY DEFINER | 33 (all in P0/P3/PIN excluded lists) |
| No function bodies modified                       | ✅ (`pg_get_functiondef` unchanged) |
| No RLS policies changed                           | ✅ |
| No table data writes                              | ✅ |
| Edge-function caller audit (`rg .rpc\(`)         | ✅ all callers either authenticated session or service-role admin client |

### Rollback SQL

If any production caller breaks, restore the legacy PUBLIC grant on the offending function only (do NOT mass-restore):

```sql
-- Example for one P1 function
GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO anon;
```

Or full-bucket rollback:

```sql
DO $$ DECLARE sig text; funcs text[] := ARRAY[ /* paste bucket list */ ]; BEGIN
  FOREACH sig IN ARRAY funcs LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', sig);
  END LOOP; END $$;
```

### Risks

- **Low**: All revokes target functions whose static callsites are authenticated/admin only. Any forgotten unauth path would surface as `42501 permission denied for function` — recoverable per-function via rollback above without data impact.
- **Zero impact** on payroll, time_entries, scheduled_shifts, pay_periods, period_base_pay, reconciliation_*, historical_payroll_entries, clock_events, shift_assignments, RLS, auth, PIN logic, kiosk-clock, front-desk-checkin, employee-auth behavior, Connecteam pipeline, tenant governance, setup-company, companies.status triggers, worker documents.

### Recommendation: Sprint S6

1. **PIN hashing S4-C design** — refactor `authPassword(access_pin)` so reader flip becomes safe; introduce per-tenant feature flag `security.pin_hash_enabled`.
2. **Storage bucket cleanup** — 4 "Public Bucket Allows Listing" linter warnings still open; audit each bucket's intended audience.
3. **`SECURITY DEFINER` body audit** — second pass to confirm every function's internal queries respect tenant scoping (independent of the grant cleanup we just did).
