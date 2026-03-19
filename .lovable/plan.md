

## Plan: Fix Payroll Reconciliation + Add Print All Button

There are two issues to address: (1) the Stafly totals in the reconciliation are still wrong after resync, and (2) you want a "Print All" button to print the full Migration + Reconciliation report.

---

### Root Cause of Wrong Stafly Totals

The data shows a clear mismatch between what the edge function calculates vs what's actually in the database:

| Period | SF Gross (Saved) | Actual DB Sum | Difference |
|--------|-----------------|---------------|------------|
| 113 (Dec 31-Jan 6) | $68,022 | $46,862 | +$21,160 |
| 118 (Feb 4-10) | $105,336 | $77,907 | +$27,429 |
| 119 (Feb 11-17) | $126,906 | $75,358 | +$51,548 |

**Diagnosis**: The edge function's movement aggregation is double-counting. When it sums `bp.pay + extras` per employee in the `periodBase` loop, AND then adds movements for employees without base pay in a second loop, employees who appear in BOTH lists get their movement value counted twice — once via the `extras` lookup and once in the fallback loop.

**Fix**: Rewrite the Stafly total calculation in `resyncAllPeriods` to use a single-pass aggregation that properly deduplicates employee totals, matching the SQL query: `SUM(base_total_pay) + SUM(movements.total_value)` per period.

### Changes

#### 1. Fix `resyncAllPeriods` in `migration-schedule-sync/index.ts`

Replace the Stafly total calculation (lines 689-709) with a cleaner approach:
- Build a unified employee map per period
- For each employee: add base pay once, add movement total once
- This matches the SQL: `COALESCE(base_sum, 0) + COALESCE(mov_sum, 0)` per period

Also fix the CT side: Period 123 (Mar 11-17) shows $0 CT gross — the payroll raw imports likely don't have data for that week yet, which is expected.

#### 2. Add "Print All" button to `MigrationCommandCenter.tsx`

Add a button next to the existing "Reconciliation Report" button that:
- Opens a new window/tab with both the Migration Overview data and the Reconciliation Report
- OR uses `window.print()` with a print-optimized layout that includes all tabs

**Approach**: Add a `handlePrintAll` function that:
1. Temporarily shows all tab content (not just the active tab)
2. Injects a print header with title/date
3. Calls `window.print()`
4. Restores the original tab state

#### 3. Improve print CSS in `index.css`

Add print-specific styles for:
- Showing all tab content panels simultaneously
- Proper page breaks between sections
- Table sizing for print

#### 4. Add print button to `ReconciliationReport.tsx`

Add `ReportActionsBar` with print and CSV export to the Reconciliation Report page.

### Technical Details

**Edge function fix** — replace the double-counting loop with:
```
for each period:
  sfEmps = Map<employeeId, {base: number, mov: number}>
  for bp in periodBase: sfEmps[bp.employee_id].base = bp.pay
  for [empId, val] in periodMov: sfEmps[empId].mov = val
  sfGross = sum of (base + mov) for all employees
```

**Print All** — will use a dedicated print mode that renders all migration sections sequentially, hidden behind `print:block` CSS classes, with proper page breaks.

**Deploy** — the edge function will be redeployed after the fix.

### Reminder

After this is done: work on the pricing/plans tables as requested.

