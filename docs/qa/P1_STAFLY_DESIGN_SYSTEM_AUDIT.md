# P1 — STAFLY DESIGN SYSTEM AUDIT

**Fecha:** 2026-08-11
**Alcance:** auditoría de sistema visual. **Sin cambios de implementación.**
**Referencia canónica:** `Equipo` (`src/pages/admin/Employees.tsx`) y `Clientes` (`src/pages/admin/Clients.tsx`).

---

## 0. Definición del sistema canónico

Una pantalla se considera **✅ Nuevo sistema** cuando construye su árbol con:

| Elemento | Componente canónico |
| --- | --- |
| Shell + Header + KPIs + Search + Tabs + Filtros | `stafly-ui/OperationalWorkspace` |
| Header simple (sin workspace) | `stafly-ui/OperationalScreenHeader` |
| Shell de página móvil/portal | `stafly-ui/StaflyPageShell` |
| Superficie de contenido | `stafly-ui/StaflyCard` + `StaflySectionHeader` |
| Persona / Cliente / Venue / Partner | `entities/EntityCard` (planificación: `EntityRow`) |
| Chips y badges | `ENTITY_BADGE_CLASSES` + `sortEntityBadges` |
| Tokens de ritmo, superficie, tipografía | `stafly-ui/tokens.ts` |

Y **no** introduce cabeceras, tarjetas de entidad, strips de KPI ni barras de filtro propias.

Reglas duras confirmadas en código:
- Una sola cabecera por pantalla.
- Ninguna tarjeta nueva para personas/clientes/lugares/partners.
- Sin colores literales (`text-white`, `bg-[#...]`) en componentes.

---

## 1. Inventario completo

| # | Pantalla | Ruta / archivo | Estado | Componentes reutilizados | Componentes legacy | Esfuerzo | Riesgo | Prioridad |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Equipo | `admin/Employees.tsx` | ✅ | OperationalWorkspace, EntityCard, PremiumFilterBar, tokens | 2 `<Card>` residuales en bloques de calidad de datos | XS | Bajo | Referencia |
| 2 | Clientes | `admin/Clients.tsx` | ✅ | OperationalWorkspace, ClientDirectoryCard (basada en EntityCard), Tabs | — | XS | Bajo | Referencia |
| 3 | Servicios | `admin/Shifts.tsx` | 🟡 | OperationalWorkspace, OpsToolbar | `OpsToolbar` duplica el slot de filtros del Workspace; vistas de calendario con tarjetas propias (`ServiceEventCard`, `WeekByJobView`, `WeekByEmployeeView`) | L (3.351 L) | Medio | P0 |
| 4 | Servicios (móvil) | `admin/MobileShiftsView.tsx` | 🟡 | EntityCard parcial, client accent | Header y bottom sheet propios, chips locales | M | Medio | P0 |
| 5 | Operaciones (turno) | `admin/ShiftOperations.tsx` | 🔴 | ninguno canónico | Layout, cabecera, tarjetas y estados propios (1.110 L) | L | **Alto** (ruta operativa viva) | P0 |
| 6 | Operations Command Center | `admin/OperationsCommandCenter.tsx` | 🔴 | Tabs shadcn crudos | Cabecera propia, sin Workspace, sin KPIs canónicos | L | Medio | P1 |
| 7 | Postulaciones | `admin/Applications.tsx` | 🟡 | OperationalWorkspace, Tabs | Filas de candidato propias en lugar de `EntityCard` | M | Bajo | P1 |
| 8 | Documentos | `admin/DocumentsCenter.tsx` | ✅ | OperationalWorkspace, EntityCard | — | XS | Bajo | — |
| 9 | Recepción documental | `admin/DocumentIntakeCenter.tsx` | ✅ | OperationalWorkspace | — | XS | Bajo | — |
| 10 | Cumplimiento | `admin/ComplianceCenter.tsx` | ✅ | OperationalWorkspace | 1 `<Card>` informativa | XS | Bajo | — |
| 11 | Recepción (Front Desk) | `admin/FrontDeskHub.tsx` | 🔴 | shadcn Card/Tabs/Skeleton | 8 `<Card>`, 11 `<Tabs>`, skeletons propios, sin header canónico | M | Medio | P1 |
| 12 | Mapa | `admin/LiveMap.tsx` | 🔴 | ninguno | 4 `<Card>`, chrome propio, bifurcación `useIsMobile` | M | Medio | P2 |
| 13 | Time Clock (admin) | `admin/TimeClock.tsx` | 🟡 | OperationalScreenHeader | Sin Workspace: KPIs/filtros propios; vista móvil separada (`MobileTimeClockView`) | S | **Alto** (fichaje) | P1 |
| 14 | Asistencia | `admin/Attendance.tsx` | 🟡 | OperationalWorkspace, EntityCard | 5 `<Card>` de resumen fuera del strip de KPIs | S | Medio | P1 |
| 15 | Payroll — Review Queue | `admin/PayrollReviewQueue.tsx` | 🔴 | OperationalScreenHeader (solo header) | 20 `<Card>`, filtros y KPIs propios | L | **Alto** (nómina) | P1 |
| 16 | Payroll — Period Summary | `admin/PeriodSummary.tsx` | 🔴 | — | 16 `<Card>`, 6 `<Tabs>`, vista móvil separada (`MobilePeriodSummaryView`) | L | Alto | P2 |
| 17 | Payroll — Pay Periods / Settings / Mappings | `admin/PayPeriods.tsx`, `PayrollSettings.tsx`, `PayrollMappings.tsx` | 🔴 | — | Formularios y cards legacy | M c/u | Medio | P2 |
| 18 | Centro de Validación | `admin/ValidationCenter.tsx` | 🟡 | Header canónico | Listas propias | M | Alto | P1 |
| 19 | Invitaciones | `admin/InviteEmployees.tsx` | ✅ | OperationalWorkspace, EntityCard | — | XS | Bajo | — |
| 20 | Notificaciones | `admin/Notifications.tsx` | 🔴 | ninguno | Layout y listas propias | S | Bajo | P2 |
| 21 | Configuración de empresa | `admin/CompanyConfig.tsx` | 🔴 | — | 10 `<Card>`, secciones sin `StaflySectionHeader` | M | Bajo | P2 |
| 22 | Ubicaciones | `admin/Locations.tsx` | ✅ | OperationalWorkspace | Falta `EntityCard` para venues | XS | Bajo | P2 |
| 23 | Solicitudes | `admin/Requests.tsx` | ✅ | OperationalWorkspace | — | XS | Bajo | — |
| 24 | Calidad de identidad | `admin/IdentityQuality.tsx` | 🟡 | OperationalWorkspace, EntityCard | 4 `<Card>` + tabs anidados | S | Bajo | P2 |
| 25 | Referidos | `admin/Referrals.tsx` | ✅ | OperationalWorkspace, EntityCard | — | XS | Bajo | — |
| 26 | Portal Admin (home móvil) | `admin/MobileAdminHome.tsx` | 🔴 | tokens móviles deprecados | `mobile-admin-tokens`, cards propias | M | Medio | P1 |
| 27 | Portal Worker — Anuncios | `portal/MyAnnouncements.tsx` | ✅ | StaflyPageShell, StaflyCard | — | XS | Bajo | — |
| 28 | Portal Worker — Recursos | `portal/PortalResources.tsx` | ✅ | StaflyPageShell, StaflyCard | — | XS | Bajo | — |
| 29 | Portal Worker — Home | `portal/EmployeeDashboard.tsx` | 🔴 | ninguno | Shell, cards y estados propios | M | Alto | P1 |
| 30 | Portal Worker — Mis turnos | `portal/MyShifts.tsx` | 🔴 | Skeleton shadcn | Cards y filtros propios (848 L) | M | Medio | P1 |
| 31 | Portal Worker — Reloj | `portal/PortalClock.tsx` | 🔴 | ninguno | 1.497 L de chrome propio | L | **Alto** (fichaje) | P2 (congelado) |
| 32 | Portal Worker — Pagos / Reportes / Acumulado | `portal/MyPayments.tsx`, `PayReports.tsx`, `Accumulated.tsx`, `PayStub.tsx` | 🔴 | — | Cards y tablas propias | L | Alto (payroll) | P2 |
| 33 | Portal Worker — Documentos / W9 / Perfil / Disponibilidad | `portal/MyDocuments.tsx`, `MyW9.tsx`, `PortalProfile.tsx`, `MyAvailability.tsx`, `CompleteProfile.tsx` | 🔴 | — | Cards y formularios propios | M c/u | Bajo | P2 |
| 34 | Portal Worker — Detalle de turno / Captain Room / Chat | `portal/PortalShiftDetail.tsx`, `ShiftCaptainRoom.tsx`, `PortalChat.tsx` | 🔴 | — | Chrome propio | M | Medio | P2 |
| 35 | Portal Worker — Update Center / Semana / Integraciones | `portal/UpdateCenter.tsx`, `WeekDetail.tsx`, `Integrations.tsx` | 🔴 | — | Cards legacy | S | Bajo | P3 |

**Resumen:** 10 ✅ · 8 🟡 · 17+ 🔴 (agrupando familias). El bloque Payroll + Portal Worker concentra la mayor deuda.

---

## 2. Pantallas ya en el nuevo sistema

Equipo, Clientes, Documentos, Recepción documental, Cumplimiento, Invitaciones, Ubicaciones, Solicitudes, Referidos, Portal Worker (Anuncios, Recursos).

Estas son el patrón de copia: `OperationalWorkspace` en admin, `StaflyPageShell` + `StaflyCard` en portal.

---

## 3. Pantallas legacy (rojo) — orden de daño visual

1. `ShiftOperations` — es la pantalla operativa más visitada y no comparte ni una pieza canónica.
2. `PayrollReviewQueue` y `PeriodSummary` — 36 `<Card>` entre ambas.
3. `EmployeeDashboard` y `MyShifts` — primera impresión del trabajador.
4. `FrontDeskHub`, `LiveMap`, `OperationsCommandCenter`.
5. `MobileAdminHome` (tokens deprecados).
6. `CompanyConfig`, `Notifications`, resto del portal.

---

## 4. Componentes duplicados

| Canónico | Duplicado(s) | Nota |
| --- | --- | --- |
| `entities/EntityCard` | `admin/mobile/MobileEntityCard.tsx` | Segunda tarjeta de entidad sólo para móvil. Contradice la regla de árbol único. |
| `entities/EntityCard` | `clients/ClientDirectoryCard.tsx` | Envuelve EntityCard; aceptable como presenter, pero duplica lógica de badges. |
| `OperationalWorkspace` (KPIs) | `admin/mobile/MobileSummaryStrip.tsx` | Segundo strip de métricas con tokens propios. |
| `OperationalScreenHeader` | `admin/mobile/MobileAdminHeader.tsx`, `ShiftRouteHeader.tsx` | Tres cabeceras vivas. |
| `StaflyPageShell` | `admin/mobile/MobileAdminModuleShell.tsx` | Dos shells con lógica de safe-area distinta. |
| Filtros del Workspace | `ui/premium-filter-bar.tsx`, `operations/OpsToolbar.tsx`, `admin/mobile/MobileFilterPills.tsx` | Tres barras de filtro. |
| Bottom sheets | `MobileOperationsSheet`, `MobileQueueDrawer` + sheets ad-hoc en `MobileShiftsView` | Sin contrato único de sheet. |
| Tokens | `admin/mobile/mobile-admin-tokens.ts`, `ocs/tokens.ts`, `ux/shell-spacing.ts` vs `stafly-ui/tokens.ts` | Cuatro escalas de espaciado. |
| Timeline | `mobile-agenda/OperationalTimeline` | Sólo usado en móvil; debe absorberse en OCS. |

---

## 5. Componentes que deben eliminarse (tras migrar sus consumidores)

- `src/components/admin/mobile/MobileEntityCard.tsx`
- `src/components/admin/mobile/MobileSummaryStrip.tsx`
- `src/components/admin/mobile/MobileAdminHeader.tsx`
- `src/components/admin/mobile/MobileAdminModuleShell.tsx`
- `src/components/admin/mobile/mobile-admin-tokens.ts` (ya marcado `@deprecated`)
- `src/components/ui/premium-filter-bar.tsx` (absorber en el slot de filtros del Workspace)
- `src/components/operations/OpsToolbar.tsx`
- `src/lib/ux/shell-spacing.ts` (fusionar en `stafly-ui/tokens.ts`)
- Vistas móviles paralelas: `MobileTimeClockView.tsx`, `MobilePeriodSummaryView.tsx`, `MobileShiftsView.tsx` (una vez que la pantalla base sea responsive)

---

## 6. Roadmap de migración

**Bloque 0 — Cerrar el sistema (habilitador, sin pantallas)**
Consolidar tokens en `stafly-ui/tokens.ts`; añadir al Workspace los slots que hoy faltan: `sheet`, `drawer`, `detailPanel`, `emptyState`, `loadingState`. Sin esto, cada migración vuelve a inventar.

**Bloque 1 — Operación (P0)**
`ShiftOperations` → `MobileShiftsView` fusionado en `Shifts` → `OperationsCommandCenter`.

**Bloque 2 — Verdad operativa (P1)**
`TimeClock` (+ absorber `MobileTimeClockView`) → `Attendance` → `ValidationCenter` → `Applications`.

**Bloque 3 — Portal Worker (P1)**
`EmployeeDashboard` → `MyShifts` → `PortalShiftDetail` → resto del portal. `PortalClock` al final por riesgo de fichaje.

**Bloque 4 — Payroll (P2)**
`PayrollReviewQueue` → `PeriodSummary` (+ absorber `MobilePeriodSummaryView`) → `PayPeriods` / `PayrollSettings` / `PayrollMappings`.

**Bloque 5 — Periféricas (P2/P3)**
`FrontDeskHub`, `LiveMap`, `MobileAdminHome`, `CompanyConfig`, `Notifications`, `IdentityQuality`, `Locations`.

**Bloque 6 — Borrado**
Eliminar la lista de la sección 5 y añadir regla de lint que prohíba `<Card>` shadcn crudo y cabeceras propias en `src/pages`.

Cada bloque cierra con: menos archivos que al empezar, cero componentes nuevos de entidad, y captura en móvil + escritorio.

---

## 7. Orden recomendado

```
Bloque 0  Tokens + slots del Workspace
Bloque 1  ShiftOperations · Shifts/MobileShiftsView · OperationsCommandCenter
Bloque 2  TimeClock · Attendance · ValidationCenter · Applications
Bloque 3  EmployeeDashboard · MyShifts · PortalShiftDetail · portal restante
Bloque 4  PayrollReviewQueue · PeriodSummary · configuración de payroll
Bloque 5  FrontDesk · Mapa · MobileAdminHome · CompanyConfig · Notificaciones
Bloque 6  Borrado de duplicados + lint de contención
```

**Restricciones respetadas:** no se tocó auth, RLS, payroll, clock, portal, identity, `scheduled_shifts`, `time_entries`, chat, bookings, pagos ni datos reales. Este documento es sólo inventario.
