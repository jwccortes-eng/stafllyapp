# Daily Operations Command Center — Audit + Phased Plan

Read-only. No code, no schema, no payroll, no time_entries, no RLS, no notifications were modified.

---

## 1. File / component inventory (current state)

Admin pages already in the repo:

| Route | File | Lines | Purpose today |
|---|---|---|---|
| `/app/shifts` | `src/pages/admin/Shifts.tsx` | 2101 | Calendar + create/edit/delete/duplicate. Owns DayView/WeekView/MonthView/WeekByJobView/WeekByEmployeeView. |
| `/app/timeclock` | `src/pages/admin/TimeClock.tsx` → `components/timeclock/TimeClockCommandView.tsx` | 199 / 1094 | Open clocks, day/week/month, missing clocks. Reads `time_entries (+scheduled_shifts)`. |
| `/app/operations` | `src/pages/admin/OperationsCommandCenter.tsx` | 891 | Already joins `scheduled_shifts + shift_assignments + time_entries` with realtime. **Closest existing surface to the desired CC.** |
| `/app/command-center` | `src/pages/admin/CommandCenter.tsx` | 1022 | Counts/KPIs, partially overlaps with Operations. |
| `/app/shift-operations` | `src/pages/admin/ShiftOperations.tsx` | 654 | Per-shift drawer-style operations. |
| `/app/attendance` | `src/pages/admin/Attendance.tsx` | 667 | Attendance review. |

Mobile counterparts: `MobileShiftsView.tsx`, `MobileTimeClockView.tsx`, `components/admin/mobile/*` (Mobile Admin Module Shell — already standardized).

Shared shift components:
`ShiftCard`, `ShiftDetailDialog`, `ShiftAttendancePanel`, `ShiftTeamPanel`, `ShiftAuditTrail`, `ShiftActionBar`, `ShiftLiveMapPanel`, `StaffingRequiredBanner`, `UnstaffedAlert`, `WeeklySummaryBar`, `closeout/*`, `form/*`.

Shared timeclock components:
`TimeClockCommandView`, `DayDetailView`, `MonthClockView`, `WeekClockChipGrid`, `TimesheetView`.

Shared design system (DS3a):
`components/stafly-ui/ShiftRouteHeader` (Work Route standard — already used by portal), `mobile-agenda/OperationalTimeBlock`. **Reuse these — they already encode "Entrada protagonista / Termina aprox."**

---

## 2. Data availability map (already queryable, no schema changes required)

`scheduled_shifts`: id, company_id, title, date, start_time, end_time, status, publication_status, claimable, slots, location_id, job_site_location_id, meeting_point, meeting_point_location_id, meeting_time, shift_admin_id, driver_employee_id, attendance_mode, deleted_at, shift_link_token.

`shift_assignments`: shift_id, employee_id, status (pending/accepted/confirmed/rejected/removed), response_status, assignment_role, is_draft_reservation.

`time_entries`: id, employee_id, shift_id (nullable), clock_in, clock_out, break_minutes, status, company_id. → drives "checked in / open clock / missing clock-out / unlinked clock".

`employees`: id, first_name, last_name, phone_number, avatar_url, is_active, person_type_guess, payroll_safe.

`locations`: name, address (used by ShiftRouteHeader for job site/meeting point).

Derivable per shift, no new columns:
- coverage = `assignments(status in accepted/confirmed)` count vs `slots`
- clock state per assigned worker: `none | open | closed | missing_clock_out | unlinked`
- shift bucket: `needs_staff | staffed_not_started | in_progress | needs_closeout | closed`
- alert level: `info | warn | urgent` (warn = late > grace; urgent = no-show or open clock past end_time)

**Missing for full Phase B fidelity (proposed, not built yet):**
- A shared selector `getShiftOperationalState(shift, assignments, entries)` (UI helper, not DB).
- A reusable hook `useTodayOperations(companyId, dateISO)` returning the joined+derived view.
- Optional future view `vw_shift_today_ops` (Phase D only — flagged, not required).

---

## 3. Proposed information architecture

```text
/app/operations           ← Daily Operations Command Center (NEW canonical home)
    Today | Tomorrow | This week
    Modes: By shift · By worker · By alert
    Drawer: Operate shift (team, clocks, attendance, comments, audit)

/app/shifts               ← Scheduling Calendar (planning surface, simplified)
    Day / Week / Month / WeekByJob / WeekByEmployee
    Header CTA → "Open in Operations"

/app/timeclock            ← Time Clock Detail (specialist surface)
    Open clocks · Missing clocks · Unlinked entries · Day timesheet
    Header CTA → "Open shift in Operations"

/app/attendance           ← Attendance Review (validator surface, unchanged scope)
```

`/app/command-center` and `/app/operations` overlap today → consolidate into `/app/operations`. CommandCenter route stays as a redirect for back-compat.

---

## 4. Component architecture (proposed, additive)

```text
src/components/operations/
  TodayOpsShell.tsx                # filter chips, mode switcher, summary strip
  TodayOpsModeByShift.tsx          # grid of OpsShiftCard
  TodayOpsModeByWorker.tsx         # rows of OpsWorkerRow
  TodayOpsModeByAlert.tsx          # urgency-sorted feed
  OpsShiftCard.tsx                 # premium card: route header + coverage + clock chips + CTA
  OpsCoverageBar.tsx               # assigned/required pill
  OpsClockChip.tsx                 # checked_in | not_started | open_clock | missing_out
  OpsAlertChip.tsx                 # late | no_show | open_past_end | unlinked
  OperateShiftDrawer.tsx           # right drawer wrapping existing
                                   #   ShiftTeamPanel + ShiftAttendancePanel +
                                   #   ShiftCommentsPanel + ShiftAuditTrail
src/hooks/
  useTodayOperations.tsx           # joined query + derived state + realtime
src/lib/operations/
  derive-shift-ops-state.ts        # pure functions (testable)
  alert-rules.ts                   # late/no-show/open-clock thresholds (reuses
                                   # existing grace-period config)
```

Reuses (no rewrites):
- `ShiftRouteHeader` for Entrada/Termina aprox./meeting point.
- `ShiftTeamPanel`, `ShiftAttendancePanel`, `ShiftCommentsPanel`, `ShiftAuditTrail`, closeout components.
- TimeClockCommandView stays specialist; gains a "Shift" deep-link column → `/app/operations?shift=:id`.

---

## 5. Desktop vs mobile behavior

| Surface | Desktop | Mobile |
|---|---|---|
| Daily Operations | 3-pane: filters/summary · shift grid · drawer | Single column reusing Mobile Admin Module Shell + EntityCard + OperationsSheet |
| Scheduling | Full calendar views | `MobileShiftsView` (already shipped) |
| Time Clock | `TimeClockCommandView` desktop layout | `MobileTimeClockView` |
| Attendance | Validator table | Stack of EntityCards |

Drawer is right-side on desktop, full-screen Sheet on mobile (matches current `MobileShiftOperationsSheet`).

---

## 6. Phase plan (each phase is independently shippable, payroll-safe)

### Phase A — Visual + read-only integration (1 PR)
- Create `useTodayOperations` joining shifts + assignments + time_entries (subset of fields already used by OperationsCommandCenter).
- Build `TodayOpsShell` + `TodayOpsModeByShift` + `OpsShiftCard` using `ShiftRouteHeader`.
- Replace body of `/app/operations` with new shell; keep `/app/command-center` redirecting.
- Add header CTA on `/app/shifts` and `/app/timeclock` → "Open in Operations".
- **No writes. No payroll. No notifications. No schema. No RLS.**

### Phase B — Shift card clock indicators
- Implement `derive-shift-ops-state.ts` + `alert-rules.ts` (pure).
- Add `OpsCoverageBar`, `OpsClockChip`, `OpsAlertChip`.
- Add "By worker" and "By alert" modes (read-only feed).
- Time Clock alerts surfaced in shift context: `Carlos · YF Productions · 15:00 · open 17:05`.
- Unit tests for derive/alert pure functions.

### Phase C — Operate Shift drawer
- `OperateShiftDrawer` composes existing panels (team, attendance, comments, audit).
- Wire **existing** RPCs only (`set_shift_assignment_state`, `resolve_shift_request`, `assign_worker_to_shift`) — already SECURITY DEFINER, audited, payroll-safe.
- Mobile parity via `MobileShiftOperationsSheet`.

### Phase D — Reports & exports (future)
- Daily ops PDF/CSV (reuses Payroll Traceability + Worker History v1 patterns).
- Optional read-only DB view `vw_shift_today_ops` only if perf demands; gated by separate proposal.

---

## 7. Hard restrictions honored across all phases

- No changes to payroll logic, `time_entries` shape, or scheduled-hours-as-paid semantics.
- No RLS or schema changes (Phase A–C). Phase D's view is opt-in and would be proposed separately.
- No worker portal changes.
- No notifications sent.
- No mutations during the audit.

---

## 8. Open question before Phase A

Do you want me to **consolidate `/app/command-center` into `/app/operations`** (recommended — they overlap), or keep both routes? This affects only navigation; no data is moved.

Approve this plan and I'll start with Phase A (visual + read-only integration) behind no feature flag changes, with a single PR-sized diff.
