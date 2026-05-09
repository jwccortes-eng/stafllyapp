# Shift Team Management Hub — Audit & Plan

## 1. Existing files & components found

**Desktop assignment mutations (source of truth today):**
- `src/pages/admin/Shifts.tsx` — insert/delete/replace assignments (lines ~761, 1224, 1300, 1334, 1467); main "Agregar empleados" flow.
- `src/components/shifts/ShiftDetailDialog.tsx` — desktop shift detail with team panel; insert assignments + bulk-confirm (`status:"confirmed"`).
- `src/components/shifts/form/TeamSection.tsx` — team picker used inside `ShiftFormShell` (create+edit), with admin selector and coverage chip.
- `src/components/shifts/EmployeeCombobox.tsx` — searchable picker with availability/driver/conflict gating.
- `src/components/shifts/ReplacementSuggestionDialog.tsx` — scored 1‑click replacement insert.
- `src/components/shifts/ShiftTeamPanel.tsx` — read-only team list with contact actions (already used by mobile sheet area).
- `src/components/shifts/ShiftRoleSlotsTeamPanel.tsx` — typed role slots staffing UI.
- `src/components/shifts/AttendanceValidator.tsx` — sets `attendance_status` (pending/present/late/absent/excused).
- `src/components/shifts/ShiftAttendancePanel.tsx` — wraps validator on the desktop dialog.
- `src/pages/admin/ShiftRequests.tsx` + `src/pages/admin/Requests.tsx` — claim/request approval flow that inserts an assignment.
- `src/pages/admin/ShiftOperations.tsx` — per-assignment role change + add worker.
- `src/lib/dispatch-writers.ts`, `src/lib/auto-dispatch.ts` — server-side-style insert helpers.
- `src/pages/portal/MyShifts.tsx` — worker self accept/reject (`response_status` updates).

**Read-only mobile surface:**
- `src/components/shifts/mobile/MobileShiftOperationsSheet.tsx` — the sheet we just hardened. Currently shows context, coverage, assigned, attendance, details, notes, source/history. No mutations.

**Coverage / permission guards already centralized:**
- `src/lib/shifts/assignment-coverage.ts` — `countStaffed`, `staffedAssignments` (excludes `rejected`/`removed`).
- `src/lib/shifts/shift-permissions.ts` — `canManageShifts({ allRoles, canAccessAdminForCompany, companyId })`.
- `src/lib/shifts/shift-guards.ts` — `isDraftShift` + version helpers (re-acceptance triggers).

## 2. Existing statuses (live data, prod)

`shift_assignments.status` (assignment lifecycle, what desktop writes):
`accepted` (3799) · `confirmed` (1982) · `pending` (501) · `removed` (49) · `rejected` (3).

`shift_assignments.response_status` (worker reply channel, written from portal):
`pending` (6259) · `rejected` (49) · `accepted` (26).

`shift_assignments.attendance_status` (set by `AttendanceValidator`):
`pending` (6309) · `present` (24) · `absent` (1) — plus `late` / `excused` defined in `ATTENDANCE_OPTIONS`.

Other relevant columns already present: `assignment_role`, `role_slot_id`, `accepted_shift_version`, `responded_at`, `accepted_at`, `rejected_at`, `last_notified_at`, `attendance_validated_by/at/notes`, `is_draft_reservation`, `import_batch_id`.

## 3. Existing safe mutations we can reuse (no new SQL needed)

- **Insert assignment** (`Shifts.tsx`, `ShiftDetailDialog.tsx`, `ShiftRequests.tsx`, `dispatch-writers`).
- **Delete assignment** (`Shifts.tsx` lines 1300/1334) — used today as "remove from shift".
- **Update `status` → confirmed** (`ShiftDetailDialog.tsx` line 422 bulk).
- **Update `assignment_role`** (`ShiftOperations.tsx` line 219).
- **Update `attendance_status`** via `AttendanceValidator` (RLS already enforces manager-only).
- **Update `response_status`** from worker portal only (`MyShifts.tsx`).
- **Approve request** (`ShiftRequests.tsx`) — insert + close request row.

All of the above already enforce `company_id` scoping and use the `Managers can edit shift_assignments` RLS path. RLS prevents workers from self-mutating attendance.

## 4. Gaps

1. No mobile-first surface for any of these actions; operators leave to desktop.
2. No explicit "Cancel worker on this shift" — current flow is `delete()`, which is destructive (audit/history lost) and overlaps with `removed` status that already exists but is barely used.
3. `response_status` and `status` semantics are duplicated and inconsistent (`accepted` lives in both columns, written by different actors). Needs a documented matrix before we expose state changes on mobile.
4. No-show is conceptually separate (`attendance_status='absent'`) but UI conflates it with assignment cancellation.
5. Worker requests/claims live in a different page (`ShiftRequests.tsx`) — mobile operators can't see "1 person requested this shift" inline.
6. No audit log entry on insert/delete of `shift_assignments` (no `shift_audit_log` writes from these paths). `ShiftAuditTrail.tsx` exists but is fed by other events.
7. Removing an assignment doesn't currently consider linked `time_entries` — we need a guard before we expose it on mobile.

## 5. Recommended architecture

**Component:** new `MobileShiftTeamHub.tsx` (sibling of `MobileShiftOperationsSheet`), opened from the sheet via a single primary CTA "Manage team". The sheet stays the read-only operational view; the Hub owns mutations.

```text
MobileShiftOperationsSheet (read-only)
   └── [Manage team] →  MobileShiftTeamHub (full-height sheet)
                          ├── A. Coverage Summary strip
                          ├── B. Assigned (grouped by status)
                          ├── C. Requests (only if request rows exist)
                          ├── D. Add workers (EmployeeCombobox-mobile)
                          └── E. Per-worker actions (sheet-in-sheet)
```

**State model (no schema change):**

| UI bucket | Source of truth | How we read it |
|---|---|---|
| Confirmed | `status='confirmed'` | direct |
| Accepted | `status='accepted'` AND `response_status='accepted'` | direct |
| Pending  | `status='pending'` OR (`response_status='pending'` AND not rejected) | derived |
| Rejected by worker | `response_status='rejected'` | direct |
| Removed by ops | `status='removed'` | direct (instead of hard delete) |
| No-show / Present / Late | `attendance_status` | `AttendanceValidator` reused |

**Permission gate:** every mutation behind `canManageShifts(...)` (already exists). Workers see the read-only sheet only.

**Reuse, don't rebuild:** the Hub composes existing primitives — `EmployeeCombobox`, `AttendanceValidator`, `ShiftTeamPanel`. No new RPCs.

**Deprecate hard delete on mobile:** mobile-only "Remove" must write `status='removed'` (soft); hard delete stays desktop-only and only when there are zero linked `time_entries`.

## 6. Recommended Phase 1 (this sprint, safe)

**Phase 1 — Mobile read + minimal safe mutations, behind `canManageShifts`:**

1. Add a "Manage team" CTA in `MobileShiftOperationsSheet` → opens `MobileShiftTeamHub`.
2. Hub renders sections A + B + (C if requests exist) using existing data already loaded by the sheet.
3. Per-worker actions (whitelist):
   - **Accept on behalf** → `status='accepted'`, `accepted_at=now()` (mirrors desktop bulk path).
   - **Confirm** → `status='confirmed'`.
   - **Mark attendance** → reuse `AttendanceValidator` inline.
   - **Soft-remove from shift** → `status='removed'`, `response_status` unchanged. Confirmation dialog. Blocked if a `time_entries` row exists for this `(employee_id, shift_id)` window.
4. **Add worker**: launch `EmployeeCombobox` in a sub-sheet; insert with current desktop payload shape (`status:'pending'`, `response_status:'pending'`, role inherited from open slot).
5. **Requests:** read-only list with deep link to `/app/shifts/requests` for approval (no mutation on mobile yet).

**Explicitly out of Phase 1:**
- Hard delete of assignments on mobile.
- Cancelling the whole shift, duplicating, editing details (stay on desktop; show "Open on desktop" link).
- Bulk publish / re-notify.
- Mass attendance changes.
- Any change to `time_entries`, payroll, scheduled hours, RLS, or schema.

**Phase 2 (separate task, requires migrations):**
- Add `shift_audit_log` write triggers for assignment insert/update/delete.
- Formalize `response_status` vs `status` with a CHECK trigger and a single helper RPC `assign_worker_to_shift` / `set_assignment_state`.
- Mobile cancel-shift + duplicate-shift.

## 7. Safety contract carried into implementation

- Payroll continues to read only `time_entries`. No mutation in Phase 1 touches `time_entries` or `payroll_*`.
- Scheduled hours never feed payroll.
- Soft-remove (`status='removed'`) preserves history; no `delete()` from mobile.
- Every mutation gated by `canManageShifts(...)` and tenant-scoped (`company_id = selectedCompanyId`).
- Destructive actions require an explicit confirm sheet.
- Worker portal behavior unchanged.
- Desktop flows untouched.

## Deliverables for the next loop (only after you approve this plan)

- Step 1 PR: `MobileShiftTeamHub.tsx` skeleton + "Manage team" CTA, no mutations yet — safe preview.
- Step 2 PR: wire the 4 whitelisted actions in §6.3 with confirm dialogs and `time_entries` guard.
- Step 3 PR: Add-worker sub-sheet using `EmployeeCombobox`.
