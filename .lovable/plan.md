# Desktop Shift Workspace + Pending Operational Info

Read-only audit + phased plan. Schema-free v1. No payroll, no `time_entries`, no attendance, no RLS, no notifications, no portal changes.

---

## 1. Audit — current state

### Files involved (what exists today)

| File | Lines | Role |
|---|---|---|
| `src/components/shifts/ShiftFormShell.tsx` | 244 | Modal shell. Already a desktop dialog (`lg:max-w-[1200px] lg:h-[92vh]`) with sticky header + `[1fr_360px]` form/summary grid + Save draft / Publish actions + dirty-close confirm. Solid foundation — does NOT need to be replaced, only extended. |
| `src/components/shifts/ShiftFormFields.tsx` | 575 | Single source of truth for `ShiftFormState`, `shiftToFormState`, `formStateToShiftPayload`, and `useShiftFormSignals`. Composes 7 sections vertically. |
| `src/components/shifts/form/ShiftBasicInfoSection.tsx` | 221 | Title (manual) + client + date + start/end + meeting time + slots. **Title is currently the lead field — exactly the regression we want to fix.** |
| `src/components/shifts/form/JobSiteSection.tsx` | 88 | `location_id` + `job_site_location_id` + special instructions. |
| `src/components/shifts/form/MeetingPointsSection.tsx` | 102 | `meeting_point` text + `meeting_point_location_id`. |
| `src/components/shifts/form/TeamSection.tsx` | 170 | Slots, claimable, picker, shift admin, driver. |
| `src/components/shifts/form/TransportationSection.tsx` | 171 | Transport, capacity, driver. |
| `src/components/shifts/form/PaySection.tsx` | 114 | Pay type + override. |
| `src/components/shifts/form/AdvancedDetailsSection.tsx` | 141 | Notes + attendance/clock + QR. |
| `src/components/shifts/form/ShiftSummaryPanel.tsx` | 242 | Right-rail summary with readiness flags. |
| `src/pages/admin/Shifts.tsx` | 2101 | Hosts both the in-page Create dialog (`CreateShiftDialog`, ~lines 100-240, 740-810) and Edit save path (~960-1010). Owns `publication_status`/`status` lifecycle and notification triggers. |
| `src/components/shifts/ShiftEditDialog.tsx` | 202 | Edit dialog wrapping `ShiftFormShell` + `ShiftFormFields`. |
| `src/components/shifts/QuickCreatePopover.tsx` | — | Calendar quick-create. Out of scope — keep. |
| `src/pages/admin/DailyOps.tsx` + `src/lib/operations/derive-shift-ops-state.ts` | — | Phase A shipped. Reused as-is for readiness preview. |

### Fields already on `scheduled_shifts` (verified usable, no migration)

`title, client_id, date, start_time, end_time, meeting_time, slots, location_id, job_site_location_id, meeting_point, meeting_point_location_id, notes, special_instructions, shift_admin_id, driver_employee_id, transport_required, claimable, publication_status (draft|published), status, attendance_mode, clock_method, qr_*`.

**All "pending state" UX can be derived purely from null/empty values on these columns.** No schema changes required for v1.

---

## 2. Proposed UX structure (desktop, ≥1024px)

Reuse `ShiftFormShell`. Replace the single form column (currently vertical stack) with a 3-column grid inside the existing left "form" pane, while keeping the existing right summary rail. Net layout:

```text
┌── Sticky header: chip(Cliente or "Cliente pendiente") · Date · Time · readiness pill ─── [Cancel] [Save draft] [Publish ▾] ──┐
│                                                                                                                              │
│  ┌─ Col 1: What & Where ────────┐  ┌─ Col 2: Team & Operations ─┐  ┌─ Col 3 (existing right rail) ──────┐                    │
│  │ ClientPicker (premium)       │  │ Slots                       │  │ Generated display name             │                    │
│  │ Date / Entrada / Termina     │  │ Assigned workers + recs     │  │ Readiness checklist (pending list) │                    │
│  │ Job site                     │  │ Claimable / open shift      │  │ Worker-visible preview card        │                    │
│  │ Meeting point + meeting_time │  │ Transport / driver          │  │ Daily Ops bucket + alert preview   │                    │
│  │ Worker-visible instructions  │  │ Operational responsible     │  │ Action group (draft / publish ▾)   │                    │
│  └──────────────────────────────┘  └─────────────────────────────┘  └────────────────────────────────────┘                    │
│                                                                                                                              │
│  Additional details (collapsed): internal label, advanced notes, QR/attendance overrides                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Below `lg`, fall back to the existing single-column stack (mobile parity preserved → Phase 6).

### Display name rule (no schema change)

Compute at render and on save into the existing `title` column ONLY when the user has not typed a manual title:

```text
display_name = [client.name] · [role/type or "Turno"] · [HH:mm]
```

If manual title is set, it wins and is shown as "Etiqueta interna" in the right rail. The manual `title` field moves to "Additional details" (collapsed by default).

### Pending information model (derived, no migration)

Pure helper `computeShiftPendingFlags(form)` returns:

```ts
{ client: bool, time: bool, jobSite: bool, meetingPoint: bool,
  team: bool, instructions: bool, driver: bool, admin: bool }
```

Each missing field → a `Cliente pendiente` / `Hora pendiente` / etc. badge in the right rail and (when published) on the worker-visible preview card.

### Publish actions

Replace the single primary button with a split menu:

- `Save draft` (existing path, `publication_status='draft'`).
- `Publish complete` (only enabled when no pending flags).
- `Publish with pending info` (always available; opens an `AlertDialog` confirm: "This shift will be visible to workers with pending details.").
- `Publish and notify team` (existing notify path; unchanged trigger logic).

All four routes call the **existing** save handlers in `Shifts.tsx`. No new RPC.

### Daily Ops readiness preview

Reuse `deriveShiftOpsState` from `src/lib/operations/derive-shift-ops-state.ts` with an empty assignments/entries slice for the in-progress draft to display the bucket pill + alert level the shift WILL have once saved. Pure function, payroll-safe.

---

## 3. Schema-free implementation map

New (additive) files:

```text
src/lib/shifts/pending-flags.ts                # computeShiftPendingFlags + label map (pure)
src/lib/shifts/display-name.ts                 # buildShiftDisplayName(client, form) (pure)
src/components/shifts/workspace/
  ShiftWorkspaceLayout.tsx                     # 3-col grid; uses ShiftFormShell as outer
  ShiftWorkspaceWhatWhere.tsx                  # col 1 — wraps existing BasicInfo+JobSite+MeetingPoints
  ShiftWorkspaceTeamOps.tsx                    # col 2 — wraps existing Team+Transportation
  ShiftWorkspaceLiveSummary.tsx                # col 3 — readiness, worker preview, ops bucket, actions
  ClientPickerPremium.tsx                      # combobox: search + recent + quick-create + "Cliente pendiente"
  PendingBadgeRow.tsx                          # renders pending flags as pastel chips
  WorkerPreviewCard.tsx                        # "What worker will see" mini card
  PublishMenu.tsx                              # split action menu + confirm dialog
```

Edited (surgical, no behavior change to save path):

- `src/components/shifts/ShiftFormFields.tsx` — add `layout?: "stack" | "workspace"` prop. Default keeps current stack. When `workspace`, render via `ShiftWorkspaceLayout` instead of vertical sections. Title field moved to `AdvancedDetailsSection` when in workspace mode.
- `src/components/shifts/ShiftEditDialog.tsx` — pass `layout="workspace"` on `lg+`.
- `src/pages/admin/Shifts.tsx` `CreateShiftDialog` — same flag. Wire `Publish ▾` menu to existing `handleCreateShift({ publishNow, skipNotifications })` paths.

Files **NOT to touch**:

- `src/lib/operations/derive-shift-ops-state.ts` (read only)
- `src/hooks/useTodayOperations.tsx`
- `src/pages/admin/DailyOps.tsx`, `TimeClock.tsx`, `ShiftOperations.tsx`, `Attendance.tsx`
- Any `time_entries`, payroll, RLS, notification edge function
- Worker portal (`src/pages/portal/*`)
- `Shifts.tsx` save/notify lifecycle (lines ~720-1170) — wire new buttons to existing handlers; no logic changes inside

---

## 4. Fields that would later need schema (NOT in v1)

Optional, deferred — only if product requires hard "pending" semantics on the row itself:

- `is_pending_info boolean default false`
- `pending_fields jsonb default '[]'` — explicit set instead of derived from nulls

v1 derives everything from null/empty, so these are optional follow-ups gated by a separate proposal.

---

## 5. Phase plan (each phase independently shippable, payroll-safe)

| Phase | Scope | DB | Notif |
|---|---|---|---|
| **1. Desktop visual workspace** | New `ShiftWorkspaceLayout` (3-col grid); `ShiftFormFields` gains `layout` prop; Create+Edit dialogs use it on `lg+`; title demoted to "Additional details" with auto-generated display name fallback. | none | none |
| **2. Pending info badges + worker preview** | `pending-flags.ts` + `PendingBadgeRow` in right rail; `WorkerPreviewCard` showing exactly what a worker would see (uses existing `ShiftRouteHeader` rules). | none | none |
| **3. Premium client selector** | `ClientPickerPremium` (Command/combobox): search by name+code, recent clients, quick-create (already supported via `onQuickAddClient`), explicit "Cliente pendiente" entry that sets `client_id=null`. | none | none |
| **4. Publish-with-pending flow** | `PublishMenu` split button + `AlertDialog` confirm. Wires to existing save handlers; only UX. | none | none (existing triggers only) |
| **5. Daily Ops readiness preview** | Right-rail card calls `deriveShiftOpsState(form, [], [])` to render bucket + alert level the shift will have. | none | none |
| **6. Mobile parity** | Map workspace columns to `MobileShiftOperationsSheet` accordion sections; preserve current single-column behavior under `lg`. | none | none |

---

## 6. Hard restrictions honored

- No payroll logic touched.
- Scheduled hours never converted to worked hours.
- `time_entries` untouched.
- Attendance untouched.
- No RLS edits.
- No new notifications; existing triggers unchanged.
- Worker portal unchanged.
- `/app/daily-ops`, `/app/shifts`, `/app/timeclock`, `/app/shift-operations`, Worker History v1, WR5/WR6/B4 not modified.

---

## 7. Open questions before Phase 1

1. Confirm `display_name` should be **persisted into `title`** when no manual title is set, vs **only computed at render** (safer; recommended). I'll default to render-only unless you say otherwise.
2. Confirm `Publish with pending info` should fire the standard published notifications, or a new "incomplete" worker copy. v1 default: same notifications, no copy change.
3. Approve consolidation of manual title into "Additional details > Internal label". 

Approve and I'll start Phase 1 only.
