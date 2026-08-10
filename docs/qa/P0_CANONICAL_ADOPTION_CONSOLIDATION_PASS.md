# P0 — CANONICAL ADOPTION & CONSOLIDATION PASS

Fuente: `docs/qa/STAFLY_ENTERPRISE_MATURITY_AUDIT_V1.md`.
Principio de este pass: **no se crea ningún sistema nuevo.** Se define el
Critical Path, se clasifica lo existente y se implementan únicamente quick wins
P0 puramente visuales/semánticos.

**Cero cambios en:** auth, RLS, tenants, payroll, `time_entries`,
`shift_assignments`, `scheduled_shifts`, documentos, pagos, bookings,
Connecteam, Smart Intake, Client Truth, Worker Identity, recurrencia, datos.

---

## 1. CRITICAL PATH — rutas exactas

No se migran 123 páginas. El Critical Path son **23 rutas** de uso diario.

### A. Servicios / Operación

| Ruta | Superficie |
| --- | --- |
| `/app/shifts` | Servicios (calendario + creación/edición + bulk) |
| `/app/shift-ops` | Operación del servicio |
| `/app/command-center` | Command Center Hub |
| `/app/today` | Today Hub |
| `/app/daily-ops` | Operación del día |
| `/app/daily-close` | Cierre del día |
| `/app/staffing-center` | Staffing / reemplazos |
| `/app/live-map` | Evidencia operativa en vivo |

Diálogos del path (no son rutas pero sí superficie diaria):
`ShiftDetailDialog`, `ShiftEditDialog`, `BulkServiceCreationDialog`,
`ReplacementSuggestionDialog`, `EmployeeCombobox`, `MobileQuickCreateShiftSheet`.

### B. Personas / Clientes

| Ruta | Superficie |
| --- | --- |
| `/app/employees` | Equipo |
| `/app/people/:id` · `/app/employees/:id` | Passport unificado |
| `/app/identity-quality` | Calidad de identidad |
| `/app/clients` | Clientes |
| `/app/clients/:clientId` | Passport de cliente |
| `/app/locations` · `/app/locations/:locationId` | Venues |

### C. Tiempo / Pago

| Ruta | Superficie |
| --- | --- |
| `/app/timeclock` | Reloj |
| `/app/attendance` | Asistencia |
| `/app/validation-center` | Centro de Validación |
| `/app/payroll-review-queue` | Revisión de horas |
| `/app/summary` | Preparación de nómina |
| `/app/periods` | Periodos |

---

## 2. OPERATIONAL WORKSPACE — por qué solo vive en 4 páginas

Causa raíz, con evidencia: `OperationalWorkspace` no reemplazó a `PageHeader`;
**`PageHeader` fue reescrito como adaptador delgado sobre
`OperationalScreenHeader`** (`src/components/ui/page-header.tsx:37`). Eso
resolvió la cabecera pero **eliminó el incentivo de migrar el layout completo**:
85 páginas obtuvieron la cabecera canónica "gratis" y nunca adoptaron el
contrato de tabs/filtros/chips/panel administrativo. No es resistencia técnica,
es que la migración dejó de ser necesaria para verse bien.

### Clasificación del Critical Path

| Ruta | Estado |
| --- | --- |
| `/app/shifts`, `/app/employees`, `/app/clients`, `/app/identity-quality` | **Ya lo usa** |
| `/app/timeclock`, `/app/payroll-review-queue`, `/app/import-schedule` | Usa `OperationalScreenHeader` sin el workspace — **adoptable sin cambio funcional** |
| `/app/attendance`, `/app/locations`, `/app/summary`, `/app/periods`, `/app/staffing-center`, `/app/daily-ops` | **Adoptable**: tienen tabs/filtros/KPIs que encajan en el contrato |
| `/app/today`, `/app/command-center` | **Excepción justificada**: son hubs de decisión con hero + tarjetas OCS, no listas con filtros. Forzar el wrapper añadiría cromo sin contenido que ordenar |
| `/app/live-map` | **Excepción justificada**: lienzo a pantalla completa; el sticky del workspace le robaría viewport al mapa |
| `/app/validation-center` | **Adoptable con cuidado**: ya es OCS puro; migrar solo la cabecera/chips, no las tarjetas |
| `/app/people/:id`, `/app/clients/:clientId` | **Excepción**: son detalle (Passport), no workspace de lista |

**Acción de este pass:** ninguna migración de layout. Son cambios estructurales,
no quick wins; van al backlog P1.

---

## 3. ENTITY COMPONENTS — los tres sistemas

| Sistema | Componentes | Clasificación |
| --- | --- | --- |
| **Canónico** | `EntityCard`, `EntityRow`, `ServiceEventCard`, `ClientIdentityPack` | CANONICAL |
| **OCS** (`src/components/ocs/*`) | `WorkerCard`, `TeamCard`, `ShiftCard`, `ValidationCard`, `InsightCard`, `KpiCard`, `TerminalCard`, `OperationalCard` | Mixto — ver desglose |
| **Legacy disperso** | `shifts/ShiftCard`, `operations/OpsShiftCard`, `portal/PortalShiftCard`, `dashboard/MyShiftCard`, 4 `ShiftCard` locales, 4 `KpiCard` locales, 5 primitivas de avatar | LEGACY |

### Desglose de OCS

- `OperationalCard`, `ValidationCard`, `InsightCard`, `TerminalCard`,
  `KpiCard` → **SPECIALIZED_VALID**. No representan entidades: representan
  decisiones, señales y métricas. No compiten con `EntityCard`.
- `WorkerCard`, `TeamCard` → **LEGACY**. Representan personas fuera del contrato
  canónico. Deben delegar en `EntityCard`.
- `ShiftCard` (OCS) y las 3 variantes dispersas → **LEGACY**. Representan
  servicios fuera de `ServiceEventCard`.

### Cuarto patrón a eliminar conceptualmente

**Las tarjetas redefinidas dentro de una página** (`MyPayments.tsx:956`,
`Today.tsx:62`, `StaffingCenter.tsx:179`, `OperationsCommandCenter.tsx:821`, más
4 `KpiCard` locales en `WorkerDuplicates`, `AssignmentOverrides`,
`FrontDeskReports`, `PayReports`). No son un sistema: son copias. Queda prohibido
declarar una card de entidad dentro de una página.

`EntityPassport` **no existe** como componente (solo se menciona en
`ServiceEventCard.tsx:8`). El contrato de detalle lo cubren hoy
`UnifiedPersonProfile` y `ClientIdentityPack`. **No se crea** en este pass: crear
`EntityPassport` sería arquitectura nueva, justo lo que este pass prohíbe.

Ningún archivo se borra en este pass.

---

## 4. LEXICÓN CANÓNICO — una palabra visible por concepto

Regla estructural: **el nombre técnico no cambia nunca.** Tablas, columnas,
RPCs, enums y claves de auditoría (`crear_turno`, `scheduled_shifts`,
`shift_assignments`, `time_entries`) permanecen idénticos. Solo cambia el copy.

### PERSONA → **Trabajador** (colectivo: **Equipo**)

| Variante | Destino |
| --- | --- |
| Worker (copy visible) | → "Trabajador" |
| Employee / Empleado | → "Trabajador" |
| Staff | → "Equipo" cuando es colectivo; "Trabajador" cuando es individuo |
| Team member | → "Trabajador" |

Técnico intacto: `employees`, `employee_id`, `/app/employees`, `useEmployeeRoster`.
Referencia visible: `ST-XXXXX`.

### LUGAR → **Venue** para el sitio del cliente, **Ubicación** para la dirección

Son dos conceptos, no sinónimos:

| Concepto | Palabra visible | Técnico |
| --- | --- | --- |
| Sitio operativo del cliente (entidad con pasaporte `VN-XXXXX`) | **Venue** | `locations`, `locations_v2` |
| Coordenada/dirección de un servicio concreto | **Ubicación** | `location_id`, `meeting_point` |

Se retiran del copy: "Site", "Job Site", "Lugar".

### SERVICIO / TURNO → depende de la audiencia (regla OX-10 vigente)

| Audiencia | Palabra visible |
| --- | --- |
| Admin | **Servicio** |
| Worker | **Turno** |
| Payroll | **Turno** |

Se retiran del copy visible: "Shift", "Job".
Fuente única: `src/lib/ox/lexicon.ts`. No se crea un lexicón nuevo; se amplía la
adopción del existente. Los términos de PERSONA y LUGAR quedan **documentados
aquí** y se codificarán en el lexicón en un pass posterior — añadir claves hoy
sin migrar sus consumidores solo crearía otra abstracción muerta.

---

## 5. USELEXICON — decisión

**Decisión: A. Es el mecanismo canónico. Se conserva y se adopta.**

Evidencia: `src/hooks/useLexicon.ts` resuelve la audiencia desde la ruta con
`audienceForPath()`. Eso es exactamente lo que necesita un componente compartido
entre admin, portal y payroll (`ShiftDetailDialog`, `EntityCard`,
`ServiceEventCard`): la misma pieza debe decir "Servicio" en `/app/shifts` y
"Turno" en `/portal`. Las constantes `ADMIN_LEX` / `WORKER_LEX` / `PAYROLL_LEX`
no pueden hacer eso.

Contrato resultante:

- Pantalla con audiencia fija → `ADMIN_LEX` / `WORKER_LEX` / `PAYROLL_LEX`.
- Componente compartido entre audiencias → `useLexicon()`.

Está sin uso porque nadie migró los componentes compartidos, no porque sobre.
**No se retira.**

---

## 6. MOBILE — estrategia única

13 páginas bifurcan JSX completo con `useIsMobile()`: `Shifts`, `Employees`,
`Home`, `Dashboard`, `TimeClock`, `LiveMap`, `PayrollReviewQueue`,
`ValidationCenter`, `DailyOps`, `DailyClose`, `PeriodSummary`,
`CommandCenterHub`.

| Clasificación | Páginas | Razón |
| --- | --- | --- |
| **Requiere experiencia mobile especializada** | `TimeClock`, `LiveMap`, `Shifts` (creación rápida en campo) | El gesto operativo es distinto, no solo el ancho: fichar, ver el mapa, crear en la calle |
| **Puede usar responsive del shell** | `Employees`, `Clients`, `PeriodSummary`, `PayrollReviewQueue`, `ValidationCenter` | Son listas con filtros: `OperationalWorkspace` ya es responsive |
| **Legacy** | `Dashboard`, `Home`, `CommandCenterHub` (tres hubs de inicio solapados) | Duplicación de destino, no de layout |
| **Duplicación funcional peligrosa** | `Shifts` → `MobileShiftsView` (página aparte), `WeekByEmployeeView.tsx:150-190` vs `:193-329` | Dos implementaciones de la misma regla operativa: la deriva es cuestión de tiempo |

**Estrategia única declarada:** una sola aplicación, responsive por composición.
La rama mobile se permite **solo** cuando cambia el gesto operativo, y aun así
debe consumir el mismo modelo de datos y los mismos componentes canónicos —
nunca un JSX paralelo con su propia lógica. Nada se elimina en este pass.

---

## 7. LIVE MAP — auditoría de capacidad

**Hallazgo principal: hay dos mapas y solo uno tiene posición en vivo.**

| | `/app/live-map` (`LiveMap.tsx`) | `ShiftLiveMapPanel` (dentro del detalle de servicio) |
| --- | --- | --- |
| Fuente | `clock_events` tipo `clock_in`, primer evento por empleado (`LiveMap.tsx:180-196`) | `location_presence` + `location_sessions`, `watchPosition` cada ≥15 s (`useLocationTracking.tsx:111-146`) |
| Posición | **Congelada desde el fichaje** | Continua y real |
| "Online" | **No existe** el concepto | `STALE_THRESHOLD_MS = 4 min` sobre `last_seen_at` (`location-status.ts:16-17,50-54`) |
| Geofence | Ad-hoc, radio fijo 300 m (`LiveMap.tsx:117,412-430`) | `geofence_radius_meters` por sitio, estados `on_site`/`outside_geofence`/`en_route`/`off_route` |

El "live" de `/app/live-map` es el refetch cada 30 s, no el movimiento del
trabajador.

### Métricas

| Métrica | Línea | Clase |
| --- | --- | --- |
| Fichados ahora | `465` | REAL |
| Sin GPS | `644` | REAL |
| Tarde (>15 min) | `433-451` | REAL (derivado) |
| No-show (>60 min) | `433-451` | REAL (derivado) |
| Sin fichaje | `647` | REAL (derivado) |
| Termina pronto | `453-463` | REAL (derivado) |
| Alertas recientes | `307-339` | REAL |
| Con GPS | `643` | **MISLEADING** — el label sugiere posición actual; es el punto del fichaje |
| Fuera de zona | `427-430` | **PARTIAL** — distancia congelada desde el clock-in |
| Cierre pendiente | `649` | **NOT_CONNECTED** — `KpiPlaceholder`, renderiza "—" |
| Revisión payroll | `650` | **NOT_CONNECTED** — idem |

Nota positiva: los dos KPIs no conectados **ya cumplen la regla** de no mostrar
"0" cuando significa "no calculado" — muestran "—" con comentario explícito en
el código. Ese es el patrón correcto y debe replicarse.

### Ubicación correcta del mapa

**No se elimina.** Su sitio natural es **evidencia de attendance**, no módulo
propio: lo que responde es "¿esta persona fichó donde debía?". Destino
propuesto: pestaña dentro de Operación/Asistencia, alimentada por
`location_presence` (la fuente real) en lugar de `clock_events`. **No se cambia
lógica en este pass.**

---

## 8. ARCHIVOS HUÉRFANOS — clasificación (sin borrar)

| Clase | Archivos |
| --- | --- |
| **SAFE_TO_DELETE** (10) | `EmployeeCRMTimeline`, `dashboard/AdminSummaryCard`, `dashboard/MyShiftCard`, `employee/EmployeePortalModulesPanel`, `front-desk/FrontDeskStepper`, `reconciliation/WeeklyCloseChecklist`, `shifts/assign/RecommendedForServiceBlock`, `timeclock/MonthClockView`, `lib/supabase-helpers`, `lib/export-chatgpt-prompt-pdf` |
| **LIKELY_DEAD** (3) | `reconciliation/PeriodScorecard` (¿sustituido por `ClosureQualityScorecard`?), `shifts/closeout/FinalApprovalCard`, `timeclock/HoursApprovalPanel` (su lógica vive en `lib/timeclock/hours-approval.ts`) |
| **REVIEW_REQUIRED** (7) | `profile-standard/ConsentGate` y `SourceProvenanceBadge` (foundation declarada), `shifts/ShiftLocationsSection` y `hooks/useShiftPresence` (marcados "Reutilizar" en el plan OPC), `shifts/calendar/ServiceCalendarChip` (descrito en 2 docs de UX), `hooks/useCompensationSnapshot` (espera `payroll_rate_snapshots`), `hooks/useSecurityFlags` (referenciado por nombre en el plan de refactor de auth) |
| **ACTIVE_INDIRECTLY** (0) | Verificado: `advance-deduction-engine`, `useShiftPresence` y `useSecurityFlags` **no** se usan en `supabase/`, `scripts/` ni `tests/`. `advance-deduction-engine` baja a REVIEW_REQUIRED por dependencia documental de payroll |
| **Reclasificado** | `hooks/useLexicon` sale de la lista: por §5 es **canónico y se adopta**, no código muerto |

---

## 9. BOTONES / ACCIONES — contrato canónico

Duplicación detectada en el Critical Path para la misma operación: "Nuevo
servicio", "Crear turno", "Quick Create", "Crear rápido", "Añadir", "Bulk".

Contrato propuesto (copy, no operaciones):

| Intención | Etiqueta única | Dónde vive |
| --- | --- | --- |
| Crear uno | `ADMIN_LEX.create` → "Nuevo servicio" | Acción primaria de la cabecera. Una por pantalla |
| Crear varios | "Crear varios" | Overflow de la acción primaria |
| Crear en 10 s desde el campo | "Rápido" | Solo mobile/FAB |
| Crear cliente/venue sin salir del flujo | "Crear «{texto}»" | Dentro del selector, nunca como botón de cabecera |
| Duplicar | `ADMIN_LEX.duplicate` | Menú de fila |

Regla: **una sola acción primaria visible por pantalla**; lo demás va a overflow.
Las operaciones subyacentes no cambian.

---

## 10. MATRIZ DE SUPERFICIES

| Superficie | Patrón actual | Patrón canónico | Riesgo | Acción |
| --- | --- | --- | --- | --- |
| `/app/shifts` | `OperationalWorkspace` + `ServiceEventCard` + copy mixto | Igual + lexicón | Bajo | **Hecho** (§12) |
| `/app/attendance` | `PageHeader` + tabla, "Turno"/"Empleado" | Lexicón + "Trabajador" | Bajo | **Hecho** (§12) |
| `/app/employees` | `OperationalWorkspace` + `EntityCard` | Correcto | — | Ninguna |
| `/app/clients` | `OperationalWorkspace` + `EntityCard` | Correcto | — | Ninguna |
| `/app/identity-quality` | `OperationalWorkspace` + `EntityCard` | Correcto | — | Ninguna |
| `/app/timeclock` | `OperationalScreenHeader`, sin workspace | `OperationalWorkspace` | Medio | P1 |
| `/app/payroll-review-queue` | `OperationalScreenHeader` + rama mobile | `OperationalWorkspace` responsive | Medio | P1 |
| `/app/locations` | `PageHeader` + tarjeta propia | `OperationalWorkspace` + `EntityCard` (`VN-`) | Medio | P1 |
| `/app/validation-center` | OCS puro | OCS (válido) + cabecera canónica | Bajo | P1 |
| `/app/today`, `/app/command-center` | Hero propio + OCS | Excepción justificada | — | Documentado |
| `/app/live-map` | Lienzo + KPIs mixtos | Excepción de layout; corregir fuente de datos | **Alto** | P1 (datos) |
| `/app/staffing-center` | `ShiftCard` local | `EntityCard` + `ServiceEventCard` | Medio | P1 |
| `/app/summary`, `/app/periods` | `PageHeader` + `KpiCard` | `OperationalWorkspace` | Medio | P1 |
| `MobileShiftsView` | Página paralela | Responsive por composición | **Alto** | P1 |
| `WeekByEmployeeView` | 2 JSX (mobile/desktop) | 1 árbol responsive | **Alto** | P1 |
| `DayView` | Card manual propia | `ServiceEventCard` | Bajo | P1 |
| OCS `WorkerCard`/`TeamCard` | Sistema paralelo | Delegar en `EntityCard` | Medio | P1 |
| 4 `KpiCard` locales | Copias en página | `components/ui/kpi-card` | Bajo | P1 |
| 19 huérfanos | Sin consumidor | Borrado tras revisión | Bajo | P2 |

---

## 11. BACKLOG

### P0 — Inconsistencias del Critical Path

1. Copy admin que dice "Turno" en `/app/shifts` y `/app/attendance` — **resuelto**.
2. "Con GPS" y "Fuera de zona" en Live Map inducen a error sobre la frescura del dato — requiere cambio de fuente (`location_presence`), no es quick win.
3. `Dashboard` / `Home` / `CommandCenterHub`: tres pantallas de inicio compitiendo.
4. "Empleado" vs "Trabajador" vs "Worker" en el resto del Critical Path.

### P1 — Adopción de legacy

5. `OperationalWorkspace` en TimeClock, PayrollReviewQueue, Locations, Summary, Periods, StaffingCenter.
6. OCS `WorkerCard`/`TeamCard` delegando en `EntityCard`.
7. `DayView` → `ServiceEventCard`.
8. Deshacer `MobileShiftsView` y la doble rama de `WeekByEmployeeView`.
9. Adoptar `useLexicon()` en componentes compartidos entre audiencias.
10. Eliminar las 4 `KpiCard` y las 4 `ShiftCard` locales.
11. Reubicar Live Map como evidencia de asistencia sobre `location_presence`.

### P2 — Limpieza de código muerto

12. Borrar los 10 `SAFE_TO_DELETE`.
13. Resolver los 3 `LIKELY_DEAD` verificando su sustituto.
14. Decidir los 7 `REVIEW_REQUIRED` con los dueños de payroll, auth y OPC.
15. Tokenizar `#25D366` y las 85 ocurrencias de `text-white`.
16. Partir los 5 archivos de más de 2.000 líneas.

---

## 12. IMPLEMENTADO EN ESTE PASS

Solo quick wins P0 de bajo riesgo: copy y semántica, cero lógica, cero datos.

**`src/pages/admin/Shifts.tsx`** — 10 cadenas de UI admin pasan a consumir
`ADMIN_LEX` (ya importado en el archivo):

- `saveLabel` del formulario → `ADMIN_LEX.publish`
- Aviso de servicio fuera de rango (`:795`)
- Confirmación de publicación (`:1467`)
- Errores de creación rápida (`:1542`, `:1560`) y su confirmación (`:1568`)
- Bloqueo por servicio cerrado (`:1589`)
- Fallo de guardado: título y consecuencia (`:1629-1631`)
- Confirmación de actualización (`:1712`)

**`src/pages/admin/Attendance.tsx`** — cabeceras de tabla:
`Turno` → `ADMIN_LEX.Entity`, `Turnos` → `ADMIN_LEX.EntityPlural`,
`Empleado` → `Trabajador` (unifica con la otra tabla de la misma pantalla, que ya
decía "Trabajador").

### Deliberadamente NO tocado

- **Notificaciones a trabajadores** en `Shifts.tsx:1173,1664,1756,1775`: dicen
  "Turno" y **es correcto** — audiencia worker.
- **Claves de auditoría** `crear_turno`, `editar_turno`, `publicar_turno`: son
  identificadores técnicos persistidos, no copy.
- **Título por defecto `"Turno"`** (`:1363`, `:1573`): es un **valor de dato**
  que se guarda en la fila, no una etiqueta. Cambiarlo alteraría registros.
- Todo lo demás del backlog: documentado, no tocado.

---

## QA

`tsgo --noEmit`: sin errores. `bun run build`: correcto (300 entradas precache).

Recorridos operativos a validar en 1280 / 1440 / 1920 y 390 / 430:

1. `/app/shifts` → crear servicio → publicar → editar → verificar que todos los
   avisos dicen "Servicio".
2. `/app/shifts` → creación rápida sin empresa seleccionada → el error dice
   "servicio".
3. Abrir un servicio bloqueado → el aviso dice "servicio".
4. `/app/attendance` → ambas tablas dicen "Servicio"/"Servicios" y "Trabajador".
5. Portal del trabajador → la notificación del servicio publicado sigue diciendo
   "Turno" (comportamiento correcto, no regresión).

---

## CIERRE

Stafly dejó de agregar nuevas variantes y comenzó a consolidar las superficies
operativas sobre los contratos visuales, semánticos y responsive canónicos
existentes, priorizando adopción antes que nueva arquitectura.
