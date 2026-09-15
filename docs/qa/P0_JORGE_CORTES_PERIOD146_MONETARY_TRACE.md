# P0 — JORGE CORTES · PERIOD 146 MONETARY COMPONENT TRACE

READ-ONLY · ZERO PRODUCTION WRITES · NO PAYROLL MUTATIONS

---

## JORGE CORTES — PERIOD 146

**Base: $649.00**
Source: `period_base_pay.base_total_pay` id `576e74da-3502-4764-ad53-69ed9b029dea` (stored, from external close file `146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx`, column "Total pay").

**Top Extras: $1,000.00**
Source: client-side sum of all `movements` rows with `concepts.category='extra'`, **ignoring approval status** — Weekend Job $900 (approved) + Pago de Transporte Regular $100 (pending).

**Top Deductions: −$530.00**
Source: sum of `movements` with `category='deduction'` → `total_value = −530.00` (value already negative in DB).

**Displayed Total Final: $2,179.00**
True formula (`src/pages/admin/EmployeePeriodDetail.tsx:252`):
`finalTotal = base + extrasTotal − deductionsTotal` = `649 + 1000 − (−530)` = **2179**.
The deduction is stored signed-negative and the UI subtracts it again → deductions are **added**, not subtracted.

**Receipt Base: $649.00** · **Receipt Extras: $900.00** · **Receipt Deductions: −$530.00**
Source: RPC `pay_statement_preview` — extras/deductions restricted to `approval_status='approved' AND visible_to_worker`, deductions taken as `ABS(total_value)`. Pending $100 transport correctly excluded.

**Displayed Total to Publish: $1,239.00**
True formula: NOT a sum. `frozen_total_preview = COALESCE(approved_total_override, computed_total)`.
`computed_total = 649 + 900 − 530 = 1019`; `approved_total_override = 1239` (stored, `approved_total_source = external_approved`) → the override wins.

**Unexplained +$1,060: EXPLAINED** — sign error, `2 × $530`.
**Unexplained +$220: EXPLAINED** — external-close file carried a transport (ryde) component of **$220** that was counted into the file TOTAL but whose movement was **skipped on insert** because a pre-existing auto-generated $100 transport movement already occupied the same `(employee, concept)` key.

**Root cause:** Two independent defects — the period-detail top card subtracts an already-negative deduction, and the external-close importer counts skipped duplicate-concept components into the frozen approved TOTAL without persisting them as visible movements.

---

## 1. CANONICAL IDENTITY

Three `employees` rows share the name and the auth account `e5495b59-8b80-471d-bd64-eec9ea7b1ccb`:

| employee_id | company | active | merged_into |
|---|---|---|---|
| `482e78ca-d42b-4e12-86f5-6963c3012e61` | Quality Staff by Keury (`00000000-…0001`) | yes | null |
| `340db246-c365-4e56-9e9a-ac7d4ef56bc4` | My Staff Solution LLC | yes | null |
| `cbd94ddb-037c-450e-9582-13d7b8718c6a` | Parceros (no user_id) | yes | null |

Period 146 belongs to Quality Staff → the only worker record used is `482e78ca-…`. Verified: `period_base_pay` rows for this employee+period = **1**; no movement or base row exists for the other two records in this period. **No aggregation across records. No merge performed.**

## 2. PERIOD 146 STATE

| field | value |
|---|---|
| period_id | `86b967e5-7602-4712-be3e-f5c0665c8be2` |
| sequence_number | 146 |
| dates | 2026-08-19 → 2026-08-25 |
| status | `open` (closed_at, published_at, paid_at all NULL) |
| company_id | `00000000-0000-0000-0000-000000000001` (Quality Staff) |
| calculation_mode | `historical_import` · source_type `organic` |
| pay_statements in period | **0** |

## 3. BASE PAY TRACE

`period_base_pay` `576e74da-…`: `base_total_pay = 649.00`, all hour fields `0.00`, `import_id = NULL`, `is_anomalous = false`, `approved_total_override = 1239`, `approved_total_source = external_approved`, `approved_total_note = "TOTAL aprobado externo, coincide con el desglose."`, created `2026-09-14 21:39:18Z`.

$649 is a **stored external value**, not derived from `time_entries` or rates — no hours are recorded for this worker in 146. Equation: `base = file["Total pay"] = 649.00`.

## 4. ALL MOVEMENTS (period 146, employee `482e78ca-…`) — 3 rows, no hidden records

| movement_id | concept | cat | qty | rate | total | status | note | created_at |
|---|---|---|---|---|---|---|---|---|
| `2e5ccea6-2449-429b-833c-fdc2d8662b54` | Pago de Transporte Regular | extra | 1 | 100.00 | **+100.00** | pending | Auto: … - Turno | 2026-08-21 03:18Z |
| `a9adf282-8222-4051-ba94-0906436a9e0a` | Weekend Job | extra | 1 | 900.00 | **+900.00** | approved | `[Cierre externo] NUEVO SALDO 990` | 2026-09-14 21:39Z |
| `96cc4473-6414-4148-942c-3e841547e240` | Descuentos | deduction | 1 | −530.00 | **−530.00** | approved | `[Cierre externo] NUEVO SALDO 990` | 2026-09-14 21:39Z |

All three have `visible_to_worker = true`, `pay_statement_id = NULL`.

Inclusion matrix:

| movement | Top Extras | Top Deduc. | Receipt Extras | Receipt Deduc. | Total final | Total a publicar |
|---|---|---|---|---|---|---|
| Transport +100 (pending) | ✅ | — | ❌ | — | ✅ | ❌ (override ignores all) |
| Weekend Job +900 | ✅ | — | ✅ | — | ✅ | ❌ (override ignores all) |
| Descuentos −530 | — | ✅ | — | ✅ | ✅ **added, not subtracted** | ❌ (override ignores all) |

## 5. TOTAL FINAL FORMULA

Code: `src/pages/admin/EmployeePeriodDetail.tsx:247-252`

```
extrasTotal     = Σ movements[category='extra'].total_value        = 1000.00   (no approval filter)
deductionsTotal = Σ movements[category='deduction'].total_value    = −530.00   (already negative)
finalTotal      = base + extrasTotal − deductionsTotal
                = 649 + 1000 − (−530) = 2179.00
```

Proof: `649 + 1000 + 530 = 2179`. Reproduced exactly from canonical records. Calculated client-side, nothing stored.

Secondary defect: line 293 renders `−${deductionsTotal.toFixed(2)}`, i.e. a second sign inversion at display time.

## 6. TOTAL TO PUBLISH FORMULA

Code: RPC `pay_statement_preview` (SECURITY DEFINER, STABLE) → card `PayStatementPublishCard.tsx:184`.

```
base              = 649.00                                (period_base_pay, stored)
extras            = 900.00   approved + visible only      (transport pending excluded)
deductions        = 530.00   ABS(total_value)
computed_total    = 649 + 900 − 530 = 1019.00             (eligible, calculated)
approved_override = 1239.00                               (stored, external_approved)
frozen_total_preview = COALESCE(override, computed) = 1239.00
```

The publish RPC freezes the same override. `has_override` is true, so the card also renders the "Total aprobado externo" block showing `Desglose $1,019.00` vs `Total aprobado $1,239.00`. Nothing is frozen yet for this period.

## 7. +$1,060 ROOT CAUSE

`deductionsTotal` is already negative (`−530.00`) and the summary subtracts it: `− (−530) = +530`. Relative to the correct `649 + 1000 − 530 = 1119`, the displayed value is off by `2 × 530 = 1060`. Pure presentation/aggregation defect in `EmployeePeriodDetail.tsx:252`. No duplicated base, no hidden movement, no stored total, no duplicate worker.

## 8. +$220 ROOT CAUSE

Import audit record `activity_log` `20ecc5c9-ead2-4307-9aee-f6b87dd5d25f` (2026-09-14 21:39:19Z), file `146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx`, sheet PAYROLL: `workers 26`, `grandApprovedTotal 15714.14`, `grandComponentSum 15714.14`, `approvedTotalOverrides 0`, `basePayRows 26`, `movementsInserted 20`.

At import time the file TOTAL matched the file's own component sum for every worker (0 overrides). For Jorge, `componentSum = 649 + 900 + 220 (ryde) − 530 = 1239` — equal to the file TOTAL, hence the note "coincide con el desglose".

The `$220` transport component was **counted in `componentSum` but never inserted as a movement**: `index.ts:359` marks a component `alreadyExists` when `(employee_id, concept_id)` already has a row, and `index.ts:~496` skips those inserts (`if (c.alreadyExists) continue;`). Jorge already had the auto-generated **pending $100** transport movement from 2026-08-21. Result: the DB keeps the older $100 row, loses the $220 external figure, and the frozen override retains it.

Arithmetic proof: `1239 (override) − 1019 (visible eligible breakdown) = 220` = the skipped ryde component.

Identical mechanism confirmed for **Carlos Alvarez** (`ea1f9ae0-…`): base 1164.50 + Weekend Job 600 + skipped ryde 560 = override 2324.50; his visible breakdown sums 1764.50; gap exactly $560, pre-existing pending transport $100.

## 9. UI LABEL SEMANTICS

| Label shown | True meaning |
|---|---|
| Pago base | Stored external-close base ("Total pay" column). Not hour-derived. |
| Extras (top) | All extra movements **regardless of approval** — mixes pending and approved. |
| Deducciones (top) | Signed-negative sum rendered with an extra minus sign. |
| **Total final** | Not a payroll total — an arithmetically wrong client-side aggregate (`base + extras + |deductions|`). It is neither the calculated total, the external close total, nor the payable amount. |
| Base / Extras / Descuentos (receipt) | Publishable-eligible components: approved + worker-visible only. |
| **Total a publicar** | The **frozen external approved TOTAL** (`approved_total_override`), authoritative over the breakdown. It is the payable amount, not a sum of the rows above it. |

The two cards answer different questions with visually identical vocabulary; only the receipt card is payroll-authoritative.

## 10. DUPLICATION CHECK

- Worker records: 3, but in **three distinct companies**; only one is in Quality Staff. Not a duplicate within the payroll tenant.
- `period_base_pay` rows in 146 for any Jorge record: **1**.
- Movements in 146: **3**, distinct concepts, no duplicates.
- External-close imports for period 146: **1** (`20ecc5c9-…`). No re-import.
- `historical_payroll_entries` for this worker/period: none.

No duplication. No repair performed.

## 11. PUBLICATION STATUS

Period 146 has **0** `pay_statements` rows — Jorge's 146 receipt is **unpublished** and remains unpublished. (His only published statements belong to other periods: `d7b13742-…` period 147 $2,272.00 and `f64a2e89-…` period `0219ab8d-…` $315.00 — untouched.)

Note: publication of 146 is currently blocked anyway by `publish_pay_statement`, which rejects workers with pending movements (the $100 transport).

## 12. PERIOD-146 SAME-PATTERN COUNTS

Read-only, counts only:

- `period_base_pay` rows in 146: **26**; all 26 carry an `approved_total_override`.
- Workers whose visible components ≠ **Total final** (i.e. have ≥1 deduction movement, triggering the sign defect): **2** — Jorge Cortes (−530), Andres Vargas (−268).
- Workers whose eligible breakdown ≠ **Total a publicar** (override gap): **2** — Jorge Cortes (+$220), Carlos Alvarez (+$560).
- Workers with the exact root-cause pattern (pre-existing pending auto movement at import time → skipped component): **2** — Jorge Cortes, Carlos Alvarez. These are the same two rows as the override gap; total unattributed money in period 146 = **$780.00** (matches the +$780 residual previously recorded for period 146 in the exception workqueue).

Jorge is **not isolated**, but the pattern is narrow and fully enumerated for this period. The Total-final sign defect is in shared UI code and therefore applies to every period/worker with deductions, not only 146.

## 13. ZERO-WRITE CONFIRMATION

Only `SELECT` statements and source reads were executed. No INSERT/UPDATE/DELETE, no migration, no RPC with side effects, no import, no publication, no notification, no merge. Formulas, `time_entries`, `period_base_pay`, `movements`, rates, approved adjustments, external-close records, published statements, scheduled_shifts, shift_assignments, identity records, contacts, auth, RLS, payments, bookings, chat, documents, tenants, billing and entitlements are unchanged.

## 14. RECOMMENDED FIX — DO NOT IMPLEMENT

1. **Total final (UI, safe):** compute `base + extrasApproved − ABS(deductions)` and render pending extras as a separate, clearly labelled line ("incluye $100 pendiente de aprobación"). Removes the +$1,060 artefact without touching stored data.
2. **Labels:** rename the top aggregate to "Total calculado (borrador)" and the receipt figure to "Total aprobado a publicar", surfacing the override delta where it exists.
3. **Importer (server):** when a component is skipped because the `(employee, concept)` key already exists, either (a) exclude it from `componentSum` so the row is flagged REVIEW instead of silently balancing, or (b) report it as a conflict requiring human resolution (external $220 vs existing pending $100). Never let a skipped component inflate a frozen approved total.
4. **Period 146 data:** the $780 across Jorge ($220) and Carlos ($560) requires a human decision on which transport figure is authoritative before any movement is created or the override is adjusted.

---

## FINAL VERDICT

🟢 JORGE TOTALS FULLY EXPLAINED — SAFE UX/CALCULATION FIX IDENTIFIED
