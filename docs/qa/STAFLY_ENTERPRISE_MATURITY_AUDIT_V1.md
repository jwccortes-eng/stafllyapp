# STAFLY — AUDITORÍA DE MADUREZ ENTERPRISE V1

Auditoría de solo lectura. **No se modificó código, datos, RLS, payroll ni lógica de negocio.**
Toda afirmación va con evidencia `archivo:línea` o conteo reproducible.

Pregunta que responde el informe: **¿Stafly ya se comporta como un sistema
operativo enterprise, o todavía es un conjunto de pantallas que comparten
login?**

---

## 0. Veredicto

**Stafly tiene un sistema operativo enterprise en su núcleo, pero todavía no lo
ha impuesto sobre su superficie.**

El núcleo existe y es serio: contratos canónicos (VWC, Single Service State,
Assignable Workers, Client Truth), un design system real (`EntityCard`,
`EntityRow`, `ServiceEventCard`, `OperationalWorkspace`) y un lexicón oficial.
El problema no es de diseño: es de **cobertura**. El estándar está adoptado en
4–9 pantallas de un total de 123 páginas admin y 196 rutas.

| Dimensión | Estado | Evidencia dura |
| --- | --- | --- |
| Núcleo de contratos (escritura, estado, identidad) | **Enterprise** | VWC, Single Service State, Client Truth, Assignable Workers |
| Design system (existencia) | **Enterprise** | `EntityCard`, `EntityRow`, `ServiceEventCard`, `ClientIdentityPack` |
| Design system (adopción) | **Fragmentado** | `OperationalWorkspace` en 4 páginas; `PageHeader` legacy en 85 |
| Lenguaje de producto | **Fragmentado** | Lexicón importado por 15 archivos; "Turno" en admin en ≥8 páginas |
| Calendarios | **Casi enterprise** | 4 de 6 vistas cumplen "un Servicio = una card" |
| Viewport operativo | **Aceptable, no óptimo** | 206–260 px de cromo antes del contenido |
| Mobile | **Duplicado** | 21 componentes mobile dedicados + 13 páginas con rama `useIsMobile()` |
| Higiene del repo | **Con deuda** | 19 archivos sin consumidores; 111 colores hardcodeados |

Escala de magnitud del sistema: **1.215 archivos** TS/TSX, **196 rutas**,
**123 páginas admin**, **232.088 líneas** en componentes/páginas.

---

## 1. Design System — existe, pero convive con tres sistemas paralelos

### 1.1 Adopción canónica real

| Componente | Consumidores |
| --- | --- |
| `EntityCard` | 5 (`Employees.tsx:1865`, `IdentityQuality.tsx:110`, `ClientDirectoryCard.tsx:57`, `EmployeeCombobox.tsx:784`, `PremiumClientSelector.tsx:221`) |
| `EntityRow` | 3 archivos (`ClientView.tsx:72`, `WeekByJobView.tsx:164`, `WeekByEmployeeView.tsx:159,246`) |
| `ClientIdentityPack` | 2 (`ShiftDetailDialog.tsx:783`, `ClientProfile.tsx:108`) |
| `ServiceEventCard` | 4 vistas de calendario |
| `OperationalWorkspace` | **4 páginas** (`Shifts`, `Employees`, `Clients`, `IdentityQuality`) |
| `OperationalScreenHeader` | 9 páginas (5 directas + adaptadores) |
| `EntityPassport` | **No existe.** Solo mencionado como intención en `ServiceEventCard.tsx:8` |

### 1.2 Sistemas paralelos activos

1. **OCS** (`src/components/ocs/*`): 9 componentes (`WorkerCard`, `TeamCard`,
   `ShiftCard`, `ValidationCard`, `KpiCard`…) que representan personas y turnos
   **sin pasar por `EntityCard`**. Consumido por Today Hub, Validation Center,
   Mobile Team Hub.
2. **Legacy header**: `PageHeader` importado por **85 páginas admin** + 5 del
   portal. Aunque hoy delega en `OperationalScreenHeader`
   (`page-header.tsx:37`), sigue siendo una API paralela con su propia forma.
3. **Tarjetas de turno duplicadas**: `shifts/ShiftCard.tsx`,
   `operations/OpsShiftCard.tsx`, `portal/PortalShiftCard.tsx`,
   `dashboard/MyShiftCard.tsx` (huérfano), más **4 `ShiftCard` redefinidos
   localmente dentro de páginas** (`MyPayments.tsx:956`, `Today.tsx:62`,
   `StaffingCenter.tsx:179`, `OperationsCommandCenter.tsx:821`).
4. **KPI**: 8 implementaciones distintas, incluidas **4 copias locales**
   (`WorkerDuplicates.tsx:1023`, `AssignmentOverrides.tsx:712`,
   `FrontDeskReports.tsx:297`, `PayReports.tsx:469`).
5. **Identidad visual**: 5 primitivas de avatar paralelas
   (`premium-avatar`, `employee-avatar`, `employee-avatar-group`,
   `client-avatar`, `entities/ClientAvatar`) + `AvatarFallback` inline en 26
   archivos.

**Conclusión.** `docs/DESIGN_SYSTEM_ENTITIES.md` declara la regla dura "no se
crea ninguna tarjeta nueva para representar personas, clientes, lugares o
partners". La regla **no está enforced**: OCS y las variantes de `ShiftCard` la
incumplen hoy en producción.

### 1.3 Tokens de color

111 ocurrencias de color hardcodeado fuera de tokens: `text-white` (85),
`bg-black` (12, de los cuales 4 son overlays legítimos de shadcn), `bg-[#…]`
(6), `text-[#…]` (8). El grupo `#25D366` (14 ocurrencias, verde WhatsApp) es
coherente y debería ser un token, no un literal.

---

## 2. Lenguaje de producto — el lexicón existe y no se usa

- El lexicón oficial es `src/lib/ox/lexicon.ts:14-17`: **admin dice "Servicio";
  worker y payroll dicen "Turno"**. Su propio encabezado (`:20-24`) declara que
  "ninguna pantalla debe volver a escribir estas palabras a mano".
- **Solo 15 archivos importan `ADMIN_LEX` / `lexicon()`.** El resto escribe el
  copy a mano.
- `src/lib/shifts/lexicon.ts` **no existe** — la memoria del proyecto lo
  referencia; la fuente única real es únicamente `ox/lexicon.ts`.

### Contradicciones en superficie admin (deberían decir "Servicio")

`Shifts.tsx:1363,1467,1568,1712,1782,3120` ("Turno no encontrado", "Turno
publicado", "Turno actualizado", "Turno eliminado"), `Attendance.tsx:687,815`,
`UnpaidShiftsReport.tsx:324,350,426`, `BulkImportShifts.tsx:315,417`,
`DiscrepancyReport.tsx:556`, `ImportWizard.tsx:1635`, `Dashboard.tsx:987`.
Incluso el formulario canónico mezcla ambos dentro del mismo archivo:
`ShiftBasicInfoSection.tsx:54,58` dice "turno" en pantalla admin.

### Persona: cuatro nombres para la misma entidad

Conteos en `src/pages` + `src/components`: **Worker 980 · Empleado 189 ·
Staff 126 · Trabajador 33**. Ejemplos: `Movements.tsx:404` "Empleado" vs
`Today.tsx:166` "Trabajador" vs `ShiftOperations.tsx:127` `label: "Staff"` vs
`DocumentsCenter.tsx:178` fallback literal `"Worker"` en una app en español. El
ítem de menú se llama `"Workers"` (`nav-items.ts:52`) apuntando a
`/app/employees`.

### Lugar: cuatro nombres

**Location 778 · Venue 47 · Ubicación 43 · Lugar 24**. `Shifts.tsx:133` mapea
`location_id → "Ubicación"`, mientras `JobSiteSection.tsx:57` lo llama "Dónde se
realizará el trabajo" y el código lo llama "Job Site".

**Esto es el síntoma más claro de "pantallas que comparten login":** un mismo
objeto de negocio tiene cuatro nombres según quién escribió la pantalla.

---

## 3. Navegación — 47 ítems para 196 rutas

- `ADMIN_NAV_ITEMS` (`nav-items.ts:31-77`): **47 ítems en 8 secciones**
  (Operations 16, Payroll 12, Management 7, Administration 3, Home 3, Intake 3,
  Tax 2, Commercial 1).
- **196 rutas** declaradas en `App.tsx`. Unas ~140 no tienen entrada de nav.
  Parte es legítimo (perfiles `:id`, sub-layouts con menú propio como
  `founder-finance/*`), pero hay herramientas operativas reales sin puerta de
  entrada: `identity-quality` (`App.tsx:351`), `company-dictionary` (`:363`),
  `needs-attention` (`:320`), `daily-close` (`:321`), `today` (`:322`),
  `workforce` (`:336`), `settings`/`permissions`/`activity` (`:374-378`), y el
  módulo completo de facturación (`:441-448`).
- **Rutas duplicadas hacia la misma pantalla**: `assignment-overrides` vs
  `admin/assignment-overrides` (`:378-379`); tres rutas para duplicados de
  worker (`:380-382`); `payroll-reconciliation` / `staged-recon` /
  `payroll-recon` al mismo componente (`:427-428`).

Un sistema operativo enterprise no tiene 140 rutas sin puerta de entrada
declarada. Esto indica acumulación por sprint, no arquitectura de navegación.

---

## 4. Calendarios — el área más madura

La regla canónica ("un Servicio se dibuja UNA vez; los workers son metadata",
`ServiceEventCard.tsx:1-16`) **se cumple** en:

| Vista | Unidad | `ServiceEventCard` | ¿Duplica por worker? |
| --- | --- | --- | --- |
| `MonthView.tsx:148,171,234` | Servicio | Sí | No |
| `WeekView.tsx:168` | Servicio | Sí | No |
| `ClientView.tsx:50` | Servicio por Cliente | Sí | No |
| `WeekByJobView.tsx:98` | Servicio por Job | Sí | No |
| `WeekByEmployeeView.tsx:120-148` | **Worker** | No | Sí (1 por asignación) |
| `EmployeeView.tsx:2,42` | **Worker** | No (usa `ShiftCard`) | Sí |
| `DayView.tsx:160-247` | Servicio | **No** (card manual propia) | No |

Las dos vistas "por persona" duplican por diseño (índice de staffing), lo cual es
defendible. **`DayView` no lo es**: renderiza servicios con una card manual
propia en lugar de la canónica — es la brecha real de este bloque.

---

## 5. Viewport — el contenido operativo no empieza en el primer scroll

Pila de cromo: `AdminLayout` sticky 48 px + `main py-4` 16 px +
`OperationalWorkspace` (header 52 · tabs 40 · filtros ~40 · chips 40 · panel
admin 36 · `pt-3`).

| Pantalla | Cromo estimado antes del contenido |
| --- | --- |
| Clientes | ~206 px |
| Equipo | ~236 px |
| Servicios | ~235–260 px |
| Identity Quality | ~242 px |
| Command Center | ~232 px (hero propio, no usa `OperationalWorkspace`) |

`docs/qa/P0_OPERATIONAL_FIRST_LAYOUT_PASS.md` reclamaba contenido a ~330–480 px;
la medición actual mejora eso, pero **Command Center y Today no adoptaron
`OperationalWorkspace`** y mantienen su propio hero.

Botones: 617 `<Button>` en `src/pages/admin`, dominados por `size="sm"`
(Employees 19, OperationsCommandCenter 15, ImportSchedule 13). **Cero overrides
`h-*` sobre `<Button>`** — la escala de botón sí es consistente. No se detectaron
filas planas de >4 acciones: el patrón dominante es 1–2 botones + overflow.

---

## 6. Mobile — no es responsive, es una segunda aplicación

- **21 componentes/páginas mobile dedicados**: 9 en `admin/mobile/*`, 5 en
  `shifts/mobile/*`, 4 páginas `Mobile*.tsx`, 3 vistas de comando.
- **13 páginas admin bifurcan JSX completo con `useIsMobile()`** (Shifts,
  Employees, Home, Dashboard, TimeClock, LiveMap, PayrollReviewQueue,
  ValidationCenter, DailyOps, DailyClose, PeriodSummary, CommandCenterHub).
- Ejemplo de duplicación dentro de un mismo archivo:
  `WeekByEmployeeView.tsx:150-190` (mobile) vs `:193-329` (desktop): dos JSX
  distintos sobre los mismos datos.

Coste: cada regla de negocio nueva debe implementarse dos veces. Es la mayor
fuente estructural de deriva entre superficies.

---

## 7. Higiene — deuda medible

**19 archivos sin ningún consumidor** (verificado con `rg`):

- Componentes (15): `EmployeeCRMTimeline`, `dashboard/AdminSummaryCard`,
  `dashboard/MyShiftCard`, `employee/EmployeePortalModulesPanel`,
  `front-desk/FrontDeskStepper`, `profile-standard/ConsentGate`,
  `profile-standard/SourceProvenanceBadge`, `reconciliation/PeriodScorecard`,
  `reconciliation/WeeklyCloseChecklist`, `shifts/ShiftLocationsSection`,
  `shifts/assign/RecommendedForServiceBlock`,
  `shifts/calendar/ServiceCalendarChip`, `shifts/closeout/FinalApprovalCard`,
  `timeclock/HoursApprovalPanel`, `timeclock/MonthClockView`.
- Hooks (4): `useCompensationSnapshot`, **`useLexicon`**, `useSecurityFlags`,
  `useShiftPresence`.
- Lib (3): `advance-deduction-engine`, `supabase-helpers`,
  `export-chatgpt-prompt-pdf`.

Que **`useLexicon` esté muerto** mientras el lenguaje de producto está
fragmentado resume el diagnóstico completo: la infraestructura correcta existe y
nadie la consume.

Archivos monstruo (mantenibilidad): `Shifts.tsx` 3.351 · `ImportSchedule.tsx`
3.276 · `PayrollTruthValidation.tsx` 2.728 · `Employees.tsx` 2.525 ·
`MobileShiftOperationsSheet.tsx` 2.112 líneas.

---

## 8. Drawers y formularios

61 archivos `*Dialog/*Sheet/*Drawer`. **No hay wrapper canónico de
header/footer** salvo `OpsSheetHeader/Body/Footer` usado únicamente por
`ShiftDetailDialog`. Cada diálogo define su propio layout.

Los formularios sí muestran madurez de criterio:

- **Servicio**: 7 secciones, ~14–16 campos; obligatorios duros Cliente, Fecha,
  Entrada, Salida, Plazas, Job Site (`JobSiteSection.tsx:59`), validados por
  `service-operational-readiness.ts:106-213`.
- **Cliente**: **un solo campo obligatorio, Nombre**
  (`QuickCreateClientDialog.tsx:114-120`), reutilizado desde 4 superficies.
- **Worker**: invitación por email → onboarding posterior (flujo partido, patrón
  distinto de los otros dos).

`VersionConflictDialog` es el único diálogo diseñado como pieza sistémica
multi-superficie — el modelo a replicar.

---

## 9. Qué separa a Stafly de "enterprise" hoy

En orden de impacto, no de esfuerzo:

1. **Un objeto, un nombre.** Adoptar el lexicón en las ~8 pantallas admin que
   dicen "Turno" y unificar Worker/Empleado/Trabajador/Staff y
   Location/Venue/Ubicación/Lugar. Es la brecha que más "cara de sistema" cuesta.
2. **Cerrar el design system.** Absorber OCS y las 4 variantes de `ShiftCard`
   dentro de `EntityCard`/`ServiceEventCard`; migrar `DayView` a la card
   canónica; eliminar las 4 copias locales de `KpiCard`.
3. **Terminar el layout operativo.** Llevar `OperationalWorkspace` a Command
   Center, Today y las páginas admin de alto tráfico que aún usan `PageHeader`.
4. **Deshacer la app mobile paralela.** Convertir las ramas `useIsMobile()` en
   composición responsive por bloques, empezando por `WeekByEmployeeView` y
   `Shifts`.
5. **Navegación declarada.** Cada ruta operativa con puerta de entrada o
   redirect explícito; eliminar los duplicados de ruta.
6. **Higiene.** Borrar los 19 archivos muertos, tokenizar `#25D366` y `text-white`,
   partir los 5 archivos de >2.000 líneas.

---

## 10. Alcance de esta auditoría

Solo lectura. No se tocó auth, RLS, payroll, `time_entries`,
`shift_assignments`, `scheduled_shifts`, documentos, pagos, chat, tenants,
migraciones ni datos reales. Las medidas de píxeles son estimaciones derivadas
de clases Tailwind, no medición DOM en runtime.
