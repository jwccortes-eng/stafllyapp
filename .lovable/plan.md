# StaflyCore Admin IA + Desktop Premium Cleanup v1

UI-only sprint. Zero backend, RLS, payroll, time_entries, scheduled_shifts, shift_assignments, edge function, schema, or notification changes. All existing routes preserved — only sidebar grouping, labels, and desktop density change.

## 1. Sidebar IA refactor (`src/components/navigation/nav-items.ts` + AdminSidebar)

Replace current ad-hoc `section` strings with 6 canonical groups, in order:

```text
A. Operación diaria   → Centro de mando, Operación (ops-center), Turnos, Asistencia, Reloj, Live Map, Front Desk, Staffing Center, Command Center
B. Equipo             → Equipo (workers), Directorio, Documentos, Aplicaciones, Invitaciones, Solicitudes (tickets/service-requests/staffing-requests)
C. Clientes y lugares → Clientes, Ubicaciones, Service Categories
D. Payroll & Finanzas → Compensación, Periodos, Import, Ajustes, Avances, Conceptos, Reconciliación, Pilot Close, Adopción Comp., Review Queue, Reportes, Facturas, W-9, 1099, Payroll Settings, Comparison
E. Comunicación       → Anuncios, Chat, Notificaciones, AI Workforce, Leaderboard
F. Sistema            → Configuración, Administración, Migración, Control Tower, Kiosk
```

Every existing nav id keeps its `to` route. Only `section` + `label` change. `roles` gates unchanged. `module` gates unchanged.

Group A stays expanded by default. Groups B–F collapsible, defaulting to collapsed on first paint when sidebar is large enough; group containing active route auto-expands (existing pattern in AdminSidebar). If AdminSidebar does not currently support collapsible groups by `section`, add minimal Collapsible wrapper around each section block — purely presentational state, no persistence change required (optional localStorage `stafly:sidebar:section:{name}` boolean).

## 2. Spanish-first labels

Quality Staff and all admin tenants get Spanish labels per user list:
Dashboard→Centro de mando, Operations→Operación, Scheduling→Turnos, Workers→Equipo, Attendance→Asistencia, Time Clock→Reloj, Documents→Documentos, Applications→Aplicaciones, Invitations→Invitaciones, Worker Requests→Solicitudes, Compensation→Compensación, Reconciliation→Reconciliación, Reports→Reportes, Invoices→Facturas, Settings→Configuración, Administration→Administración. Worker portal labels untouched (portal stays as-is). Memory note: Core says English UI standard — this batch overrides for admin sidebar copy only; portal/kiosk untouched. Will update mem://style/language-standard-english to note admin sidebar Spanish exception.

## 3. Desktop density polish (low-risk, surgical)

Only touch presentational shells, not feature components:

- `src/layouts/AdminLayout.tsx` (or equivalent main wrapper): raise content `max-w` cap on ≥1280px from current value to `max-w-[1600px]`, tighten top padding from `py-8` → `py-5` on desktop, keep mobile spacing unchanged.
- `src/components/ui/page-header.tsx`: reduce `mb-6` → `mb-4` on md+; no API change.
- Dashboard (`/app` desktop variant `AdminDashboardDesktop` if present): no widget changes, only verify spacing tokens and remove redundant empty-state hero cards by gating them on data.length===0 with a slim inline empty hint instead of large card. Skip if any risk of touching data hooks.

Out of scope: Workers table redesign (deferred to next batch per user), shift cards, payroll surfaces, portal.

## 4. Dashboard focus (read-only verification)

No data hook changes. Only reorder existing KPI/action panels on desktop so "Needs attention today" + "Scheduled" + "Pending" appear above fold. If AdminDashboardDesktop already renders these, just confirm ordering and adjust grid spans. No new queries, no new widgets.

## 5. QA pass

Manual checklist run by user on:
- Desktop 1280: /app, /app/employees, /app/shifts, /app/attendance, /app/timeclock, /app/ops-center
- Mobile 390: drawer opens, no horizontal overflow
- Every sidebar link routes (smoke-click)
- Console clean
- Confirm: no RLS, no migrations, no edge function, no payroll math touched

## Files to change

1. `src/components/navigation/nav-items.ts` — regroup + relabel (only `section` and `label` fields)
2. `src/components/navigation/AdminSidebar.tsx` (read first; add collapsible group wrapper if needed)
3. `src/layouts/AdminLayout.tsx` (read first; widen max-w + tighten desktop padding)
4. `src/components/ui/page-header.tsx` — tighten desktop bottom margin
5. `mem://style/language-standard-english` — note admin sidebar Spanish exception
6. `mem://index.md` — add memory entry for this batch

## Explicit non-goals

- Not touching: useAuth, RLS, payroll, time_entries, scheduled_shifts, shift_assignments, edge functions, migrations, worker portal, notifications, compensation logic, queries.
- Not redesigning: workers table, shift cards, portal, kiosk.
- Not adding: new charts, new widgets, new routes, new modules.

## Risk

Low. All edits are presentational. Only risk is breaking a sidebar route if a `to` value is accidentally mutated — mitigated by only touching `section` and `label` fields in nav-items, plus smoke QA on every link.

Ready to implement on approval.