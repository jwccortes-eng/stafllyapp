# STAFLY — Premium Navigation & App Shell Pass

UI-only. Sin cambios de backend, permisos, rutas ni lógica operativa.

## 1. Problemas encontrados (auditoría rápida)

| # | Problema | Dónde |
|---|----------|-------|
| 1 | Sidebar con 6 grupos y nombres mixtos EN/ES; sensación de listado infinito | `AdminSidebar.tsx` |
| 2 | Grupos huérfanos de 2 links ("Reports", "Communication", "Settings") | `AdminSidebar.tsx` |
| 3 | Gutters inconsistentes (`p-3 sm:p-4 lg:p-6 xl:p-8`) y contenido pegado al borde en tablet | `AdminLayout.tsx` |
| 4 | Mobile usaba `p-4` fijo, distinto del shell desktop | `AdminLayout.tsx` |
| 5 | Sidebar expandida a 256px, fuera de la escala objetivo (~240px) | `AdminSidebar.tsx` / `TopBar.tsx` |
| 6 | Escala de espaciado no tokenizada: cada pantalla inventaba márgenes | global |

## 2. Navegación antes / después

**Antes (desktop):** Daily Operations · Team · Clients & Locations · Payroll & Finance · Communication · Settings.

**Después (desktop):**

```text
OPERACIÓN     Ops Cockpit · Home · Command Center · Shifts · Import Services
              Time Clock · Attendance · Live Map · Front Desk
PERSONAS      Team · Documents · Document Inbox · Compliance · Applications
              Referrals · Invitations · Requests
CLIENTES      Clients · Locations · Service Requests · Billing Clients · Service Blocks
PAYROLL       Validation Center · Periods · Compensation · Adjustments · Advances
              Concepts · Reconciliation · Weekly Recon. · Invoices · Reports · Import History
EMPRESA       Announcements · Messages · Notifications · Reviews · Payroll Settings
              Kiosk · Administration · Migration (internal)
```

Global mode: `Plataforma` + `Empresa`.

**Mobile:** sin cambios de patrón — ya existía navegación propia (no sidebar comprimida):
`AdminBottomNav` con 5 destinos (Ops · Shifts · Time · Workers · Más) + `MoreSheet` agrupado, safe-area y targets ≥44px.

## 3. Componentes reutilizados

`AdminLayout`, `AdminSidebar`, `TopBar`, `AdminBottomNav`, `MoreSheet`,
`ContextSwitcher`, `OperationalScreenHeader`, `StaflyPageShell`.

## 4. Componentes consolidados / nuevos

- **Nuevo:** `src/lib/ux/shell-spacing.ts` — escala única 4·8·12·16·24·32·48,
  `SHELL_GUTTER_X`, `SHELL_BLOCK_GAP`, `SHELL_CARD_PADDING`, anchos de sidebar.
- **Consolidado:** grupos huérfanos de la sidebar (Reports → Payroll, Communication + Settings → Empresa).
- **Consolidado:** gutters del shell mobile y desktop ahora comparten `SHELL_GUTTER_X`.

## 5. Mobile

- Gutter 16px consistente con el shell.
- Bottom nav de 5 tabs + hoja "Más"; sin sidebar desktop comprimida.
- Safe-area inferior y superior preservadas.

## 6. Desktop

- Sidebar 240px expandida / 68px colapsada, con tooltips en colapsada y preferencia persistida (`sidebar-collapsed`).
- Gutters 16 / 20 / 24 / 32 según breakpoint; ritmo vertical 24→32.
- Sólo el grupo activo se abre automáticamente; el resto queda plegado.

## 7. Screenshots

`/tmp/browser/shell/desk.png` — shell 1440px con sidebar expandida y grupos nuevos.

## 8. Regresiones

Ninguna detectada. Typecheck limpio. Rutas, módulos, badges y gating por rol idénticos:
sólo cambió el campo `section` de cada link y el orden de grupos.

## 9. Qué NO se tocó

auth · RLS · tenants · payroll · time_entries · snapshots · shift_assignments ·
scheduled_shifts · documents · payments · bookings · chat · ECC · ELDM · VWC ·
edge functions · Smart Intake pipeline · Connecteam adapter · roles/permisos · schema DB.
