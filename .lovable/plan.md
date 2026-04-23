

# Premium-Gold Retouch — Phased Plan

This is a large ecosystem-wide refactor. To avoid breaking the platform and to deliver real product value, I propose splitting it into **4 incremental iterations**. This plan covers **Iteration 1 (foundation + Workers hub)**, with the rest scoped for follow-ups so each iteration ships clean and verified.

---

## Iteration 1 — Visual Foundation + Workers Hub (this round)

The goal: build the design primitives once, then ship the most-used module (Workers) on top of them. Everything else reuses these primitives in later iterations.

### A. Design system primitives (new shared components)

Create a small set of premium-gold components in `src/components/ui/` that all modules will reuse:

1. **`PremiumAvatar`** — replaces ad-hoc avatar usage.
   - Real photo as protagonist when `avatar_url` exists.
   - Elegant initials fallback (deterministic neutral gradient, refined typography).
   - Status ring + corner badges (active, pending, new, missing-docs, driver).
   - Sizes: `xs / sm / md / lg / xl`.
   - Backwards-compatible wrapper around current `EmployeeAvatar` so nothing breaks.

2. **`PremiumFilterBar`** — unified filter pattern.
   - Search + quick filter chips + advanced popover + active-filter chips with × + reset + result counter + export button slot.
   - URL search-param persistence (opt-in via `paramKey`).
   - Built on existing `AdvancedFilters` + `DataTableToolbar`, doesn't replace them; offers the canonical premium combination.

3. **`PremiumTable`** — opinionated wrapper over current `Table`.
   - Sticky header, zebra-off, refined row hover/selected, right-aligned numerics, sort indicators, column-visibility hook.
   - Density toggle (comfortable / compact).

4. **`ViewSwitcher`** — table / cards / compact list toggle (icon segmented control).

5. **`PremiumPageHeader`** (light extension of existing `PageHeader`) — adds: breadcrumb slot, subtle eyebrow, primary action + overflow, optional KPI strip below.

6. **`SortIndicator` + `useSortPreference`** — consistent sort UI + per-module persisted sort.

No existing component is removed. New primitives live alongside current ones to keep the no-regression policy intact.

### B. Workers module (`/app/employees`) — premium hub

Refactor `src/pages/admin/Employees.tsx` rendering layer (no business-logic change, no schema change):

- **Header**: PremiumPageHeader with KPI strip (Total / Active / Pending activation / Missing documents / Drivers).
- **Tabs**: All · Active · Pending activation · New · Missing documents · Drivers · No recent activity · Payroll issues · Attendance issues. Counts shown inline.
- **PremiumFilterBar**: search, quick chips (status, worker_type, has_car), advanced (company, role, portal status, documents status, last activity range, borough, tags, source). URL-persisted.
- **ViewSwitcher**: Table / Cards / Compact list.
- **PremiumTable columns** (default visible, rest togglable): Avatar · Name · Code · Worker type · Status · Portal · Documents · Phone · Borough · Drives · Last activity · Next shift · Actions.
- **Card view**: photo-first card with status ring, key chips, quick actions (Call, WhatsApp, Open profile, Invite, Archive).
- **Avatars**: switch to `PremiumAvatar` everywhere in Workers.
- **Export filtered view**: CSV of currently filtered + visible columns (reuses `ReportActionsBar`).
- **Default sort**: alphabetical with persisted user override.

### C. Multi-tenant guardrails (touched files only)

While editing Workers and the new primitives, ensure every React Query key in those files includes `selectedCompanyId`. No global audit in this iteration — only files we open.

### D. Out of scope for Iteration 1 (planned for next iterations)

- **Iteration 2**: Apply primitives to **Shifts**, **Attendance**, **Payroll Periods/Reports**, **Documents**. Add Import wizard pattern (mapping → preview → validate → summary → retry) starting with Workers import.
- **Iteration 3**: Apply primitives to **Applications**, **Front Desk reports**, **Kiosk Devices**, **Service Requests**. Calendar/timeline view for Shifts.
- **Iteration 4**: Apply primitives to **Clients**, **Billing**, **Invoices**, **Parceros community/providers**. Navigation reorganization (Core Operations / Growth & Intake / Commercial / Community / Control) with sidebar group cleanup and removal of dead/redundant entries (e.g. duplicated `staffing-requests` vs `service-requests`, dual `payroll-recon` entries).

Navigation cleanup is deferred to Iteration 4 because reorganizing the sidebar globally before the modules behind it look premium would worsen perception, not improve it.

---

## Constraints honored

- No payroll calculations changed.
- No backend contracts/endpoints changed.
- No DB schema changes.
- No removal of existing components — new primitives live next to old ones.
- All current routes keep working.
- Tenant scoping reinforced only in files touched (avoiding the high-regression risk of a global sweep).

---

## Files to create (Iteration 1)

```text
src/components/ui/premium-avatar.tsx
src/components/ui/premium-filter-bar.tsx
src/components/ui/premium-table.tsx
src/components/ui/view-switcher.tsx
src/components/ui/premium-page-header.tsx
src/components/ui/sort-indicator.tsx
src/hooks/useSortPreference.ts
src/hooks/useUrlFilters.ts
```

## Files to modify (Iteration 1)

```text
src/pages/admin/Employees.tsx          (render layer + tabs + filters + views)
src/components/employee/*               (avatar usage swap to PremiumAvatar where safe)
```

---

## Deliverable for this round

A working `/app/employees` that feels premium-gold (header + KPIs + tabs + advanced filters + 3 views + photo-first cards + export), powered by reusable primitives that the next iterations will plug into Shifts, Attendance, Payroll, etc.

After you approve, I'll implement Iteration 1 and then ask you to validate before moving on to Iteration 2.

