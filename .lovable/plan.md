## Import Review Center v1 — Read-only diff between Connecteam dry-run and Stafly

### Goal
A new admin-only screen that lets Jorge **see what a Connecteam import would do before approving it**. It compares an existing dry-run batch (already produced by `/app/import-schedule` in Auditoría mode) against current Stafly state and surfaces every shift-, worker-, location- and warning-level difference. **No writes, no real import** — pure review.

### Why dry-run is the source
The dry-run already persists everything we need:

- `import_batches` (status `dry_run`) — counters + `warnings` jsonb
- `raw_schedule_import_rows` — every Excel row verbatim
- `normalized_schedule_rows` — parsed shift+employee rows with `matched_employee_id`, `employee_match_method`, `employee_match_confidence`, `client_name`, `location_name`, `shift_title`, `notes`, `external_shift_id`, `availability_status`, `has_conflict`, `conflict_details`
- The `SHIFT_RECONCILED_BY_FALLBACK_KEY` warning carries `matched_scheduled_shift_id`

So v1 doesn't need any new ingestion — it builds the diff from existing audit rows.

### New route
`/app/import-review` (admin-only, behind `canAccessAdminForCompany`). Sidebar entry under "Operations" next to "Import Schedule".

### Page layout

```
┌─ Header ──────────────────────────────────────────────────────────────┐
│  Import Review · <file_name> · <date_range>                          │
│  [Batch selector ▾]   Status: dry_run · 10 shifts · 50 assignments   │
└──────────────────────────────────────────────────────────────────────┘
┌─ Summary strip ──────────────────────────────────────────────────────┐
│  Matched exact: N · Matched by fallback: N · Would create: N         │
│  Possible duplicate: N · Needs review: N                             │
│  Warnings by code (chips with counts)                                │
└──────────────────────────────────────────────────────────────────────┘
┌─ Shift list (one card per parsed shift) ─────────────────────────────┐
│  date · job · start–end · slots                                      │
│  [Diff badge]  [N warnings]                                          │
│  ▸ Expand → drawer                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

Each shift card expands into a drawer with **3 columns**: Connecteam (source), Stafly (current), Proposal (what import would do).

### Per-shift drawer sections
1. **Shift header diff** — date, start/end, job/client, address, note, source `Last Status`.
2. **Stafly match** — `scheduled_shift.id`, `shift_code`, client, `location_id`/`job_site_location_id`, `meeting_point`/`meeting_time`, `slots`, `publication_status`, current `assigned workers`. Resolved via `SHIFT_RECONCILED_BY_FALLBACK_KEY.details.matched_scheduled_shift_id` for fallback rows; via strict `(shift_code|date|start|end)` lookup otherwise.
3. **Diff status badge** — one of: `Matched exactly` · `Matched by fallback` · `Would create new` · `Possible duplicate` · `Needs review`. Derived from warning presence + match resolution.
4. **Worker comparison table** — left=Connecteam expected (from `normalized_schedule_rows`), right=Stafly current (from `shift_assignments`). Columns: name, status (`matched` / `missing in Stafly` / `extra in Stafly` / `inactive matched` / `placeholder` / `imported accept only`), candidate links, warning chips.
5. **Location proposal** — Connecteam Address vs current Stafly `location_id`. If `ADDRESS_MAPPED_TO_LOCATION` warning present → show "would create job-site location" with the address text and `on_reconcile` flag.
6. **Note proposal** — Connecteam note vs current `meeting_point`/`meeting_time`. If `NOTE_MEETING_POINT_PARSED` → render parsed `meeting_point_text`, `meeting_time`, `driver_hint`, confidence; if `NOTE_PARSE_NEEDS_REVIEW` → render raw note + reason. Always indicate "current value preserved" if Stafly already has data (matches the conservative reconcile rule).
7. **Warnings list** — full structured list of warnings scoped to this shift (filtered by `date` + `job` + `start_time` + `end_time` from `import_batches.warnings`).

### Warning badges supported
All 12 codes the user listed render as named chips with severity color:
`INACTIVE_MATCH_REPLACED_WITH_ACTIVE`, `MULTIPLE_ACTIVE_DUPLICATES_NEED_REVIEW`, `EMPLOYEE_MATCHED_TO_CANONICAL_ACTIVE_DUPLICATE`, `SHIFT_RECONCILED_BY_FALLBACK_KEY`, `MULTIPLE_EXISTING_SHIFT_MATCHES_NEED_REVIEW`, `WORKER_OMITTED_OVERLAP_NEEDS_REVIEW`, `ADDRESS_MAPPED_TO_LOCATION`, `NOTE_MEETING_POINT_PARSED`, `NOTE_PARSE_NEEDS_REVIEW`, `IMPORTED_ACCEPT_NOT_STAFLY_RESPONSE`, `PLACEHOLDER_SYSTEM_EXCLUDED` (derived from `person_type_guess` filter — emit at render time, no DB), `PAY_RIDE_DETECTED` (derived from raw row matching `PAY RIDE` pattern — render-time).

### v1 actions (review-only, no DB writes)
- **View details** (drawer, default).
- **Copy summary** — copies a markdown digest of the shift drawer to clipboard.
- **Mark reviewed** — local-only state via `localStorage` keyed by `batch_id:shift_signature`. No DB row created.
- **Export review report** — generates a CSV in-browser (one row per shift) with diff status, warning codes, expected vs found workers. Downloaded client-side.

Real "Apply import" is intentionally **out of scope** — the existing `/app/import-schedule` page remains the single applier.

### Files to add
- `src/pages/admin/ImportReview.tsx` — page shell, batch selector, summary strip, shift list.
- `src/components/admin/import-review/ShiftDiffCard.tsx` — list card + diff badge.
- `src/components/admin/import-review/ShiftDiffDrawer.tsx` — 3-column drawer with the 7 sections.
- `src/components/admin/import-review/WorkerDiffTable.tsx` — worker comparison table.
- `src/components/admin/import-review/WarningChip.tsx` — labeled, color-severity chip per warning code.
- `src/lib/import-review/build-review-model.ts` — pure function that turns `(batch, raw_rows, normalized_rows, scheduled_shifts, assignments, employees, locations, clients)` into the `ReviewModel[]` shape consumed by the UI. Includes derived warnings (`PLACEHOLDER_SYSTEM_EXCLUDED`, `PAY_RIDE_DETECTED`).
- `src/lib/import-review/types.ts` — shared types.
- `src/lib/import-review/csv-export.ts` — CSV serializer for the export report.

### Files to edit
- `src/App.tsx` — add `/app/import-review` route guarded by `AdminLayout`.
- `src/components/admin/AdminSidebar.tsx` — add "Import Review" link.
- `src/components/admin/MobileAdminHome.tsx` — add the same tile (mobile parity).

### Data fetching
Single tenant-scoped query bundle on mount:
```
import_batches (selectedCompanyId, status='dry_run', latest 10) → batch picker
selected batch → raw_schedule_import_rows + normalized_schedule_rows
distinct (shift_code|date|start|end) + matched_scheduled_shift_id from warnings
→ scheduled_shifts (+ shift_assignments + employees joined)
+ companies' clients + locations needed for proposal rendering
```
All filtered by `company_id = selectedCompanyId`. Standard tenant-isolation rules.

### Out of scope for v1 (explicit)
- PDF parsing (job/client + worker PDFs). Excel-only for v1.
- Any write paths (no `update`, no `insert` outside the existing dry-run flow which lives in `/app/import-schedule`).
- Approving/applying changes from this screen.
- Notifications, payroll, time_entries, attendance, employee merge, RLS/schema changes.

### Restrictions honored
- Read-only queries only.
- Tenant-scoped: every query filtered by `selectedCompanyId`.
- Admin-only via `canAccessAdminForCompany` on the `AdminLayout` guard.
- Placeholder/system rule applied at render time (`person_type_guess` + `payroll_safe`) — never treats System N as real.
- No `auth.uid()`-only queries.
- `localStorage` only for "Mark reviewed" UI state — no PII.

### Acceptance / verification (after build)
- TypeScript clean.
- For batch `6dea996a-…`, J EVENTS #0239 expanded drawer shows: badge `Matched by fallback`, Stafly id `c4f4ad20-…`, Stafly `shift_code 239`, location preserved chip, parsed meeting point chip, 5 imported-accept worker chips, no "Would create" badge.
- For YF PRODUCTIONS #0241, drawer surfaces 11 unmatched workers with the `ASSIGNMENT_FAILURE` reason.
- Export CSV downloads with one row per shift, one column per warning code count, plus expected/found workers.