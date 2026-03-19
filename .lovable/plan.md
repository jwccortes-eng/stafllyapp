

## Plan: Fix Payroll Reconciliation CT Totals

### Problem

The `resyncAllPeriods` function in `migration-schedule-sync/index.ts` fetches all payroll raw imports in a single query (7,054 rows) with `.limit(10000)`. The Supabase REST API has a server-side max-rows cap (default 1,000), so only the first ~1,000 rows are returned. This means most payroll files are invisible to the reconciliation engine, producing CT totals based on a fraction of the data.

Secondary issues:
- The file `Copia de PAYROLL 01_14 - 01_20 FINAL F.xlsx` doesn't follow the `YYYY-MM-DD_YYYY-MM-DD` naming pattern, so `rangeToken` matching fails — it falls back to per-row date matching which may miss "weekly total" summary rows that lack dates.
- `Libro1.xlsx` (47 rows) also has no date-range token.

### Fix

**Replace the single bulk payroll query with paginated fetching** inside `resyncAllPeriods`:

1. **Paginate the payroll raw imports query** — fetch in batches of 1,000 using `.range(offset, offset+999)` until no more rows are returned. Concatenate all batches into `payrollRows`.

2. **Improve non-standard filename matching** — for files that don't contain a `YYYY-MM-DD_YYYY-MM-DD` token, extract date range from the filename using broader patterns (e.g., `01_14 - 01_20` → Jan 14–20) or fall back to scanning the rows' date fields to determine which period they belong to.

3. **Redeploy and trigger resync** — deploy the updated edge function and invoke `resync_all` to recalculate all period totals.

### Technical Details

**Pagination approach** (lines 562-574 of `migration-schedule-sync/index.ts`):
```typescript
// Replace single query with pagination loop
const PAGE_SIZE = 1000;
let allPayrollRaw: any[] = [];
let offset = 0;
while (true) {
  const { data } = await supabase
    .from("migration_raw_imports")
    .select("raw_payload, file_name")
    .eq("company_id", companyId)
    .eq("record_type", "payroll")
    .order("row_index")
    .range(offset, offset + PAGE_SIZE - 1);
  if (!data || data.length === 0) break;
  allPayrollRaw = allPayrollRaw.concat(data);
  if (data.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}
```

**Non-standard filename matching** — add a helper that extracts month/day ranges from filenames like `PAYROLL 01_14 - 01_20`:
```typescript
function extractDateRangeFromFileName(fn: string, year = "2026"): [string, string] | null {
  const m = fn.match(/(\d{1,2})[_/-](\d{1,2})\s*[-–]\s*(\d{1,2})[_/-](\d{1,2})/);
  if (!m) return null;
  return [
    `${year}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`,
    `${year}-${m[3].padStart(2,"0")}-${m[4].padStart(2,"0")}`
  ];
}
```

**Files changed**: `supabase/functions/migration-schedule-sync/index.ts` only.

**Post-deploy**: Invoke `resync_all` action to recalculate all 12 periods with the complete dataset.

