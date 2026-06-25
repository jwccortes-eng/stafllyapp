# MSS EIC — Attach Readiness Review (1 worker, read-only)

**Date (UTC):** 2026-06-25
**Mode:** Read-only review. **No attach. No new lookup. No DB writes.**
**Decision authority:** Owner. This document is evidence only.

---

## 1. Identity — Target (MSS)

| Field | Value |
|-------|-------|
| `target_employee_id` (partial) | `4df1c02f…3274e` |
| `target_company_id` | MSS / My Staff Solution LLC (`37f92f75…09ed9`) |
| `is_active` | true |
| `user_id` | **NULL** ✅ (no auth user attached) |
| `portal_access_enabled` | **false** ✅ |
| `has_phone` | true (last4 `5060`) |
| `has_email` | true |
| `masked_name` | `S••••V••••` |
| `employer_identification` | null |
| Placeholder/system/external | No (not in placeholder rules) |
| `payroll_safe` | n/a column not present on this row |

No raw PII captured. No SSN/EIN/DOB/address read.

## 2. Source identity (from MSS Pilot Dry-Run 2026-06-24)

| Field | Value |
|-------|-------|
| Source tenant | **Quality Staff** ✅ (expected) |
| `match_strength` | **HIGH** ✅ |
| `reasons` | `phone`, `email` ✅ (both channels) |
| Source has `user_id` | yes (auth user resolvable) |
| Source classification | real worker (not placeholder/system/external) |
| `source_company_name` exposure | masked / allowlisted-only via `buildEicSafeResponse` going forward |
| Source `match_token` | issued, expired ≤10 min, scoped to owner, **not persisted** |

## 3. Identity risk matrix

| Risk | Verdict |
|------|---------|
| Shared phone/email risk | **No** — single QS match on phone **and** email |
| Homonym risk | **No** — HIGH match driven by contact channels, not name |
| Duplicate unresolved | **No** — single source candidate |
| Source tenant ≠ QS | **No** — source = QS, as expected |
| Corporate/shared contact | **No indication** (personal-shape phone + email) |
| Strong name mismatch | **No** — initials consistent across tenants |

## 4. Operational risk matrix (MSS target)

| Signal | Count | Verdict |
|--------|------:|---------|
| Open `time_entries` (target) | 0 | ✅ clean |
| Total `time_entries` (target, lifetime) | 7 | visible, non-blocking |
| `shift_assignments` on `scheduled_shifts` in ±7d window | 1 | visible, **non-blocking** |
| `employee_documents` rows | 0 | nothing pending to break |
| Active `compensation_profiles` | 1 | visible, **non-blocking** (single active per business rule) |
| Open `pay_periods` for MSS | 0 | ✅ no open payroll batch on tenant |
| `period_base_pay` rows for target | 0 | ✅ no committed payroll exposure |
| `employee_archive_records` | 0 | ✅ not archived |
| Dispute / disciplinary flag | none observed | ✅ |

These signals are **visible-but-not-blocking** per the EIC contract. The attach changes only `auth.users` linkage and portal access; it does not touch payroll, shifts, documents, or compensation.

## 5. Consent / operational basis

- **Reasonable operational basis to connect MSS portal to this auth user?** Yes. Worker is active in MSS, has verified contact channels, and the QS auth identity is the same human per HIGH (phone + email) match.
- **Human reason NOT to connect?** None surfaced. No dispute, no archive, no shared-contact ambiguity, no homonym signal.
- **Does the attach help unify identity without creating a silo?** Yes. It collapses two tenant memberships under one `auth.users` row, which is exactly the EIC design goal (membership, not duplicated identity).

## 6. Token hardening status

- Sanitizer `supabase/functions/_shared/eic-redact.ts` — implemented ✅
- Negative tests `supabase/functions/_shared/eic-redact.test.ts` — **9/9 PASS** ✅
- `buildEicSafeResponse` allowlist-first; future RPC columns do **not** leak ✅
- No `console.log` of raw RPC payloads; only `stage / row_count / error.code` ✅
- No `match_token` persisted to DB, docs, or `/tmp` ✅
- Mandatory precondition recorded in `docs/MSS_PILOT_DRYRUN_PLAN.md` § 9.1 for any future EIC execution ✅

## 7. Recommendation

**`approve-for-attach`** (subject to separate explicit owner authorization phrase).

### Reasoning
- Target identity is clean (NULL `user_id`, portal off, active, no archive).
- Source identity is QS HIGH on two channels (phone + email), no duplicates, no homonyms.
- Zero open payroll exposure on MSS; lifetime payroll exposure (`period_base_pay`) is zero, so attach cannot disturb closed payroll math.
- Operational signals (1 shift in ±7d window, 1 active compensation profile, 7 lifetime time entries) are non-blocking per EIC scope — attach changes only `auth.users` linkage.
- Token hardening is verifiably in place; any actual attach call must use `buildEicSafeResponse` and respect § 9.1.

## 8. Contract confirmations

- **Zero DB writes** in this review. ✅
- **No attach executed.** ✅
- **No new EIC lookup executed.** All source-side facts re-used from the 2026-06-24 dry-run report. ✅
- **No edge function deployed.** ✅
- **No changes** to `employees.user_id`, `portal_access_enabled`, `auth.users`, payroll, shifts, documents, compensation, payments, bookings, chat. ✅
- **No frontend / migration / bulk** changes. ✅

## 9. Unblock criteria for attach execution

All must hold at execution time:
1. Owner issues explicit authorization phrase for **this specific** target employee ID.
2. Executing edge function imports and uses `buildEicSafeResponse`.
3. Pre-snapshot of `employees`, `auth.users`, `activity_log`, `eic_rate_limits` captured locally.
4. New `match_token` minted at execution (≤5 min expiry); never logged.
5. Post-snapshot delta: `employees` +0 rows (UPDATE only on `user_id`/`portal_access_enabled` for target), `auth.users` +0 rows, `activity_log` +1 `eic_attach`, all other protected tables +0.
6. Post-run human verification and report.

Until step 1 is given verbatim, **no attach.**
