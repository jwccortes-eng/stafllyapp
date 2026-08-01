# OX Premium Experience Audit — V1

Fecha: 2026-08-01 · Alcance: auditoría integral report-only (visual, navegación, interacción, flujos, delight, mobile-first, desktop manager).
**No se modificó código, no se crearon migraciones.**

Método: inventario estático del repo (698 `.tsx`, 176 páginas, 457 componentes, 190 rutas, 231 tokens en `index.css`) + dos auditorías dirigidas (lenguaje visual / navegación y flujos) con referencias `file:line`.

Veredicto global de percepción: **6.8 / 10**. La base es fuerte (design system real, tokens semánticos, primitivas `ui/*` bien diseñadas, ops profundas). Lo que rompe la sensación premium no es falta de features: es **deriva de adopción** — cada equipo/sprint resolvió el mismo problema visual otra vez.

---

## 0. Resumen ejecutivo

| Dimensión | Nota | Diagnóstico en una línea |
|---|---|---|
| Visual language | 5.5 | El sistema existe; ~1.159 usos de color crudo lo ignoran. |
| Navigation | 6.0 | 190 rutas, 77 items admin, alias legacy y rutas huérfanas. |
| Interaction | 5.0 | Dos sistemas de toast, 3 spinners distintos, 40+ catch mudos. |
| Operational flow | 6.5 | Flujos completos pero fragmentados en superficies paralelas. |
| Delight | 4.5 | Cero motion system; los momentos terminales no se celebran. |
| Mobile first | 6.5 | Buen bottom-nav, pero 440 archivos con tipografía ≤11px. |
| Desktop manager | 7.0 | Command Center sólido; falta jerarquía y search de datos. |

**Los 3 problemas que más cuestan la percepción premium:**
1. **Inconsistencia cromática sistémica** — 217 archivos usan paletas Tailwind crudas (`emerald-500`, `amber-600`) en vez de tokens; el producto "cambia de marca" al navegar entre módulos.
2. **Feedback impredecible** — `sonner` (109 archivos) vs `use-toast` legacy (97), dos archivos importan ambos; 40+ fallos solo van a consola.
3. **Duplicación conceptual** — 5 shift cards, 5 KPI cards, ~25 badges de estado, 3 superficies distintas para aprobar horas.

---

## 1. Visual Language

### 1.1 Lo que ya está bien
- `src/index.css`: 231 variables CSS, HSL, con dark mode.
- Primitivas canónicas correctas: `ui/kpi-card.tsx`, `ui/status-badge.tsx:5-11` (usa `bg-[hsl(var(--status-confirmed))]`), `ui/empty-state.tsx`, `ui/skeleton.tsx`, `ui/page-skeleton.tsx`, `ui/page-header.tsx`, `ui/premium-*`.
- Existe una familia `stafly-ui/` y `premium-*` que indica una intención de estandarización previa.

### 1.2 Inconsistencias medidas
| Métrica | Valor |
|---|---|
| Hits de color hardcodeado (`text-white`, `bg-gray-*`, `bg-[#hex]`…) | **1.159** (626 en components, 533 en pages) |
| Archivos con paleta Tailwind cruda (`emerald-500`, `amber-600`…) | **217** |
| Archivos con tipografía ≤11px (`text-[10px]`, `text-[11px]`, `text-[9px]`) | **440** |
| Archivos con targets pequeños (`h-6`, `h-7`, `size="sm"`) | **360** |
| `transition-all` vs `transition-colors` | 269 vs 455 |
| Duraciones distintas en uso | 150/200/300/500/700/1000 (6 valores, sin token) |

Peores ofensores (hits de color crudo por archivo):
- `src/components/shifts/mobile/MobileShiftOperationsSheet.tsx` — 34 (+41 paleta cruda)
- `src/components/shifts/mobile/MobileShiftTeamHub.tsx` — 33
- `src/pages/admin/ComparisonReport.tsx` — 31
- `src/pages/kiosk/KioskClock.tsx` — 28
- `src/pages/admin/Users.tsx` — 27 · `src/components/payroll/ReviewPolicyBoard.tsx` — 27
- `src/components/shifts/ShiftAttendancePanel.tsx` — 25 · `src/pages/admin/StaffingRequests.tsx` — 25
- `src/components/ModeSwitcher.tsx` — 18 (**crítico: componente global compartido**)
- 9 archivos dentro de `src/components/ui/` tienen color crudo — las propias primitivas no son 100% token-driven.

### 1.3 Duplicaciones y componentes legacy

**Shift cards (5 implementaciones del mismo objeto):**
`dashboard/MyShiftCard.tsx`, `operations/OpsShiftCard.tsx`, `portal/PortalShiftCard.tsx`, `shifts/ShiftCard.tsx`, `shifts/ShiftClosureCard.tsx`.

**KPI / scorecards (5):** canónica `ui/kpi-card.tsx` + `ox/KpiStateCard.tsx`, `reconciliation/ClosureQualityScorecard.tsx`, `reconciliation/PeriodScorecard.tsx`, `shifts/ops/AttendanceEvidenceCard.tsx`.

**Badges / chips de estado (~25, cada uno con su propio mapa de color):**
`ui/status-badge.tsx` (canónica), `ui/badge.tsx`, `ui/premium-status-badge.tsx`, `ui/readiness-badge.tsx`, `ui/period-status-banner.tsx`, `AddressStatusChip`, `IdentityBadges`, `PortalAccessBadge`, `ProfileStatusBadge`, `WorkerPhotoStatusChip`, `TicketBadge`, `LocationStatusChip`, `OpsStatusChip`, `StatusPill`, `TenantSafetyBadge`, `WorkerPreferenceBadge`, `ProfileLayerBadge`, `SourceProvenanceBadge`, `PeriodStatusBadges`, `EmployeeReviewBadge`, `PendingBadgeRow`.

**Dialog/Sheet forks desktop↔móvil (39 `*Dialog*` + 10 `*Sheet*`):**
`ShiftEditDialog.tsx` ↔ `MobileShiftEditSheet.tsx`; `ShiftDetailDialog.tsx` ↔ `MobileShiftOperationsSheet.tsx`. Dos implementaciones del mismo flujo que divergen con cada cambio.

**Legacy vivo:** `FloatingDock` + `AppLauncher` conviven con `AdminBottomNav` bajo el flag `?nav=legacy` (`AdminLayout.tsx:268-269, 300-318`); `AdminBottomNav.tsx:24-30` hardcodea sus 5 tabs ignorando `nav-items.ts`.

---

## 2. Navigation

- **190 rutas** en un solo `src/App.tsx` (489 líneas): `/app` 152, `/portal` 21, `/client` 3, `/parceros` 5, públicas ~18.
- **77 items** en `ADMIN_NAV_ITEMS` (`nav-items.ts:30-77`); solo ~20 son `mobile:"primary"` → **57 funciones admin no existen en móvil salvo por URL**.
- **7 items** en `EMPLOYEE_NAV_ITEMS`.

**¿Siempre es evidente dónde está el usuario?** No.
- El shell desktop (`AdminLayout`) no ofrece back ni breadcrumb propio; páginas de 2–3 niveles (`/app/clients/:clientId`) dependen de que cada página dibuje el suyo.
- `ShiftCaptainRoom.tsx:190` usa `navigate(-1)`; su fallback de acceso denegado salta a `/portal/clock` (`:165`) — dos semánticas de "atrás" en la misma pantalla.

**¿Callejones sin salida?** Sí.
- `/portal/shift-captain/:shiftId` (`App.tsx:470`) no está en `nav-items.ts`: acción crítica de rol alcanzable solo por deep-link.
- `payroll-review-queue` está `mobile:"hidden"` y role-gated a owner/admin → un manager no puede aprobar horas desde el móvil.
- Rutas dev en el mismo router: `dev/change-intelligence`, `dev/operational-authorization`, `dev/operational-signals` (`App.tsx:420-422`), sin entrada de nav.
- Redirecciones muertas: `kiosk-devices`, `front-desk-reports` (`App.tsx:407,413`), `/portal/payments` (`App.tsx:453`).

**¿Navegación redundante?** Sí, confirmada.
- `assignment-overrides` y `admin/assignment-overrides` → mismo componente (`App.tsx:366-367`).
- `workers/duplicates` + `employees/duplicates` + `admin/worker-duplicates` → 3 URLs, 1 pantalla (`App.tsx:368-370`).
- `summary` y `reports` → ambos `PeriodSummary` (`App.tsx:337,339`).
- `dev-command-center` y `owner-command-center` → mismo `DevCommandCenter` (`App.tsx:317-318`).
- `payroll-reconciliation` aparece bajo dos ids de nav (`nav-items.ts:70,74`).
- Alias legacy: `/app/workers`, `/app/workers-data-quality`, `/app/workers/:id` (`App.tsx:321-322,332`).

**Búsqueda:** `CommandPalette.tsx` (Cmd+K) existe pero es **búsqueda de navegación sobre una lista hardcodeada de 21+8 entradas** (`:25-57`) — no se puede buscar un worker, un turno o un cliente. **El portal no tiene ninguna búsqueda** (`EmployeeLayout.tsx` no monta CommandPalette).

**Tenant switch:** admin usa `CompanySwitcher`; el portal reimplementa un dropdown propio en `EmployeeLayout.tsx:160-191`. En móvil admin el switcher solo aparece si `companies.length > 1` (`AdminLayout.tsx:287-291`).

---

## 3. Interaction

**Loaders:** 196 archivos con `Loader2`, 380 usos de `animate-spin`, y **22 archivos con spinner artesanal** (div + border + animate-spin, sin `Loader2`): `AdminLayout.tsx`, `EmployeeLayout.tsx`, `pages/Index.tsx`, `admin/CommandCenter.tsx`, `admin/SystemHealth.tsx`, `portal/PortalClock.tsx`, `migration/SyncStatusPanel.tsx`, `reconciliation/DataIntegrityAudit.tsx`. → **3 lenguajes de carga distintos** (icono, spinner CSS, `animate-pulse`).

**Skeletons:** solo 37 archivos usan `Skeleton`/`PageSkeleton` sobre 176 páginas → la mayoría de las pantallas hace *flash* de spinner en vez de estructura.

**Empty states:** `ui/empty-state.tsx` importado en 57 archivos; 60+ componentes escriben su propio bloque "No hay resultados" (`shifts/LiveShiftBoard.tsx`, `timeclock/TimesheetView.tsx`, `locations/LocationPicker.tsx`).

**Success / error:**
- Dos sistemas de toast: `sonner` (109 archivos) y `use-toast` legacy (97). `employee/EmployeeProfileTabs.tsx` y `admin/PeriodSummary.tsx` **importan los dos**.
- Copy mezclado: español mayoritario con fallbacks en inglés (`"Error"`), y estilos alternando entre imperativo, participio y frase completa.
- **Fallos silenciosos (solo consola, sin feedback al usuario), 40+ casos**, incluidos caminos críticos:
  - `operations/AutoDispatchPanel.tsx:131-133, 144-145` — fallo de dispatch invisible.
  - `hooks/useAuth.tsx:309,562,590` · `hooks/useCompany.tsx:200,305` — auth/tenant fallan mudos.
  - `hooks/useLocationTracking.tsx:104,193` · `hooks/useShiftPresence.tsx:155` — geolocalización/presencia.
  - `admin/CommandCenter.tsx:410,829` · `admin/Employees.tsx:443` · `admin/ImportSchedule.tsx:1991`.

**Transiciones / animaciones:** cero librería de motion (no hay framer-motion). Todo es utilidad Tailwind, con cola larga de one-offs (`animate-slide-up` ×4, `animate-shake` ×1, `animate-scale-in` ×1, `animate-bounce` ×1) y 6 duraciones distintas. No hay curva de easing compartida.

---

## 4. Operational Flow

### 4.1 Worker — Check-in (`pages/portal/PortalClock.tsx`, 1.234 líneas)
Pasos: `/portal/clock` → gate de foto de perfil (`:774-786`, redirige a `/portal/profile`) → selección de turno o QR (`QRScannerDialog`, `:1200`) → geofence (`:469-481`) → captura de foto obligatoria (`:1195`, `:221`) → `handleClockIn` (`:452`).
- **Hasta 4 compuertas antes del primer tap útil.**
- `handleClockIn` (`:452`) y `handleClockOut` (`:560`) son espejos duplicados.
- Carga cognitiva alta: una mega-página que mezcla estado, permisos, cámara, mapa y escritura.
- **Simplificación:** un solo `ClockActionSheet` con estado progresivo (listo / bloqueado + causa + CTA de resolución), gates evaluados *antes* de mostrar el botón, y `useClockAction()` compartido para in/out.

### 4.2 Captain — Cierre de turno (`ShiftCaptainRoom.tsx` + `closeout/ShiftCloseoutSection.tsx` + `CaptainCloseoutForm.tsx`)
Pasos: deep-link a `/portal/shift-captain/:shiftId` → gate de acceso (`:94-97`) → revisar `LiveShiftBoard` (`:255-265`) → saltar a closeout (`CaptainNextActionCard.onOpenCloseout`, `:238`) → enviar formulario → chip "enviado" (`:43-51`).
- **Fricción:** pantalla no alcanzable desde el bottom nav; scroll largo entre board y formulario; el captain no sabe qué pasa después salvo por el texto del panel (`ShiftCloseoutSection.tsx:116-123`).
- **Simplificación:** entrada explícita "Sala de turno" desde la shift card del portal; stepper de 3 pasos (Asistencia → Incidencias → Enviar) en vez de una página larga.

### 4.3 Dispatcher — Asignar worker (`admin/Shifts.tsx` + `shifts/form/TeamSection.tsx`)
Dos caminos distintos para la misma acción:
- **Crear:** `CreateShiftDialogInline` (`Shifts.tsx:109`) → `TeamSection showEmployeePicker` (`:148`, `TeamSection.tsx:73`) → `EmployeeCombobox` → `selectedEmployees` (`:486`) → confirmación (`:2443-2480`) → insert en `shift_assignments` (`:982-988`).
- **Editar:** UI totalmente distinta vía `ShiftDetailDialog.onAddEmployees/onRemoveAssignment` (`ShiftDetailDialog.tsx:95`); comentario explícito en `TeamSection.tsx:5`.
- **Simplificación:** un único `ShiftTeamEditor` usado en create y edit; confirmación solo cuando hay impacto material (coste, cobertura, override de compliance).

### 4.4 Manager — Aprobar horas (3 superficies paralelas)
`timeclock/HoursApprovalPanel.tsx` (lógica real, `lib/timeclock/hours-approval.ts`) montado en `admin/PayrollReviewQueue.tsx` **y** en `shifts/ShiftClosureCard.tsx:18`; en paralelo existen `closeout/AdminCloseoutReview.tsx` y `closeout/FinalApprovalCard.tsx`.
- **Riesgo:** el mismo turno se puede tocar desde 3 pantallas sin secuencia clara; alto riesgo de doble manejo.
- **Simplificación:** un solo "Centro de Validación" como fuente de verdad, y las demás superficies como *deep-link + estado read-only* con badge de progreso.

---

## 5. Delight — momentos "wow" que faltan

| Momento | Hoy | Oportunidad |
|---|---|---|
| Cierre de turno | Toast plano "Turno cerrado correctamente" | Transición de la card a estado sellado + resumen (workers, horas reales, incidencias) + micro-check animado |
| Aprobación de horas | Fila cambia de estado | Barra de progreso "12/12 revisadas" + estado terminal "Listo para payroll" celebrado una sola vez |
| Asignación | Insert silencioso | Avatar que entra con stagger + "Equipo completo 6/6" con cambio de color de cobertura |
| Check-in | Toast | Confirmación pantalla completa 1,2s: hora, sitio, "Estás dentro" |
| Cambio de tenant | Bloqueo + spinner (`ox/TenantSwitchStatus.tsx`) | Cross-fade con nombre/logo de la compañía destino |
| Mensajes de éxito | Copy heterogéneo ES/EN | Voz única: sujeto + hecho + consecuencia ("Horas aprobadas · pasan a payroll") |
| Empty states | 60+ variantes caseras | Ilustración + una acción primaria por contexto |
| Onboarding | `OnboardingChecklist.tsx` aislado | Progreso persistente en TopBar hasta completarse |

---

## 6. Mobile First

- **Legibilidad:** 440 archivos usan `text-[10px]/[11px]/[9px]` — por debajo del mínimo cómodo (12–13px) para uso en campo con guantes/sol.
- **Áreas táctiles:** 360 archivos con `h-6`/`h-7`/`size="sm"` → botones de 24–28px frente al mínimo de 44px.
- **Densidad:** `MobileShiftOperationsSheet.tsx` (34 colores crudos + 41 de paleta) concentra demasiada información sin jerarquía tipográfica.
- **Uso a una mano:** el CTA primario no está garantizado en la zona del pulgar; muchas hojas colocan la acción al final del scroll.
- **Alcance:** 57 de 77 funciones admin son `mobile:"hidden"`; `payroll-review-queue` incluido → tareas de manager imposibles en móvil.
- **Scroll:** páginas mega (`PortalClock.tsx` 1.234 líneas, `Shifts.tsx` 2.000+) sin secciones ancladas ni sticky headers.

---

## 7. Desktop Manager

- **Command Center:** sólido, pero `admin/CommandCenter.tsx` tiene 17 usos de paleta cruda, spinner artesanal y 2 catch mudos (`:410,829`) — la pantalla insignia es de las menos tokenizadas.
- **Navegación lateral:** `AdminSidebar.tsx` (500 líneas) con 77 items y sin búsqueda dentro del propio sidebar; la jerarquía depende de `mobileSection`, no de una taxonomía desktop.
- **Multi-tenant:** el switch funciona, pero el defecto conocido **F3-D1** (caída a "Vista global · 0 empresas" ante corte de red, ver `docs/qa/P0_OX_QA_MANUAL_PRE_PUBLISH.md:56-59`) sigue abierto.
- **Productividad:** falta búsqueda de datos (worker/turno/cliente) en Cmd+K, faltan acciones masivas consistentes (`ui/bulk-actions-bar.tsx` existe pero está poco adoptado) y no hay atajos de teclado más allá de Cmd+K.

---

## 8. Top 25 oportunidades priorizadas

### P0 — Rompen la percepción premium o bloquean trabajo real
| # | Oportunidad | Esfuerzo | Impacto percepción |
|---|---|---|---|
| 1 | Eliminar fallos silenciosos: toast obligatorio en los 40+ `catch` de consola (empezando por `useAuth`, `useCompany`, `AutoDispatchPanel`) | Quick | Muy alto — confianza |
| 2 | Unificar toasts en `sonner`; borrar `use-toast` legacy y los 2 archivos con doble import | Medium | Alto |
| 3 | Voz única de mensajes: guía de copy ES + refactor de éxitos/errores críticos | Quick | Alto |
| 4 | Consolidar aprobación de horas en un único punto de entrada (Centro de Validación) y dejar el resto read-only con deep-link | Medium | Muy alto — seguridad operativa |
| 5 | Tipografía mínima 12px y targets ≥44px en superficies móviles operativas (clock, shift sheets, team hub) | Medium | Muy alto — mobile-first |
| 6 | Exponer `payroll-review-queue` y `shift-captain` en navegación móvil por rol | Quick | Alto |
| 7 | Tokenizar los 10 peores archivos por color crudo (`MobileShiftOperationsSheet`, `MobileShiftTeamHub`, `ShiftAttendancePanel`, `ModeSwitcher`, `CommandCenter`…) | Medium | Alto |
| 8 | Cerrar F3-D1: conservar tenant y lista de compañías ante fallo de red | Quick | Alto |

### P1 — Coherencia y fluidez
| # | Oportunidad | Esfuerzo |
|---|---|---|
| 9 | `StatusBadge` único: migrar los ~25 badges a `ui/status-badge.tsx` con mapa de tokens | Medium |
| 10 | `ShiftCardBase` compositivo: colapsar las 5 shift cards | Big |
| 11 | `KpiCard` único: absorber `KpiStateCard` y los scorecards | Medium |
| 12 | Un solo spinner: eliminar los 22 artesanales | Quick |
| 13 | `EmptyState` obligatorio + lint rule; migrar los 60+ caseros | Medium |
| 14 | Skeletons en las 20 pantallas más visitadas (hoy 37/176) | Medium |
| 15 | Motion system: tokens de duración (fast 150 / base 200 / slow 300) y easing único; eliminar `transition-all` masivo | Medium |
| 16 | Limpiar el router: borrar alias legacy y rutas duplicadas (`workers/*`, `assignment-overrides` ×2, `duplicates` ×3, `summary`/`reports`, `owner-command-center`) | Quick |
| 17 | Sacar rutas `dev/*` del router de producción o gatearlas explícitamente | Quick |
| 18 | Retirar el nav legacy (`FloatingDock`/`AppLauncher`, flag `?nav=legacy`) | Quick |
| 19 | `AdminBottomNav` debe leer de `nav-items.ts`, no de tabs hardcodeadas | Quick |
| 20 | Breadcrumb/back consistente en el shell admin y semántica de back única en portal | Medium |

### P2 — Delight y productividad
| # | Oportunidad | Esfuerzo |
|---|---|---|
| 21 | Cmd+K con búsqueda de datos (workers, turnos, clientes) + palette en el portal | Big |
| 22 | Estados terminales celebrados: cierre de turno, horas aprobadas, equipo completo | Medium |
| 23 | Unificar `ShiftEditDialog`/`MobileShiftEditSheet` en un componente responsive | Big |
| 24 | Un único `ShiftTeamEditor` para create y edit | Big |
| 25 | Onboarding persistente con progreso visible en TopBar | Medium |

---

## 9. Clasificación por esfuerzo

**Quick wins (<1 día):** #1 (por tanda), #3, #6, #8, #12, #16, #17, #18, #19.
**Medium wins (<1 sprint):** #2, #4, #5, #7, #9, #11, #13, #14, #15, #20, #22, #25.
**Big wins (>1 sprint):** #10, #21, #23, #24.

## 10. Componentes candidatos a estandarización
`ShiftCardBase` · `StatusBadge` (unificado) · `KpiCard` (unificado) · `EmptyState` · `LoadingState` (spinner + skeleton) · `PageHeader` · `ResponsiveSheet` (dialog↔sheet) · `ShiftTeamEditor` · `ClockActionSheet` · `MotionTokens`.

## 11. Componentes legacy (candidatos a retiro)
`FloatingDock.tsx` · `AppLauncher.tsx` · `ui/use-toast.ts` + `ui/toast.tsx` + `ui/toaster.tsx` (tras migrar a sonner) · `command-center-classic` · `owner-command-center` (alias) · `WorkerProfileRedirect` y alias `/app/workers*` · `/portal/payments` · rutas redirect `kiosk-devices`, `front-desk-reports` · los ~20 badges one-off.

## 12. Flujos con mayor fricción (ranking)
1. Aprobación de horas (3 superficies, sin secuencia canónica).
2. Check-in de worker (4 compuertas, mega-página).
3. Asignación de worker (2 UIs distintas según ciclo de vida).
4. Cierre de turno del captain (pantalla huérfana, scroll largo).
5. Tareas de manager en móvil (57/77 funciones ocultas).

## 13. Estimación de impacto en percepción
| Bloque | Delta estimado |
|---|---|
| P0 completo | 6.8 → **8.0** |
| P0 + P1 | → **8.8** |
| P0 + P1 + P2 | → **9.3** |

Racional: el mayor salto no viene de features nuevas sino de eliminar la varianza — color, feedback, carga y estados. Un producto que responde igual en todas partes se percibe como caro; hoy Stafly responde distinto en cada módulo.

---

## 14. Notas de alcance
- Auditoría estática + evidencia de repo; no se ejecutó walkthrough en vivo para contar clics exactos en `CreateShiftDialogInline`.
- No se verificó pantalla por pantalla si `HoursApprovalPanel`, `FinalApprovalCard` y `AdminCloseoutReview` operan sobre datos distintos (`time_entries` vs `shift_closeout_reports`) o duplican lógica — recomendado como primer paso de la P0 #4.
- No se tocó payroll, auth, RLS, tenants ni assignment policy. Cero cambios de código.
