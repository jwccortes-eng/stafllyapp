# Revoke Parceros QA Tester Owner Access — CLOSED PASS

**Ticket status:** CLOSED ✅  
**Closed at:** 2026-06-26  
**Scope:** Parceros company only (`0b58f1d4-eefa-425e-a05a-cfe8d6484503`)  
**Target:** QA/test artifact user `2bf0401f-7c8a-4017-b3bd-033935e34860`  
**Rule:** Zero writes to protected tables, `auth.users`, payroll, shifts, time_entries, documents, chat, RLS, or tenant isolation logic.

---

## QA Gate Results

| Gate | Description | Result |
|------|-------------|--------|
| 1 | Confirm Parceros `company_users` before change | ✅ PASS |
| 2 | Confirm target user currently had `company_owner` | ✅ PASS |
| 3 | Revoke/deactivate only target user's Parceros access | ✅ PASS |
| 4 | Confirm Keury still has Parceros `manager` | ✅ PASS |
| 5 | Confirm no other Parceros roles changed | ✅ PASS |
| 6 | Confirm zero writes outside Parceros `company_users` / audit log | ✅ PASS |
| 7 | Add `activity_log` entry with ticket name | ✅ PASS |

---

## Before State

Parceros `company_users` rows:

| Row ID | User ID | Role |
|--------|---------|------|
| `e0b18974-21c7-44de-a701-d140ad44ec8a` | `2bf0401f-7c8a-4017-b3bd-033935e34860` | `company_owner` |
| `da8565dc-de55-4079-afbe-6f2554de684a` | `85000c53-c052-43da-a131-fe7871e43c62` | `manager` |

---

## Action Taken

- Deleted `company_users` row `e0b18974-21c7-44de-a701-d140ad44ec8a` for target user.
- Created `activity_log` entry `6bb5f23a-5b61-4999-b3e2-8f3b07d13e2f` with ticket `parceros-qa-owner-revocation-2026-06-26`.

---

## After State

Parceros `company_users` rows:

| Row ID | User ID | Role |
|--------|---------|------|
| `da8565dc-de55-4079-afbe-6f2554de684a` | `85000c53-c052-43da-a131-fe7871e43c62` | `manager` |

- Keury Camilo remains Parceros `manager` ✅
- No other Parceros roles changed ✅

---

## Tables Touched

- `public.company_users` — 1 row deleted.
- `public.activity_log` — 1 audit row inserted.

## Protected Tables Untouched

- `auth.users`
- RLS policies
- `payroll_*` tables
- `time_entries`
- `shift_assignments`
- `scheduled_shifts`
- `bookings` / `payments`
- `chat_messages` / `conversations`
- `documents` / `employee_documents`
- `employees` (outside the target relation)
- `companies`
- `tenants` / `company_settings` / `company_modules`
- `campaigns` / partner logic
- Edge functions

---

## Final Verdict

**PASS ✅** — Parceros QA tester `company_owner` access revoked safely. Keury Camilo remains manager. No protected tables or other users were modified.
