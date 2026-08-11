# P1 — STAFLY ONE DESIGN SYSTEM

**Fecha:** 2026-08-11
**Estado:** Fases 1–3 implementadas (infraestructura visual). Fase 4 en curso.
**Referencias canónicas:** Equipo (`admin/Employees.tsx`) y Clientes (`admin/Clients.tsx`).
**Alcance de esta entrega:** solo capa visual. Sin cambios en auth, payroll, reloj, RLS,
`time_entries`, `scheduled_shifts`, `shift_assignments`, documentos, portal, resolvers ni datos.

---

## Principio

Una sola experiencia adaptativa. No existe "versión desktop premium" y "versión móvil básica".
La jerarquía visual es idéntica en Desktop, iPad, iPhone y Android; **solo cambia el acomodo**.

---

## Fase 1 — Foundation (hecha)

Fuente única: `src/components/stafly-ui/tokens.ts`.

| Grupo | Token |
| --- | --- |
| Espaciado | `STAFLY_GUTTER`, `STAFLY_STACK`, `STAFLY_ROW_GAP`, `STAFLY_TAP_TARGET`, `STAFLY_PAGE_PX`, `STAFLY_BOTTOM_NAV_CLEARANCE` |
| Tipografía | `STAFLY_TEXT` (pageTitle, sectionTitle, cardTitle, body, meta, eyebrow, metric, mono) |
| Radios | `STAFLY_RADIUS` (chip, control, surface, overlay) |
| Sombras / elevación | `STAFLY_ELEVATION` (flat, raised, floating, overlay) |
| Superficies | `STAFLY_CARD_BASE`, `STAFLY_CARD_SOFT` |
| Colores / estados | `StaflyTone` (neutral, info, success, warning, critical, accent) + `STAFLY_TONE_SOFT`, `STAFLY_TONE_TEXT`, `STAFLY_TONE_DOT` |
| Interacción | `STAFLY_STATE` (interactive, focus, disabled, selected) |
| Badges y chips | `STAFLY_BADGE_BASE`, `STAFLY_CHIP_BASE` |

Regla dura: ningún color literal (`text-white`, `bg-[#...]`) en componentes. Todo pasa por tokens
semánticos definidos en `index.css` / `tailwind.config.ts`.

---

## Fase 2 — Componentes canónicos (hecha)

Todos exportados desde `@/components/stafly-ui`.

| Elemento | Componente canónico |
| --- | --- |
| Header de pantalla | `OperationalWorkspace` / `OperationalScreenHeader` |
| Section Header | `StaflySectionHeader` |
| Summary Header | `StaflySummaryStrip` |
| KPI Card | `StaflyKpiCard` |
| Entity Card | `entities/EntityCard` (planificación: `EntityRow`) |
| Status Badge / Chip | `StaflyStatusBadge` |
| Alert Banner | `StaflyAlertBanner` |
| Empty State | `StaflyEmptyState` |
| Loading State | `StaflyLoadingState` (cards · rows · metrics) |
| Search Bar | `StaflySearchBar` |
| Filter Bar | `StaflyFilterBar` |
| Action Bar | `StaflyActionBar` |
| Drawer / Sheet / Modal | `StaflyOverlay` (`variant="drawer" \| "sheet" \| "modal"`) |
| Timeline / Activity Feed | `StaflyTimeline` (`variant="timeline" \| "feed"`) |
| Superficie de contenido | `StaflyCard` |
| Shell de página (portal/móvil) | `StaflyPageShell` |

Nada más debe crear su propia versión de estos elementos.

---

## Fase 3 — Layout System (contrato)

La misma pantalla se resuelve con un único árbol:

```text
OperationalWorkspace
  ├── Header        (empresa → título → contexto → 1 acción protagonista)
  ├── Toolbar       (search + tabs)
  ├── Filters       (inline en desktop · bottom sheet en móvil, mismas opciones)
  ├── Summary       (StaflySummaryStrip: rejilla en desktop · scroll horizontal en móvil)
  ├── Content       (EntityCard / StaflyCard / tablas)
  └── Detail        (StaflyOverlay variant="drawer": panel derecho en desktop,
                     hoja inferior en móvil)
```

Móvil añade únicamente la navegación inferior existente. No se duplica el árbol por breakpoint.

---

## Fase 4 — Pantallas canónicas (orden de migración)

| # | Pantalla | Estado |
| --- | --- | --- |
| 1 | Workers | ✅ referencia |
| 2 | Clients | ✅ referencia |
| 3 | Worker Profile | pendiente |
| 4 | Client Profile | pendiente |
| 5 | Services | pendiente |
| 6 | Shift Detail | pendiente |
| 7 | Operations Center | pendiente |
| 8 | Live Map | pendiente |
| 9 | Documents | ✅ (revisión de badges) |
| 10 | Compliance | ✅ (revisión de badges) |
| 11 | Payroll | pendiente |
| 12 | Settings | pendiente |

Duplicados a eliminar al migrar sus consumidores: `MobileEntityCard`, `MobileSummaryStrip`,
`MobileAdminHeader`, `MobileAdminModuleShell`, `mobile-admin-tokens`, `MobileFilterPills`,
`premium-filter-bar`, `OpsToolbar`.

---

## Fase 5 — Visual Parity

Cada pantalla se valida en Desktop (1440), iPad (834), iPhone (393) y Android (412).
No se aprueba hasta que las cuatro comparten el mismo lenguaje visual.

## Fase 6 — UX Consistency

Botones, iconografía, spacing, navegación, drawers, sheets, cards, badges, timelines,
tablas, listas y filtros salen del inventario de Fase 2. Cualquier excepción se documenta aquí.

## Fase 7 — Certificación

Checklist por pantalla: Desktop · Tablet · Mobile · Dark Mode · Responsive · Accesibilidad
(tap targets ≥ 44px, foco visible, nombres accesibles) · Performance.

---

## Regla de ecosistema (obligatoria)

Antes de desarrollar cualquier pantalla nueva:

1. ¿Existe ya un componente canónico que resuelva esto?
2. ¿La experiencia será idéntica en Desktop y Mobile, adaptando solo el layout?
3. ¿Se integra al ecosistema o introduce otra variante visual?
4. ¿Mantiene coherencia con Workers y Clients?

Si alguna respuesta es "no", la implementación se detiene y se revisa.
