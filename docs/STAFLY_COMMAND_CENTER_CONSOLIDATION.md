# Stafly Command Center Consolidation — Sprint S1 (READ-ONLY)

**Date:** 2026-06-22
**Scope:** Frontend-only IA consolidation. No backend / RLS / payroll / schema changes.

## Goal
Unify the fragmented operational admin surfaces into a single canonical Command Center with tabs, reusing existing page components verbatim. No new queries, no new RPCs, no new sources of truth.

## Routes audited

| Route | Component | Status after S1 |
|---|---|---|
| `/app` | `Dashboard` (`AdminDashboard`) | Kept. Sidebar label changed to **Home**. |
| `/app/command-center` | `CommandCenter` | **Replaced** by new `CommandCenterHub` (tabbed shell). |
| `/app/command-center-classic` | `CommandCenter` | **New legacy alias** preserving original page for bookmarks/deep-links. |
| `/app/ops-center` | `OperationsCommandCenter` | Kept. Embedded into "En vivo" tab. Sidebar relabeled `Today's Operations (legacy)`. |
| `/app/daily-ops` | `DailyOps` | Kept. Embedded into "Hoy / Mañana" tab. |
| `/app/needs-attention` | `NeedsAttention` | Kept. Embedded into "Necesita atención" tab. |
| `/app/daily-close` | `DailyClose` | Kept. Embedded into "Cierre" tab. |
| `/app/payroll-review-queue` | `PayrollReviewQueue` | Kept. Embedded into "Listo para pago" tab. |
| `/app/live-map` | `LiveMap` | Kept. Linked from "En vivo" tab (not embedded — heavy map). |
| `/app/shift-ops` | `ShiftOperations` | Kept untouched (per-shift detail; reached from drawer). |
| `/app/dev-command-center` / `owner-command-center` | `DevCommandCenter` | Kept untouched. |
| `/app/migration` | `MigrationCommandCenter` | Kept untouched. |

## Canonical surface

`/app/command-center` → `src/pages/admin/CommandCenterHub.tsx`

Tabs (URL-driven via `?tab=…`, default `today`):

| Tab key | Label | Reused component | Legacy deep link |
|---|---|---|---|
| `today` | Hoy / Mañana | `DailyOps` | `/app/daily-ops` |
| `attention` | Necesita atención | `NeedsAttention` | `/app/needs-attention` |
| `live` | En vivo | `OperationsCommandCenter` + link card to `LiveMap` | `/app/ops-center`, `/app/live-map` |
| `close` | Cierre | `DailyClose` | `/app/daily-close` |
| `payroll` | Listo para pago | `PayrollReviewQueue` + payroll guardrail banner | `/app/payroll-review-queue` |

All tab content is lazy-loaded. Each tab also shows an "Abrir vista completa →" link to its legacy route so users keep the full-screen page when they need it.

## Navigation changes

`src/components/AdminSidebar.tsx`, Daily Operations group:

- `/app` → relabeled **Home** (was "Command Center").
- `/app/command-center` → **new** entry "Command Center" (canonical).
- `/app/ops-center` → relabeled **Today's Operations (legacy)** (kept for deep links / bookmarks).
- All other entries untouched.

No deletions. No permission changes. No role changes.

## Payroll guardrail

The "Listo para pago" tab renders an `Alert` above `PayrollReviewQueue`:

> **Validación operativa previa a payroll.** Payroll real sigue basado en Connecteam truth/reconciliation. Esta vista no calcula pago; no se usan `scheduled_shifts` como fuente de horas.

## What was NOT touched

- `auth`, `RLS`, `user_roles`, `has_role`, `has_company_role`, `canAccessAdminForCompany`, `useEffectiveEmployee`.
- Tenants / companies governance, `setup-company` edge function.
- `pay_periods`, `period_base_pay`, `payroll_adjustments`, `reconciliation_*`, `historical_payroll_entries`.
- `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`.
- `compensation_profiles`, `employee_financial_*`, `worker_consent_records`.
- Connecteam import/export pipeline.
- `notify_review_on_clockout`, payroll calculations, payroll exports.
- Worker portal, edge functions, storage policies.
- No SQL migrations, no new RPCs, no writes, no backfills, no new tables, no new edge functions.

## Files changed

- **NEW** `src/pages/admin/CommandCenterHub.tsx` — tabbed shell, lazy-loads existing pages.
- **EDIT** `src/App.tsx` — `/app/command-center` now mounts `CommandCenterHub`; `/app/command-center-classic` preserves the original `CommandCenter` page.
- **EDIT** `src/components/AdminSidebar.tsx` — relabeled `/app` → "Home", added canonical `/app/command-center` entry, relabeled `/app/ops-center` → "Today's Operations (legacy)".
- **NEW** `docs/STAFLY_COMMAND_CENTER_CONSOLIDATION.md` — this document.

## Risks

- **Bundle weight on `/app/command-center`**: tabs lazy-load, so only the active tab pulls its component. Other tabs idle until clicked.
- **DailyOps / NeedsAttention / OperationsCommandCenter / DailyClose / PayrollReviewQueue all assume they own page padding** — embedded inside `CommandCenterHub` they get slightly nested padding. Visual only; functional behavior unchanged.
- **`LiveMap` is intentionally not embedded** (Leaflet map heavy + presence subscriptions). Tab provides a card link to `/app/live-map` instead.
- **Sidebar label drift**: anyone with muscle memory for "Command Center" → `/app` now lands on `/app/command-center` (the new canonical). The old surface is still one click away via the "Home" entry.

## Sprint S2 recommendation

1. **Mobile polish**: dedicated mobile viewport switcher for `CommandCenterHub` (segmented control instead of tabs, suppress dense tables in `PayrollReviewQueue`, push to drawer).
2. **KPI strip** at the top of `CommandCenterHub` that reuses counts already computed by the embedded pages (no new queries) — surfaced via a lightweight shared context.
3. **Deep links from Shifts / Workers / Documents** into the correct tab (`/app/command-center?tab=attention`, etc.).
4. After 2 weeks of usage, evaluate retiring `/app/ops-center` from sidebar (route still mounted) and renaming `/app/command-center-classic` to `/app/legacy/command-center`.
5. **Do not** start a payroll-source switch sprint until Phase 20 Safety Rails (Needs-Attention queue, day-pay guard, open-clock alert, >16h alert, geofence monitor) are in place.
