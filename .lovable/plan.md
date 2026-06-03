# Shifts & Chips UX Overhaul — Phased Plan

Scope is large and touches the most regression-sensitive area of Stafly (shifts, assignments, transportation, publication, mobile admin, worker cards). Memory rules apply: **no payroll math, no time_entries writes, no RLS/auth/tenant changes, shift_code stays as internal ref only, scheduled hours are never payroll**. To keep risk low I'm proposing 5 phases. Please confirm scope before I start coding — I will implement **only the phases you approve**, in order.

---

## Phase A — Templates v2 + smart defaults (frontend-only)
Goal: operator creates a Friday/Saturday weekend job in <30s with sensible defaults.

- Extend `src/components/shifts/workspace/quick-templates.ts` with the 6 templates you listed:
  - `event_regular` (17:00 → 23:30, meeting -10 min)
  - `weekend_job` (09:00 start, meeting ~07:00, end optional, transport suggested ON)
  - `event_by_hour`, `event_by_day`, `setup`, `kitchen_floor_mixed`
- Each template can now patch a small additional safe set: `startTime`, `endTime`, `meetingTime`, `transportRequired`, plus the existing `title/slots/notes/specialInstructions/transportNotes`. Still "fill empty only" — never overwrites operator input.
- New `recommendation` field per template (e.g. "Llegar 10 min antes") shown as a soft hint in the form, not auto-written.
- `endTime` becomes optional in the UI only (DB column untouched). If empty: shows pill "Hora de salida pendiente" and shift can still be saved as draft / published with a clear warning.

No DB changes. No payroll impact. No edits to `useShiftsConfig` defaults.

---

## Phase B — Repeat / range creation preview
Goal: "Jun 5 → Jun 6" creates both, with a confirm step.

- Add a `RepeatRangePreview` step inside the create dialog: shows the N shifts that will be created, per-date conflicts (already a shift at same client/time), and per-date copy-assignments toggle.
- Reuse existing `bulk-import-shifts` / repeat helpers if present; otherwise create a thin client-side loop that calls the existing create RPC once per date (no new edge function, no new SQL).
- After save: toast "Se crearon 2 turnos · 6 asignaciones copiadas · 1 conflicto omitido" with deep-link to each.
- Audit: I'll first read the current repeat logic before touching anything (no blind rewrites).

---

## Phase C — Shift code de-emphasis + worker-first card
Memory rule already says shift_code is not the protagonist. Enforce it visually.

- Admin surfaces: `Ref #0258` chip, small, secondary (already partially via `formatShiftRef`). Sweep `ShiftDetailDialog`, list rows, mobile cards.
- Worker surfaces (`PortalShiftCard`, `PortalShiftDetail`, drawer, clock): hide `shift_code` entirely; order = client/event → date → start time (protagonist) → meeting point → transport → captain → role → instructions → Accept/Reject. Already aligned with [Work Route standard](mem://design/work-route-standard); this is the cleanup pass.
- No data model change.

---

## Phase D — Transportation v2 + multiple captains (UI-first, schema-honest)
- **Multiple captains/responsibles**: audit `scheduled_shifts` + `shift_assignments` to see if multi-admin is already representable (likely via `is_shift_admin` flag on assignments). If yes → just UI: a "Responsables" multi-picker in the form, badges in detail. If no → I will NOT add a column in this phase; instead deliver design + a single follow-up migration proposal for your approval.
- **Multiple drivers / vehicles**: same audit-first approach. Current `TransportationSection` is single-driver. I will extend the UI to list drivers + capacity per driver only if the schema supports it; otherwise document the limitation in the card ("1 conductor por turno — soporte multi-driver pendiente de aprobación de schema") instead of faking it.
- Add per-shift transport status pill: `pending` / `ready` derived from existing fields. No DB writes.

---

## Phase E — "Information pending" + mobile admin slim-down
- Add a `pendingInfo` derivation (work address, meeting point, end time, setup time, uniform) — pure computed badges. Saving/publishing with pending fields shows a confirm dialog: "Publicarás con información pendiente. Los workers verán etiquetas claras." Already partially supported; this is the polish pass.
- Mobile admin (`MobileShiftsView`, `MobileShiftOperationsSheet`): tighten to cards + 3 KPIs max, no charts, quick actions row (Publicar / Editar hora / Editar meeting / Asignar / Contactar / Guardar borrador). Use existing `MobileAdminModuleShell` + `MobileOperationsSheet` patterns.

---

## Explicitly NOT touching
- `time_entries`, `pay_periods`, `period_base_pay`, payroll reconciliation, payroll math, payments, bookings, chat, documents (beyond read), RLS, auth, tenants, edge functions, partner/campaign logic, kiosk, Connecteam import, Stafly Demo seeds.
- `shift_code` generation rule, `useShiftsConfig` defaults, `legacy shift number policy`.
- I will NOT add new DB columns without coming back for explicit approval (Phase D may surface a single proposal).

---

## QA per phase (frontend-only)
Desktop: create event_regular + weekend_job, repeat Fri/Sat with copy assignments, conflict case, multi-captain UI, transport pending vs ready, publish-with-pending warning.
Mobile (390x844): draft create, edit meeting point, publish with pending, long client name, many assignments, no chart regressions.
Regression: open existing shifts in Quality Staff + Stafly Demo, confirm shift_code still visible to admin, worker portal still works, payroll review queue untouched.

---

## Ask before I start
1. **Confirm phase order A → E**, or pick a subset (e.g. A+C+E first).
2. **Phase D schema question**: if the audit shows multi-driver / multi-captain need a new column, do you want me to (a) propose a migration and wait, or (b) ship UI-only with a documented limitation? Default: (a).
3. **Stafly Demo first?** Per the QA tenant mismatch memory, I'll do all live QA in Stafly Demo. Confirm OK.
