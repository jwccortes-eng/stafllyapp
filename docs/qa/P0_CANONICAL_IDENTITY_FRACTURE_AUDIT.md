# P0 — CANONICAL IDENTITY FRACTURE AUDIT

Daniel Ochoa + payroll duplicates (Angel Colon · Edinson Leon · Francisco Patino) + Sofia/Sophia Contreras clock alert.

**READ-ONLY. ZERO PRODUCTION WRITES. NO MERGES. NO INVITATIONS. NO PAYROLL CHANGES.**

Tenants in scope:
- `00000000-0000-0000-0000-000000000001` — Quality Staff by Keury
- `0b58f1d4-eefa-425e-a05a-cfe8d6484503` — Parceros
- `37f92f75-7af4-4496-aa10-793e14b09ed9` — My Staff Solution LLC (reference only)

---

## IDENTITY FRACTURE SUMMARY

**Daniel Ochoa**
- representations: **3**
- canonical candidate: `751d864f-8071-4ff2-a473-4deda803b48b` (Quality Staff)
- phone conflict: **YES**
- root cause: the person exists once per tenant plus one merged shadow. Only the Quality Staff record carries the phone (`6317037813`). The Parceros record `c2897e98…` and the merged shadow `629d0b49…` have `phone_number = NULL`. Every surface resolves contact from `employees.phone_number` of whichever `employees.id` it happens to hold — there is no person-level contact record — so a surface pointed at the Parceros/shadow row legitimately reports "sin teléfono" while search over the Quality Staff roster shows the correct number.

**Angel Colon**
- representations: **6** (5 in Quality Staff, 1 in Parceros)
- classification: **TRUE DUPLICATE (strong evidence)** between `50f5c5ac…` and `24c83018…` — identical verified email and identical normalized phone `3473132118`. The three empty rows `8cc898ae…`, `52f25b1e…`, `4eff2314…` are **REVIEW** (name-only evidence, zero data). The Parceros row is a distinct tenant identity, not a merge candidate.
- period impact: **138 = −$540.00**, **148 = −$525.00** (double-counted extras)

**Edinson Leon**
- representations: **2** (both Quality Staff)
- classification: **POSSIBLE DUPLICATE — REQUIRES HUMAN REVIEW** (name only; `d04a3506…` has no phone/email, `ef4e5966…` has phone `3478325243` + email; no shared strong evidence)
- period impact: **148 = −$400.00**

**Francisco Patino**
- representations: **2 active in Quality Staff** (+1 Parceros, out of scope)
- classification: **POSSIBLE DUPLICATE — REQUIRES HUMAN REVIEW** (`82e58682…` verified with phone/portal; `1f61628f…` has no contact data at all). Consistent with the earlier case file `P0_IDENTITY_CASEFILE_FRANCISCO_PATINO.md`.
- period impact: **148 = −$400.00**

**Sofia Contreras** (canonical spelling in data: *Sophia* Contreras)
- alert resolves to correct identity: **YES** — `b21476e3-8048-416b-b552-bdfdc0308a07`, Quality Staff, real open entry `c4901ac5-6cc5-48b6-b0e0-f7978d9ba7fd` (clock-in 2026-08-20 23:52, no clock-out, shift `f6fe4fb6…`)
- correction path actionable: **NO** — the destination offers contact and review links, not a clock-out correction.

---

## 1. EXECUTIVE SUMMARY

Stafly has **no person entity**. `employees.id` is simultaneously the worker record, the contact record, the payroll subject and the portal link. Every module resolves "who this is" by holding one `employees.id`; when two rows exist for the same human, each module silently picks a different one. There is no `merged_into_employee_id` link between any of the pairs found in this audit, so the existing identity-set resolver (`src/lib/identity/identity-set.ts`) cannot widen reads across them — by design it only expands over confirmed merges.

Two consequences, both observed in production:

1. **Contact fracture (Daniel Ochoa).** Contact lives on the worker row, not on the person, and is duplicated per tenant. One tenant's row has the phone, the other does not.
2. **Money fracture (periods 138 and 148).** Two different import paths resolved the same human to two different `employees.id` values and both wrote the same extras. The duplicated amounts reconcile the reported gaps **exactly**: 138 → $540.00; 148 → $525.00 + $400.00 + $400.00 = **$1,325.00**.

Nothing was merged, corrected or written.

---

## 2. DANIEL OCHOA IDENTITY GRAPH

| employees.id | tenant | name | phone | email | user_id | active | identity_status | created |
|---|---|---|---|---|---|---|---|---|
| `751d864f-8071-4ff2-a473-4deda803b48b` | Quality Staff | Daniel Ochoa | `6317037813` (10 digits) | 7daniel179@gmail.com | `de4b4faa…` | yes | verified | 2026-02-25 |
| `c2897e98-f14f-4e9f-a148-b81ed5e88155` | Parceros | Daniel Ochoa | — | 7daniel179@gmail.com | — | yes | verified | 2026-03-01 |
| `629d0b49-a823-4919-b908-51084cdbe8fd` | Quality Staff | Daniel Ochoa | — | — | — | no | **merged → `751d864f…`** | 2026-04-23 |

Attached data:

| record | assignments | time entries | movements | base-pay rows | documents | invitations |
|---|---|---|---|---|---|---|
| `751d864f…` | 0 | 0 | 2 | 13 | 0 | 2 |
| `c2897e98…` | 0 | 0 | 0 | 0 | 0 | 0 |
| `629d0b49…` | 0 | 0 | 0 | 0 | 0 | 0 |

Surface → record mapping:

- **A. Operational/review flow** — carries the `employees.id` of whatever row the operational query returned; when that is the Parceros row or the shadow, `phone_number` is NULL.
- **B. Search** — `src/lib/shifts/shift-people-search.ts:38-70` indexes the already-loaded roster of the *active tenant*, so in Quality Staff it always finds `751d864f…` with the phone.
- **C. Worker profile** `/app/employees/:id` — `src/pages/admin/UnifiedPersonProfile.tsx:191-196`, `select(EMPLOYEE_COLUMNS_NO_FISCAL).eq("id", id)`; shows whatever row the URL names.
- **D. Payroll** — uses `movements.employee_id` / `period_base_pay.employee_id`; for Daniel all 13 base-pay rows and 2 movements sit on `751d864f…`, so payroll is consistent for him.

No cross-tenant link exists or should exist between `751d864f…` and `c2897e98…`.

---

## 3. DANIEL PHONE CONFLICT — ROOT CAUSE

`src/lib/worker-next-action.ts:106-117` raises the next action **`missing_phone` → "Editar contacto"** whenever `normalizePhone(worker.phone_number).length !== 10`. It evaluates the single employee row handed to it. Therefore:

- `751d864f…` → 10 digits → no "Editar contacto".
- `c2897e98…` and `629d0b49…` → 0 digits → "Editar contacto", "sin teléfono".

The conflict is not a join bug inside one screen; it is **contact duplicated per worker row with no person-level contact of record**. Fixing it requires a canonical contact, not a query change.

---

## 4. DANIEL ACTIVATION ERROR TRACE

Path: `NextActionCard` → `UnifiedPersonProfile.tsx:1046-1082`.

- `edit_contact` calls `openDeepTab("info", { edit: true })` (`UnifiedPersonProfile.tsx:148-157`) — **pure local UI state, no API call**. It opens the edit form of *the row in the URL*.
- `open_invite` opens `EmployeeInviteDialog`, which:
  - blocks when `employee.company_id !== selectedCompanyId` → "Este empleado no pertenece a la empresa seleccionada";
  - blocks when `employee.is_active === false`;
  - gates WhatsApp/SMS channels on `hasPhone` (`EmployeeInviteDialog.tsx:88-89`);
  - reads existing invites from `employee_invitations` by `employee_id`;
  - would insert into `employee_invitations` and call RPC `supersede_employee_invitations`.

So the inconsistent behaviour is explained without any code defect: from the shadow row the action is blocked by `is_active = false`; from the Parceros row it is blocked by the tenant guard and by the missing phone; only from `751d864f…` is it viable. **No invitation was created and nothing was activated during this audit.**

---

## 5. ANGEL COLON IDENTITY GRAPH

| employees.id | tenant | phone | email | user_id | active | EID | assignments | entries | movements | base rows |
|---|---|---|---|---|---|---|---|---|---|---|
| `50f5c5ac-598c-42ca-865a-13e033d6ba9d` | Quality Staff | `3473132118` | Angelleonidascolonbermudez@gmail.com | `1b309cd7…` | yes | 954 | 39 | 51 | 18 | 34 |
| `24c83018-b386-4110-90f1-74b5762d5f47` | Quality Staff | `+1 347 313 2118` | same email | — | no | 1205 | 0 | 0 | **5** | 0 |
| `8cc898ae-ceef-4c07-a379-fc4fdee1092a` | Quality Staff | — | — | — | no | 1242 | 0 | 0 | 0 | 0 |
| `52f25b1e-a7e7-4b87-bb08-b9c90e8bd84f` | Quality Staff | — | — | — | no | 1252 | 0 | 0 | 0 | 0 |
| `4eff2314-f1ee-40db-bd42-b9644e9ab6ca` | Quality Staff | — | — | — | no | 1256 | 0 | 0 | 0 | 0 |
| `01ca0ff7-c008-4a6c-ba78-6c0ecd3dc235` | Parceros | — | same email | — | yes | — | 0 | 0 | 0 | 0 |

Evidence strength `50f5c5ac…` ↔ `24c83018…`: **STRONG** (same email + same normalized phone `3473132118`). The three empty rows carry **WEAK** evidence only (name + sequential EIDs 1242/1252/1256 created minutes apart, consistent with repeated import attempts) — they must not be merged on that basis.

---

## 6. EDINSON LEON IDENTITY GRAPH

| employees.id | tenant | phone | email | active | EID | assignments | entries | movements | base rows |
|---|---|---|---|---|---|---|---|---|---|
| `d04a3506-3c92-4104-94e7-54ac8b7dff86` | Quality Staff | — | — | yes | 1104 | 11 | 3 | 4 | 8 |
| `ef4e5966-122c-4aed-a53a-281480b67e29` | Quality Staff | `3478325243` | edinsonreal23@gmail.com | yes | 1259 | 2 | 0 | 1 | 0 |

Classification: **POSSIBLE_DUPLICATE_REQUIRES_HUMAN_REVIEW.** No shared strong evidence — the older row has no contact data at all, so email/phone cannot corroborate. Both are active and both hold live assignments, which is itself an operational risk (the same human may be assignable twice).

---

## 7. FRANCISCO PATINO IDENTITY GRAPH

| employees.id | tenant | phone | email | user_id | active | EID | assignments | entries | movements | base rows |
|---|---|---|---|---|---|---|---|---|---|---|
| `82e58682-423b-40eb-b26d-c072a735212a` | Quality Staff | `9299915590` | Sebaspatino11@gmail.com | `38bd8811…` | yes | 1305 | 43 | 17 | 6 | 8 |
| `1f61628f-6d36-4d5c-8649-c776004a90b6` | Quality Staff | — | — | — | yes | 1063 | 5 | 0 | 9 | 16 |
| `f779aa90-8cdd-4292-8662-37cfd1d185f9` | Parceros | — | Sebaspatino11@gmail.com | — | yes | — | 0 | 0 | 0 | 0 |

Classification: **POSSIBLE_DUPLICATE_REQUIRES_HUMAN_REVIEW** for the two Quality Staff rows (name only; no contact overlap). Matches the prior case file, which also flagged that `1f61628f…` holds **closed-period payroll references** and therefore must not be archived blindly.

---

## 8. PAYROLL IMPACT — PERIOD 138

Period `617dfddf-adb5-408a-8ba7-ec0dcd77c587`, 2026-06-24 → 2026-06-30, status `open`.

| worker row | concept | amount | note / origin | created |
|---|---|---|---|---|
| `50f5c5ac…` (Angel Colon, canonical) | Weekend Job | $525.00 | `[Cierre externo aprobado]` | 2026-09-15 03:06 |
| `50f5c5ac…` | Horas de viaje | $15.00 | `[Cierre externo aprobado]` | 2026-09-15 03:06 |
| `24c83018…` (Angel Colon, duplicate) | Weekend Job | $525.00 | `[Import] VERIFIED` | 2026-09-15 03:06 |
| `24c83018…` | Horas de viaje | $15.00 | `[Import] VERIFIED` | 2026-09-15 03:06 |

Duplicated total: **$540.00 — exactly the reported period-138 difference.** Same concepts, same amounts, same minute, two different `employee_id` values, two different write paths. Base pay for the period sits only on the canonical row ($138.75).

---

## 9. PAYROLL IMPACT — PERIOD 148

Period `b17caedc-c2c7-4a53-85e9-e429162da34f`, 2026-09-02 → 2026-09-08, status `open`.

| person | canonical row (`[Cierre externo aprobado]`) | duplicate row (`[Import] VERIFIED`) | concept | duplicated amount |
|---|---|---|---|---|
| Angel Colon | `50f5c5ac…` $525.00 | `24c83018…` $525.00 | Weekend Job | $525.00 |
| Edinson Leon | `d04a3506…` $400.00 | `ef4e5966…` $400.00 | Weekend Job | $400.00 |
| Francisco Patino | `1f61628f…` $400.00 | `82e58682…` $400.00 | Weekend Job | $400.00 |

**Total duplicated: $1,325.00 — exactly the reported period-148 difference.**

Note the inversion in the Patino pair: the external-close write landed on `1f61628f…` while the import write landed on `82e58682…` (the row with the portal and the work history). The two ingestion paths do not agree on which row is canonical — this is the defect, not the amounts.

No movement, base-pay row, rate, time entry or statement was modified.

---

## 10. SOFIA CONTRERAS ALERT TRACE

- Canonical identity: **`b21476e3-8048-416b-b552-bdfdc0308a07`** — Sophia Contreras, Quality Staff, phone `9294168269`, portal user `27a62131…`. Two merged shadows exist and are correctly linked (`ef96e166…`, `f5a6230d…`); one separate Parceros row `511ba843…`. Identity resolution is **correct**.
- Underlying event: `time_entries.id = c4901ac5-6cc5-48b6-b0e0-f7978d9ba7fd`, clock-in 2026-08-20 23:52, `clock_out = NULL`, status `pending`, shift `f6fe4fb6-2413-4992-9b3c-67672691d348`.
- Alert source: **not** `clock_alerts` — that table holds only `GPS_UNAVAILABLE` rows and none for Sophia. The "open clock" signal is computed client-side in `TimeClockCommandView.tsx:231-264` (`type: "stale_open"`), from live `time_entries`.
- Routing: `src/lib/shifts/closeout-gate.ts:69,78-86` sends the open-entries blocker to `/app/timeclock?shiftId=…` → `src/App.tsx:375` → `TimeClockCommandView`.
- Available actions at destination (`TimeClockCommandView.tsx:1029-1096`): call, WhatsApp, "Revisar en el reloj", "Ver perfil del worker". The recommended-action copy explicitly defers the fix ("Contacta a la persona… luego revisa el fichaje en el reloj").
- **Missing linkage:** no control anywhere on this path sets a clock-out or creates a corrected entry for `c4901ac5…`. The alert is a contact prompt, not a correction surface.

Company-wide there are **4 open entries older than 24 h across 4 workers**, so this is a class, not a one-off.

---

## 11. HOME → RESOLUTION ROUTING TRACE

```
OpsHome  "Requiere revisión" / "Revisar horas"   src/pages/admin/OpsHome.tsx:497
   → /app/payroll-review-queue                   (hours to review)
closeout-gate "Revisar horas"                    src/lib/shifts/closeout-gate.ts:99
   → /app/payroll-review-queue?shiftId=…
closeout-gate "N fichajes siguen abiertos"       src/lib/shifts/closeout-gate.ts:78-86
   → /app/timeclock?shiftId=…                    src/App.tsx:375
       → TimeClockCommandView · Alertas · stale_open   (derived, not clock_alerts)
           → sheet: llamar · WhatsApp · Revisar en el reloj · Ver perfil
               → /app/employees/:id               src/pages/admin/UnifiedPersonProfile.tsx:191
```

Two break points:
1. The chain ends in contact actions, never in a time correction (section 10).
2. The last hop carries an `employees.id`. If that id is a non-canonical row, the profile shows a contact-less person and offers "Editar contacto" on the wrong record (sections 3–4).

---

## 12. SYSTEMIC DUPLICATE COUNTS

Counts only. Nothing merged, nothing flagged in the database.

| signal | count |
|---|---|
| canonical (non-shadow) employee rows | 1,785 |
| merged shadow rows (correctly linked) | 89 |
| same-tenant groups sharing an identical normalized name | 8 |
| same-tenant groups sharing an identical normalized phone (strong) | 2 |
| same-tenant groups sharing an identical email (strong) | 7 |
| canonical rows with neither phone nor email (orphan contact) | 38 |
| active canonical rows whose phone is not 10 digits (would raise "Editar contacto") | 211 |
| emails present in more than one tenant (expected multi-company, never merge) | 210 |

The 211 figure is the systemic form of the Daniel symptom: one in eight active workers would show "sin teléfono / Editar contacto" on some surface.

---

## 13. TENANT SAFETY

- Every duplicate pair with monetary impact is **inside Quality Staff**. No cross-tenant money movement exists or was proposed.
- 210 people legitimately exist in more than one tenant (Quality Staff ↔ Parceros ↔ My Staff Solution). These are **not** duplicates and must never be auto-linked; the multi-company access model already treats identity and membership as separate dimensions.
- Any future canonical-person layer must key membership per tenant and forbid a merge whose members span `company_id` values.

---

## 14. RECOMMENDED CANONICAL IDENTITY MODEL

Not implemented. Proposed direction only.

1. **Person above worker.** Introduce a person-level identity that owns contact (phone, email, verification) once; `employees` rows become tenant memberships pointing at it. Contact reads resolve person → contact, never row → column.
2. **One writable row per person per tenant.** All ingestion (external close, extras import, manual creation) must resolve through a single resolver and write only to the canonical row; duplicated concept+amount+period on two rows of the same person should be rejected at write time.
3. **Strong-evidence-only linking.** Verified normalized phone, verified email, shared auth user, or explicit human confirmation. Name similarity may only *propose*, never link.
4. **Reuse what exists.** `merged_into_employee_id` + `src/lib/identity/identity-set.ts` already give read-side widening and write-side canonicalization; the gap is that the pairs in this audit were never linked, and that ingestion does not call the resolver.
5. **Close the correction loop.** The stale-open alert needs an actual correction action bound to the specific `time_entries.id`, with audit, so the operator path ends in a fix rather than a phone call.

Human decisions required before any reconciliation:
- Confirm Angel Colon `50f5c5ac…` ↔ `24c83018…` is one person (strong evidence already present) and that the three empty rows are import debris.
- Provide evidence for Edinson Leon and Francisco Patino pairs — contact data is absent, so only a human can confirm.
- Decide, per period 138/148, which of the two writes is authoritative before any duplicate movement is touched.

---

## 15. ZERO-WRITE CONFIRMATION

- Only `SELECT` statements and schema introspection were executed.
- No merges, deletes, updates, inserts, migrations, imports, invitations, notifications, publications or RPC mutations.
- `auth`, RLS, payments, bookings, chat, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, documents, workers, profiles, tenants, published statements, `movements`, `period_base_pay` and identity verification are untouched.
- No application code was modified; this audit adds this document only.

---

## FINAL VERDICT

🟡 **IDENTITY FRACTURES CONFIRMED — HUMAN IDENTITY EVIDENCE REQUIRED**
