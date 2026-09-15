# P1 — HISTORICAL PAYROLL EXCEPTION WORKQUEUE

Company: Quality Staff · Scope: periods 128–148 (2026-04-15 → 2026-09-08)
Mode: READ-ONLY root cause. Zero payroll writes.

Reconciliation definitions (unchanged, same as the Historical Close Matrix):

```
STAFLY = period_base_pay.base_total_pay + approved extras − approved deductions
SOURCE = Σ coalesce(period_base_pay.approved_total_override, base_total_pay)
DIFF   = SOURCE − STAFLY
```

The 11 GREEN periods (129, 132, 133, 135, 136, 137, 139, 140, 143, 145, 147) were not
re-audited and were not touched.

---

## 1. Exception inventory

| Period | Dates | Workers | Source total | Stafly total | Difference | Workers w/ diff | Block reason | Published | Next action |
|---|---|---|---|---|---|---|---|---|---|
| 134 | May 27 – Jun 2 | 0 base / 25 with adjustments | $0.00 | $6,790.00 | −$6,790.00 | 25 | No external close imported; only adjustments exist | 0 | EXTERNAL CLOSE EVIDENCE REQUIRED |
| 141 | Jul 15 – Jul 21 | 0 base / 6 with adjustments | $0.00 | $3,300.00 | −$3,300.00 | 6 | No external close imported; only adjustments exist | 0 | EXTERNAL CLOSE EVIDENCE REQUIRED |
| 148 | Sep 2 – Sep 8 | 68 | $41,499.07 | $42,824.07 | −$1,325.00 | 3 | Duplicate worker records carrying imported extras | 0 | Resolve worker identity (no money change) |
| 146 | Aug 19 – Aug 25 | 26 | $15,714.14 | $14,934.14 | +$780.00 | 2 | 2 pending adjustments + $580 unexplained | 0 | Review differences |
| 144 | Aug 5 – Aug 11 | 37 | $17,974.36 | $17,330.36 | +$644.00 | 1 | Loan deduction not present in external close | 0 | Review differences |
| 131 | May 6 – May 12 | 48 | $26,954.39 | $26,354.39 | +$600.00 | 2 | 2 pending adjustments + $400 unexplained | 0 | Review differences |
| 142 | Jul 22 – Jul 28 | 50 | $28,418.24 | $28,965.24 | −$547.00 | 2 | Approved overrides below computed pay | 5 | Human decision (control case, unchanged) |
| 138 | Jun 24 – Jun 30 | 45 | $26,151.43 | $26,691.43 | −$540.00 | 1 | Duplicate worker record carrying imported extras | 0 | Resolve worker identity (no money change) |
| 128 | Apr 15 – Apr 21 | 45 | $30,446.05 | $30,046.05 | +$400.00 | 2 | 4 pending transport adjustments | 0 | Approve or reject pending adjustments |
| 130 | Apr 29 – May 5 | 0 | $0.00 | $0.00 | $0.00 | — | No base pay despite scheduled work | 0 | MISSING_HISTORICAL_PAYROLL_DATA |

## 2. Priority order

1. 134 — BLOCKED, −$6,790.00
2. 141 — BLOCKED, −$3,300.00
3. 148 — −$1,325.00 (most recent, identity)
4. 146 — +$780.00
5. 144 — +$644.00
6. 131 — +$600.00
7. 142 — −$547.00 (control case, do not modify)
8. 138 — −$540.00
9. 128 — +$400.00
10. 130 — no data, evidence of activity

## 3. Period 134 findings

- 37 adjustments, 25 workers, total $6,790.00, all `approved`.
- Concepts: Weekend Job, Pago de Transporte Regular, Horas de viaje.
- Origin: notes prefixed `[Import]` (VERIFIED / worker explanations) — worker-submitted extras loaded through the extras importer.
- `period_base_pay`: **0 rows** → no base pay, no `approved_total_override`, no external close.
- Activity evidence: 16 scheduled shifts, 21 assignments, 1 time entry in the window — work did happen.
- Published statements: 0.
- Verdict: **EXTERNAL CLOSE EVIDENCE REQUIRED.** "Adjustments without external close" means extras were imported for a week whose payroll close file was never imported. Reconciliation cannot be completed from existing evidence. Not auto-resolved.

## 4. Period 141 findings

- 8 adjustments, 6 workers, total $3,300.00, all `approved`, concepts Weekend Job + Horas de viaje, notes `[Import]`.
- `period_base_pay`: 0 rows. 1 scheduled shift, 0 assignments, 0 time entries.
- Published statements: 0.
- Verdict: **EXTERNAL CLOSE EVIDENCE REQUIRED.** Same shape as 134 with far less operational evidence; the payroll close file for Jul 15–21 was never imported.

## 5. Seven YELLOW periods — worker-level root cause

Worker differences sum exactly to each global difference.

### 128 · +$400.00
| Worker | Status | Diff | Root cause |
|---|---|---|---|
| Keury Camilo | REQUIRES_REVIEW | +$200.00 | 2 pending transport adjustments ($100 each) included in the external close, still unapproved in Stafly |
| Jorge Cortes | REQUIRES_REVIEW | +$200.00 | same — 2 pending transport adjustments |

Residual after pending: $0.00 → fully explained by *missing approval*, not missing money.

### 131 · +$600.00
| Worker | Status | Diff | Root cause |
|---|---|---|---|
| Brayant Paulino | REQUIRES_REVIEW | +$400.00 | $100 pending transport + $300 unexplained against the close line ("NUEVO SALDO 919 DOLARES") |
| Carlos Alvarez | REQUIRES_REVIEW | +$200.00 | $100 pending transport + $100 unexplained ("RIDE 29 DE MAYO NOMINA PASADA") |

Residual $400.00 → source mismatch, evidence insufficient to attribute. Not guessed.

### 138 · −$540.00
| Worker | Status | Diff | Root cause |
|---|---|---|---|
| Angel Colon (`24c83018…`, inactive) | DUPLICATE_CANDIDATE / STAFLY_ONLY | −$540.00 | Weekend Job $525 + Horas de viaje $15 imported onto a duplicate employee record; the canonical Angel Colon (`50f5c5ac…`, active) carries the identical amounts as `[Cierre externo aprobado]` |

Cause: **worker mismatch (duplicate identity)** — the money is counted once in the source and twice in Stafly. 5 `Angel Colon` records exist in this company.

### 142 · −$547.00 (control case — unchanged)
| Worker | Status | Diff | Root cause |
|---|---|---|---|
| Johny Munera | DIFFERENCE | −$495.00 | Approved override = $0.00 vs base $480 + $15 travel; close note "ADELANTO ZELLE PENDIENTE POR QUITAR 404 DOLARES" → approved override |
| Andres Vargas | DIFFERENCE | −$52.00 | Reintegros $52 (Uber reimbursement) present in Stafly, not in the approved override |

5 published statements preserved. Totals untouched.

### 144 · +$644.00
| Worker | Status | Diff | Root cause |
|---|---|---|---|
| Jorge Cortes | REQUIRES_REVIEW | +$644.00 | Loan deduction $644 ("deducion prestamo 3000-664") recorded in Stafly but not reflected in the external close override; the movement is stored with a positive value while classified as a deduction |

Cause: **missing payment component in the source / sign convention anomaly.**

### 146 · +$780.00
| Worker | Status | Diff | Root cause |
|---|---|---|---|
| Carlos Alvarez | REQUIRES_REVIEW | +$560.00 | $100 pending transport + $460 unexplained |
| Jorge Cortes | REQUIRES_REVIEW | +$220.00 | $100 pending transport + $120 unexplained ("NUEVO SALDO 990") |

Residual $580.00 → source mismatch, evidence insufficient.

### 148 · −$1,325.00 — see section 6.

No MATCH-side anomalies, no SOURCE_ONLY rows, and no UNMATCHED rows were found in these seven periods beyond the ones listed.

## 6. Period 148 — exact reconciliation

```
SOURCE   $41,499.07
STAFLY   $42,824.07   (base 24,746.07 + extras 18,730.00 − deductions 652.00)
DIFF     −$1,325.00
68 workers with base pay · 0 published statements
```

All −$1,325.00 comes from three duplicate worker records holding imported Weekend Job extras
that also exist, approved, on the canonical worker:

| Duplicate record | Amount | Canonical record holding the same amount |
|---|---|---|
| Angel Colon `24c83018…` (inactive, ID 1205) | −$525.00 | Angel Colon `50f5c5ac…` (active, ID 954) — `[Cierre externo aprobado]` |
| Edinson Leon `ef4e5966…` (ID 1259) | −$400.00 | Edinson Leon `d04a3506…` (ID 1104) — `[Cierre externo aprobado]` |
| Francisco Patino `82e58682…` (ID 1305) | −$400.00 | francisco patino `1f61628f…` (ID 1063) — `[Cierre externo aprobado]` |

Sum: −$1,325.00 exactly. Root cause: **worker mismatch (duplicate candidates)**, not missing money.
No balancing adjustment created, no statement published.

## 7. Period 130 classification

Window Apr 29 – May 5.

- `period_base_pay`: 0 rows. No import artifacts, no statements, no payments.
- Operational evidence: **17 scheduled shifts, 54 assignments**, 0 time entries.
- 3 auto-generated transport adjustments ($100 each, pending) dated 2026-05-03 for Carlos Alvarez, Jorge Cortes, Oliver Martinez.

Classification: **MISSING_HISTORICAL_PAYROLL_DATA.** Scheduled work and system-generated
adjustments inside the window contradict a zero-activity week; the close file was never imported.
Not inferred from absence alone.

## 8. Operator exception queue UX

Added inside the existing "Matriz de cierre histórico" (no new module), above the period filter:

- Desktop table: Período · Fechas · Diferencia · Personas afectadas · Motivo · Prioridad · Acción.
- Mobile cards: period, difference, reason, affected workers, single CTA. No charts, no bulk close.
- Sorting: BLOCKED first, then largest absolute difference, then most recent period.
- CTAs open the exact period summary already filtered to that period:
  - `Revisar cierre externo` (blocked periods)
  - `Revisar diferencias` (yellow periods)
  - `Verificar sin actividad` (no-data periods)
- GREEN periods never appear in the queue.

## 9. Remaining human decisions

1. 134 and 141 — provide or confirm absence of the external close files (May 27–Jun 2, Jul 15–Jul 21).
2. 130 — confirm whether the Apr 29–May 5 payroll exists outside Stafly.
3. 138 and 148 — approve merging the duplicate worker records (identity decision, not payroll).
4. 128 — approve or reject the 4 pending transport adjustments.
5. 131 ($400) and 146 ($580) — supply the source line detail behind the unexplained residuals.
6. 144 — confirm whether the $644 loan deduction belongs to this period's close.
7. 142 — control case; leave as is unless explicitly authorised.

## 10. Zero-write confirmation

No INSERT/UPDATE/DELETE of any kind was issued. Untouched: payroll formulas, `time_entries`,
`period_base_pay`, `movements`, approved adjustments, worker rates, published statements, period
statuses, `scheduled_shifts`, `shift_assignments`, auth, RLS, payments, bookings, chat, documents,
tenants, billing, entitlements. No imports, no reimports, no publications, no worker notifications,
no data repair. Periods 142 and 147 verified unchanged ($28,418.24 / −$547.00 and $35,843.44 / $0.00,
5 and 2 published statements respectively). Only change shipped: a read-only exception section in the
existing matrix component.

---

FINAL VERDICT: 🟡 EXCEPTIONS ISOLATED — HUMAN EVIDENCE STILL REQUIRED
