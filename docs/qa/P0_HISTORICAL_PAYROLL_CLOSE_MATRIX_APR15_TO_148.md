# P0 — HISTORICAL PAYROLL CLOSE MATRIX — APR 15, 2026 → PERIOD 148

Company: **Quality Staff by Keury** (`00000000-0000-0000-0000-000000000001`)
Mode: **READ-ONLY** — zero payroll mutations, zero imports, zero publications, zero notifications.
Date: 2026-09-15 UTC

Reconciliation model used (existing canonical sources only, no new formulas):

```
STAFLY COMPARABLE = period_base_pay.base_total_pay
                  + approved movements (concepts.category = 'extra')
                  - approved movements (concepts.category <> 'extra')

SOURCE COMPARABLE = sum(period_base_pay.approved_total_override)   -- approved_total_source = 'external_approved'

DIFFERENCE        = SOURCE - STAFLY
```

Validated against known controls: period 142 reproduces `28,965.24 / 28,418.24 / −547.00`, period 147 reproduces `35,843.44 / 0.00`.

---

## 1. EXECUTIVE SUMMARY

```
HISTORICAL PAYROLL COVERAGE
Date range:            Apr 15, 2026 → Sep 8, 2026 (period 148 canonical end)
Expected periods:      21 (seq 128–148, contiguous weekly Wed→Tue)
Missing weeks:         0
Duplicate / overlap:   0
Periods with source import: 18
GREEN reconciled:      11
YELLOW review:         7
RED blocked:           2   (134, 141 — adjustments without external close)
GRAY no data:          1   (130)
Total eligible statements (workers with base pay): 954
Published statements:  13
Unpublished:           941
```

Periods requiring action: **128, 131, 134, 138, 141, 142, 144, 146, 148**.

---

## 2. CANONICAL PERIOD CONTINUITY

All periods resolved from `pay_periods`, not filenames. Sequence 128 → 148 is continuous, weekly, no gaps, no overlaps, no duplicate ranges. All 21 periods carry lifecycle status `open` in the database (no period was changed by this audit).

| # | Start | End |
|---|---|---|
| 128 | 2026-04-15 | 2026-04-21 |
| 129 | 2026-04-22 | 2026-04-28 |
| 130 | 2026-04-29 | 2026-05-05 |
| 131 | 2026-05-06 | 2026-05-12 |
| 132 | 2026-05-13 | 2026-05-19 |
| 133 | 2026-05-20 | 2026-05-26 |
| 134 | 2026-05-27 | 2026-06-02 |
| 135 | 2026-06-03 | 2026-06-09 |
| 136 | 2026-06-10 | 2026-06-16 |
| 137 | 2026-06-17 | 2026-06-23 |
| 138 | 2026-06-24 | 2026-06-30 |
| 139 | 2026-07-01 | 2026-07-07 |
| 140 | 2026-07-08 | 2026-07-14 |
| 141 | 2026-07-15 | 2026-07-21 |
| 142 | 2026-07-22 | 2026-07-28 |
| 143 | 2026-07-29 | 2026-08-04 |
| 144 | 2026-08-05 | 2026-08-11 |
| 145 | 2026-08-12 | 2026-08-18 |
| 146 | 2026-08-19 | 2026-08-25 |
| 147 | 2026-08-26 | 2026-09-01 |
| 148 | 2026-09-02 | 2026-09-08 |

---

## 3. COMPLETE PERIOD MATRIX

| # | Workers | Base | Extras | Deductions | Stafly | Source | Difference | Recon | Statements |
|---|---|---|---|---|---|---|---|---|---|
| 128 | 45 | 14,044.05 | 17,721.00 | 1,719.00 | 30,046.05 | 30,446.05 | **+400.00** | YELLOW | 0/45 |
| 129 | 51 | 13,949.83 | 6,425.00 | 826.00 | 19,548.83 | 19,548.83 | 0.00 | GREEN | 0/51 |
| 130 | 0 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | GRAY | 0/0 |
| 131 | 48 | 11,854.39 | 15,519.00 | 1,019.00 | 26,354.39 | 26,954.39 | **+600.00** | YELLOW | 0/48 |
| 132 | 66 | 28,559.65 | 10,030.00 | 0.00 | 38,589.65 | 38,589.65 | 0.00 | GREEN | 0/66 |
| 133 | 51 | 14,036.76 | 5,213.00 | 33.00 | 19,216.76 | 19,216.76 | 0.00 | GREEN | 0/51 |
| 134 | 0 | 0.00 | 6,790.00 | 0.00 | 6,790.00 | 0.00 | **−6,790.00** | RED | 0/0 |
| 135 | 71 | 49,331.48 | 8,050.00 | 2,233.00 | 55,148.48 | 55,148.48 | 0.00 | GREEN | 0/71 |
| 136 | 64 | 33,159.06 | 8,009.00 | 1,794.00 | 39,374.06 | 39,374.06 | 0.00 | GREEN | 0/64 |
| 137 | 67 | 30,207.34 | 1,478.85 | 727.00 | 30,959.19 | 30,959.19 | 0.00 | GREEN | 0/67 |
| 138 | 45 | 16,961.43 | 11,176.00 | 1,446.00 | 26,691.43 | 26,151.43 | **−540.00** | YELLOW | 0/45 |
| 139 | 27 | 11,934.96 | 7,490.00 | 198.00 | 19,226.96 | 19,226.96 | 0.00 | GREEN | 1/27 |
| 140 | 22 | 7,925.60 | 2,940.00 | 125.00 | 10,740.60 | 10,740.60 | 0.00 | GREEN | 0/22 |
| 141 | 0 | 0.00 | 3,300.00 | 0.00 | 3,300.00 | 0.00 | **−3,300.00** | RED | 0/0 |
| 142 | 50 | 23,989.24 | 6,184.00 | 1,208.00 | 28,965.24 | 28,418.24 | **−547.00** | YELLOW (known) | 5/50 |
| 143 | 52 | 19,813.62 | 5,774.00 | 1,149.00 | 24,438.62 | 24,438.62 | 0.00 | GREEN | 3/52 |
| 144 | 37 | 10,719.36 | 7,805.00 | 1,194.00 | 17,330.36 | 17,974.36 | **+644.00** | YELLOW | 0/37 |
| 145 | 44 | 17,976.94 | 7,770.00 | 1,029.00 | 24,717.94 | 24,717.94 | 0.00 | GREEN | 2/44 |
| 146 | 26 | 10,656.14 | 5,076.00 | 798.00 | 14,934.14 | 15,714.14 | **+780.00** | YELLOW | 0/26 |
| 147 | 60 | 30,594.44 | 5,706.00 | 457.00 | 35,843.44 | 35,843.44 | 0.00 | GREEN | 2/60 |
| 148 | 68 | 24,746.07 | 18,730.00 | 652.00 | 42,824.07 | 41,499.07 | **−1,325.00** | YELLOW | 0/68 |

---

## 4. IMPORT COVERAGE

- 18 of 21 periods have external close rows (`approved_total_source = 'external_approved'`) → **IMPORTED**.
- Periods **130** → no base pay, no adjustments beyond 3 pending movement rows with $0 net effect → **NO IMPORT / NO DATA**.
- Periods **134** and **141** → adjustments exist (25 and 6 people) but **no imported base/close** → NO IMPORT, not "imported with zeros".
- Traceable `imports` rows exist only for 128 and 129 (`UNTITLED_REPORT_2026-04-15_2026-04-21.xlsx`, `UNTITLED_REPORT_2026-04-22_2026-04-28.xlsx`, both Phase D pilot, committed 2026-04-30). Periods 131–148 carry the external close inside `period_base_pay` without a retained `imports` row — filename/batch provenance is **not traceable** for those periods.
- No preview-only artifacts were counted as imports.

---

## 5. RECONCILIATION STATUS

- GREEN (11): 129, 132, 133, 135, 136, 137, 139, 140, 143, 145, 147.
- YELLOW (7): 128 (+400), 131 (+600), 138 (−540), 142 (−547, approved override), 144 (+644), 146 (+780), 148 (−1,325).
- RED (2): 134, 141 — adjustments without a source close; cannot be reconciled as-is.
- GRAY (1): 130.

No formulas modified, no balancing adjustments created.

## 6. WORKER MATCHING

Source and Stafly share the same worker rows (`period_base_pay`), so matched workers equal Stafly workers in every imported period, with 0 source-only and 0 unmatched identities. Workers holding adjustments but no base/close row (identity NOT auto-resolved):

| # | Workers with adjustments outside the close |
|---|---|
| 130 | 3 |
| 134 | 25 |
| 138 | 1 |
| 141 | 6 |
| 148 | 3 |

All other periods: 0. Pending (unapproved) adjustments remain in 128 (4), 130 (3), 131 (2), 146 (2).

## 7. STATEMENT PUBLICATION COVERAGE

| # | Published / eligible | Published amount |
|---|---|---|
| 139 | 1/27 | 315.00 |
| 142 | 5/50 | 6,356.08 |
| 143 | 3/52 | 2,223.83 |
| 145 | 2/44 | 3,210.00 |
| 147 | 2/60 | 2,448.00 |
| all others | 0/N | — |

Total 13 published of 954 eligible. Publication is reported separately and never used as a reconciliation signal. Worker "viewed" state is not tracked in the data model.

## 8. PERIODS REQUIRING ACTION

1. **134** (RED) — $6,790 of adjustments, 25 people, no external close imported.
2. **141** (RED) — $3,300 of adjustments, 6 people, no external close imported.
3. **148** (YELLOW) — −$1,325.00; also 3 people with adjustments outside the close.
4. **146** (YELLOW) — +$780.00 and 2 pending adjustments.
5. **144** (YELLOW) — +$644.00.
6. **131** (YELLOW) — +$600.00 and 2 pending adjustments.
7. **128** (YELLOW) — +$400.00 and 4 pending adjustments.
8. **138** (YELLOW) — −$540.00 plus 1 adjustment-only worker.
9. **142** (YELLOW) — −$547.00, already explained by approved overrides; documentation only.
10. **130** (GRAY) — confirm whether the week genuinely had no payroll.

## 9. PERIOD 142 REGRESSION

Calculated $28,965.24 · Approved $28,418.24 · Difference −$547.00 — **unchanged**. 50 approved overrides intact, 5 published statements intact.

## 10. PERIOD 146 REGRESSION

Canonical dates Aug 19–25 confirmed; the Aug 19–25 source belongs to this period. No rows moved. Current difference +$780.00 with 2 pending adjustments — classified YELLOW (review), not "misassigned". The historical defect remains "import executed while period was closed".

## 11. PERIOD 147 REGRESSION

60 workers · Base $30,594.44 · Extras $5,706.00 · Deductions −$457.00 · Final $35,843.44 · Difference $0.00 — **unchanged**. Published statements preserved and untouched: Alejandro Cortes $176.00 (`e2a7ddcb-…`, 2026-09-15 02:11:03Z) and Jorge Cortes $2,272.00 (`d7b13742-…`, 2026-09-15 02:11:14Z). No other statement published.

## 12. PERIOD 148 CURRENT STATE

Contrary to the earlier report, period 148 (`b17caedc-…`, Sep 2–8, status `open`) **now contains data**: 68 workers, base $24,746.07, approved extras $18,730.00, deductions $652.00 → Stafly $42,824.07 vs source close $41,499.07, difference **−$1,325.00**. 3 workers hold adjustments without a close row. 0 statements exist, 0 published.

## 13. PRODUCTION WRITES

**None.** Only `SELECT` queries were executed. No imports, reimports, publications, notifications, lifecycle-status changes, or data repairs. Code changes are presentation-only: new read-only component `src/components/payroll/HistoricalCloseMatrix.tsx` and its mount in `src/pages/admin/PayPeriods.tsx`. No "close all", "publish all" or "approve all" control was created.

## 14. RECOMMENDED CLOSE ORDER

1. Close the 11 GREEN periods in ascending order (129, 132, 133, 135, 136, 137, 139, 140, 143, 145, 147) after human sign-off, one at a time.
2. Document and accept 142 (override already approved).
3. Resolve the small variances: 128, 131, 138, 144, 146 — approve or reject pending adjustments first, then re-check difference.
4. Resolve 148 (−$1,325.00) with the source file owner.
5. Obtain the external close for 134 and 141, or formally declare their adjustments out of scope.
6. Confirm 130 was a genuinely empty week.
7. Only then consider statement publication, period by period.

## QA

- Every canonical period Apr 15 → 148 represented; 21/21, no duplicates, no silent gaps.
- Reconciliation math reproducible by SQL and by the UI component (same definitions).
- Period 142 unchanged; 146 correctly classified; 147 $35,843.44 / $0.00 with both statements preserved.
- No payroll writes, no notifications.
- Typecheck clean; regression suite **1,288 tests passed (112 files)**.

---

## FINAL VERDICT

🟡 HISTORICAL PAYROLL MOSTLY RECONCILED — EXCEPTIONS REQUIRE REVIEW
