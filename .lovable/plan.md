

# Compensation Management System — Implementation Plan

## Context

The existing system has `concepts`, `concept_employee_rates`, and `movements` tables for basic rate management. The PayrollSettings page at `/app/payroll-settings` currently has two tabs (Ciclo y Reglas, Anticipos y Préstamos). This plan builds a full compensation management system on top of the existing infrastructure.

## Phase 1: Database Schema (Single Migration)

Create 7 new tables with RLS policies scoped by `company_id`:

1. **`compensation_profiles`** — Active compensation setup per employee (payment_mode, default rates for hourly/daily/ride, rate_source enum, effective_from/to, is_active, created_by/updated_by)

2. **`compensation_change_log`** — Immutable audit trail (action_type enum, changed_field, old/new values, source_type enum, source_file_name, source_row_number, import_batch_id, changed_by, metadata as jsonb)

3. **`company_compensation_rules`** — Company-level defaults and equivalency rules (rule_type enum, rule_name, amount, unit_type, applies_to_role/job/location/employee, priority, is_active)

4. **`payroll_import_batches`** — Import tracking (file_name, imported_by, status, total_rows, processed/warnings/errors counts)

5. **`payroll_interpreted_entries`** — Normalized interpreted payroll rows (interpreted_payment_type enum, detected rates/units, confidence_score, suggested/approved compensation change flags, raw_row_payload as jsonb)

6. **`payroll_rate_snapshots`** — Preserve compensation values at time of use (source_record_type, payment_mode, all rate fields, snapshot_reason, effective_date)

7. **`compensation_analysis_summary`** — Precomputed employee timeline from January to date (first/current hourly rates, change counts, detection flags for daily/ride/manual/mixed)

All tables get RLS policies using `has_role()` and `has_action_permission()` for `manage_compensation`. Enums created: `payment_mode_type`, `comp_action_type`, `comp_source_type`, `comp_rule_type`, `comp_unit_type`, `interpreted_payment_type`.

Seed initial `company_compensation_rules` for Quality Staff (daily full=200, half=125, ride regular=100, ride special=160).

## Phase 2: New Permissions

Add 6 new action permission keys to the existing `action_permissions` system (no schema change needed — it's a free-text `action` column):
- `manage_compensation`
- `import_payroll_compensation`
- `approve_compensation_changes`
- `view_compensation_history`
- `edit_compensation_matrix`
- `edit_compensation_analysis`

Update the Permissions page's `ACTION_GROUPS` array to include a new "Compensación" group.

## Phase 3: PayrollSettings — Add 4 New Tabs

Extend the existing PayrollSettings page with new tab triggers:

| Tab | Component | Purpose |
|-----|-----------|---------|
| Ciclo y Reglas | (existing) | Payroll cycle config |
| Anticipos y Préstamos | (existing) | Financial policies |
| **Compensation Matrix** | `CompensationMatrixTab` | Editable rate table for all employees |
| **Compensation Rules** | `CompensationRulesTab` | Company-level default rules CRUD |
| **Import Review** | `PayrollImportReviewTab` | Upload, interpret, review payroll files |
| **Compensation Analysis** | `CompensationAnalysisTab` | Jan-to-date historical analysis |

### 3A: Compensation Matrix Tab
- Fetches `compensation_profiles` joined with `employees` for the selected company
- Columns: Employee, Role, Payment Mode, Hourly Rate, Full Day, Half Day, Ride Regular, Ride Special, Rate Source, Effective From, Last Updated, Change Count, Status, Actions
- Inline editing via cell click → input → save with confirmation dialog
- Every save: upserts `compensation_profiles`, inserts `compensation_change_log`
- Bulk actions bar: bulk update rates, bulk apply daily rule, bulk set effective date, export
- DataTableToolbar with search/filter
- Permission-gated: only `manage_compensation` / owner / admin can edit

### 3B: Compensation Rules Tab
- CRUD interface for `company_compensation_rules`
- Sections grouped by rule_type (hourly defaults, daily rules, ride rules, employee-specific presets)
- Cards with inline editing for amount, applies_to filters, priority
- Preloaded with Quality Staff defaults on first load

### 3C: Payroll Import Review Tab
- Step wizard: Upload → Auto-detect sheet → Preview columns → Interpret → Review → Confirm
- Interpretation engine (client-side TypeScript):
  - Match employees by name fuzzy matching
  - Classify rows as hourly/daily/ride/manual using company_compensation_rules
  - Daily decomposition: try all (full_day, half_day) combinations that sum to total
  - Ride detection: match against ride rule amounts
  - Confidence scoring (0-100)
- Review table with approve/reject/correct per row
- On confirm: insert `payroll_import_batches`, `payroll_interpreted_entries`, optionally update `compensation_profiles` and log changes

### 3D: Compensation Analysis Tab
- Queries `compensation_analysis_summary` (precomputed) or computes on-the-fly from `compensation_change_log`
- Table: Employee, First Seen, First Rate, Current Rate, Change Count, Daily/Ride/Manual flags, Status
- Inline editable: approve/correct rates, mark payment mode, apply corrections
- Every edit creates audit trail

## Phase 4: Employee Profile — Compensation Section

Add a new "Compensation" tab to `EmployeeProfileTabs`:
- Shows current `compensation_profile` summary card
- "View History" button opens timeline from `compensation_change_log`
- "Change Compensation" button opens form dialog with effective date + reason
- Rate source badge (Company Default / Employee Override / Imported)
- Timeline view: date, old→new values, source, changed by, file reference

## Phase 5: Rate Snapshot Integration

Add a hook `useCompensationSnapshot` that:
- On shift creation/payroll calculation, captures current rates into `payroll_rate_snapshots`
- Links to source record (shift_id, time_entry_id, etc.)
- Used by consolidation to ensure historical accuracy

## Phase 6: Reporting Widgets

Add a "Compensation" section to the admin dashboard (or a dedicated sub-report):
- KPI cards: employees with rate changes, daily patterns, ride payments, unresolved warnings
- Summary table linking to the Analysis tab

## Files to Create/Modify

**New files (~8):**
- `src/components/compensation/CompensationMatrixTab.tsx`
- `src/components/compensation/CompensationRulesTab.tsx`
- `src/components/compensation/PayrollImportReviewTab.tsx`
- `src/components/compensation/CompensationAnalysisTab.tsx`
- `src/components/compensation/CompensationHistoryDialog.tsx`
- `src/components/compensation/CompensationChangeForm.tsx`
- `src/hooks/useCompensation.tsx`
- `src/lib/payroll-interpreter.ts`

**Modified files (~4):**
- `src/pages/admin/PayrollSettings.tsx` — add 4 new tabs
- `src/components/employee/EmployeeProfileTabs.tsx` — add Compensation tab
- `src/pages/admin/Permissions.tsx` — add Compensación action group
- `src/components/AdminSidebar.tsx` — no change needed (already links to payroll-settings)

**Database:** 1 migration with 7 tables, enums, RLS policies, and seed data.

## Implementation Order

Due to the size, this will be implemented in 3 batches:

**Batch 1:** Migration + CompensationMatrixTab + CompensationRulesTab + useCompensation hook + Permissions update

**Batch 2:** PayrollImportReviewTab + payroll-interpreter engine + CompensationAnalysisTab

**Batch 3:** Employee profile integration + CompensationHistoryDialog + rate snapshots + reporting widgets

