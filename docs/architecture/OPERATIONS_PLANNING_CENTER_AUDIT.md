# Operations Planning Center — Arquitectura y Auditoría de Reutilización

**Modo:** Read-only. Sin código, sin migraciones, sin writes.
**Fecha:** 2026-07-21
**Alcance:** Determinar qué infraestructura existente del proyecto sostiene un futuro **Operations Planning Center (OPC)** — el módulo que permite al operador pensar en *operaciones multi-día* (contenedor de N turnos + N roles + N ubicaciones) en lugar de turnos sueltos, con asistencia IA para intake, plantillas/variaciones y despacho asistido.

> ⚠️ Nota de alcance: el usuario no adjuntó el bloque de "scope funcional del OPC" en este sprint. La auditoría cubre la superficie técnica que cualquier variante razonable del OPC necesitaría (intake → plan → despacho → publicación → seguimiento). Los gaps se anotan como **inferencias**, no como veredictos.

---

## 1. Resumen ejecutivo

| Capa OPC | Estado | Evidencia |
|---|---|---|
| Intake libre (texto → plan) | **No existe** | No hay archivos `staff-planning` / `planning-ai` en `src/` ni `supabase/functions/` |
| Motor de recomendación por turno | **Existe y maduro** | `src/lib/shifts/worker-recommendation.ts`, `src/core/dispatch-engine.ts` |
| Despacho asistido / semi-auto / auto | **Existe** | `src/lib/auto-dispatch.ts`, `src/lib/dispatch-writers.ts` |
| Creación rápida de turnos (single) | **Existe** | `src/components/shifts/workspace/QuickCreateWorkspace.tsx`, `QuickCreatePopover.tsx` |
| Plantillas rápidas (presets seguros) | **Existe (v2)** | `src/components/shifts/workspace/quick-templates.ts` |
| Repetición / bulk creation | **Existe parcial** | `ShiftRepeatSection.tsx` (weekdays/range/next_n) + `bulk-import-shifts` edge fn |
| Contenedor "operación multi-día" | **No existe como entidad** | No hay tabla `operations_plan` / `shift_template` en `src/integrations/supabase/types.ts` |
| Aproximación funcional al contenedor | **Existe vía Service Requests** | `service_requests`, `service_request_items`, `service_request_shift_links` en `types.ts` |
| Disponibilidad de trabajadores | **Existe** | `employee_availability_config`, `employee_availability_overrides` (`useEmployeeAvailability.tsx`) |
| Command Centers / cockpits | **Existe (múltiples)** | `CommandCenterHub`, `OpsHome`, `OperationsCommandCenter`, `DailyOps`, `ShiftOperations` |
| Ops Intelligence (alertas, coverage) | **Existe** | `src/core/operations-intelligence.ts`, `src/lib/operations-intelligence.ts` |
| Fase del turno / semáforo | **Existe** | `src/lib/shifts/shift-phase.ts`, `closeout-review-status.ts` |
| Integraciones externas (Connecteam) | **Existe (export)** | `src/lib/integrations/connecteam-export.ts`, `bulk-import-shifts` edge fn |

**Conclusión ejecutiva:** El 70–80% de las piezas necesarias para el OPC ya existen y están probadas. Las únicas piezas verdaderamente nuevas son (a) **el modelo mental de "Operación"** como contenedor, y (b) **el parser LLM** para intake libre. Todo el resto es *conectar* superficies existentes.

---

## 2. Hechos confirmados en el código

### 2.1 Motor de recomendación y despacho (COMPLETO)

- **`src/lib/shifts/worker-recommendation.ts`** exporta `rankCandidate(input: ScoreInput): RankedCandidate` con `RecommendationSignals`, `ReasonChipKey`, `REASON_CHIP_LABEL`, e `inferShiftRoleNeeds()`. Es el scorer determinístico por trabajador↔turno.
- **`src/core/dispatch-engine.ts`** expone `getCandidatesForShift`, `computeMatchScore`, `suggestAssignments`, `executeDispatch` y `CORE_DISPATCH_GUARDS`. Es la capa product-agnostic (STAFly/Parceros).
- **`src/lib/auto-dispatch.ts`** implementa `evaluateDispatchActions`, `executeAutoDispatch`, `AUTO_DISPATCH_DEFAULTS`, `AUTO_SAFETY`, y los niveles `off | assist | semi_auto | full_auto`.
- **`src/lib/dispatch-writers.ts`** contiene el único punto de write: `applyDispatchPlan(plan: DispatchPlan)`. Esto es crítico: **existe una separación limpia lectura/escritura** que el OPC puede reutilizar sin duplicar guardrails.
- **`supabase/functions/ai-workforce/index.ts`** ya usa `LOVABLE_API_KEY` con el Lovable AI Gateway para sugerencias — patrón replicable para el parser LLM del OPC.

### 2.2 Creación / edición de turnos (COMPLETO para unidades sueltas)

- **`src/components/shifts/workspace/QuickCreateWorkspace.tsx`** — workspace completo de creación rápida (usado por `Shifts.tsx`, `ServiceRequests.tsx`, `MobileShiftsView.tsx`, `DayView.tsx`, `MonthView.tsx`, `WeekView.tsx`, `QuickCreatePopover.tsx`, `MobileQuickCreateShiftSheet.tsx`).
- **`src/components/shifts/workspace/quick-templates.ts`** — v2 de presets con `SAFE_KEYS` allowlist (`title, slots, notes, specialInstructions, transportNotes, startTime, endTime, meetingTime, transportRequired, payType, dayType`) y política "fill empty only". Ya cubre `event_regular`, `weekend_job`, `event_by_hour`, `event_by_day`, `setup`, `kitchen_floor_mixed` + legacy roles.
- **`src/components/shifts/ShiftRepeatSection.tsx`** — repetición nativa con `RepeatConfig` (`weekdays | range | next_n`, `copyAssignments`).
- **`src/pages/admin/BulkImportShifts.tsx`** + **`supabase/functions/bulk-import-shifts/index.ts`** — pipeline masivo con esquema `ShiftRow` completo (16+ columnas Connecteam-compat).

### 2.3 Contenedor multi-turno hoy: `service_requests`

Confirmado en `src/integrations/supabase/types.ts`:
- Tabla **`service_requests`** (referenciada por FKs en líneas 1103–1107, 13104–13107, 13142–…).
- Tabla **`service_request_items`** (líneas 13039–13108) con `role_type`, `billing_unit`, `service_request_id`.
- Tabla **`service_request_shift_links`** (líneas 13112–…) — **este es el puente ya existente entre "petición" (contenedor) y "turnos" (unidades)**.
- Componentes UI: `src/components/service-requests/{QuickCreateRequestDialog, ConvertToShiftDialog, FulfillmentTable, RequestDetailDrawer, ShiftRoleSlotsPanel}.tsx` + páginas `ServiceRequests.tsx`, `ServiceCategories.tsx`, `ShiftRequests.tsx`.

**Este es el hallazgo arquitectónico más importante de la auditoría**: el "contenedor operación" que el OPC necesita **ya existe conceptualmente** como Service Request → N `service_request_items` (roles) → N `service_request_shift_links` (turnos generados).

### 2.4 Disponibilidad y compliance

- `src/hooks/useEmployeeAvailability.tsx` lee `employee_availability_config` y `employee_availability_overrides`.
- `src/hooks/useWorkerAvailability.tsx`, `useWorkerCompliance.tsx`, `useWorkerConsent.tsx`, `useWorkerPassport.tsx`, `useEmployeeReadiness.tsx`, `useEmployeeReputation.tsx`, `useEmployeeReviewStats.tsx` — señales listas para alimentar el ranking.

### 2.5 Cockpits ya construidos (evitar duplicar)

Rutas en `src/App.tsx`:
- `/app/command-center` → `CommandCenterHub`
- `/app/command-center-classic` → `CommandCenter`
- `/app/dev-command-center`, `/app/owner-command-center` → `DevCommandCenter`
- `/app/shift-ops` → `ShiftOperations`
- `/app/ops-center` → `OperationsCommandCenter`
- `/app/daily-ops` → `DailyOps`
- `/app/ops` → `OpsHome`

`OpsHome.tsx` está documentado como "pure SHELL that reuses existing hooks and deep-links to canonical destinations" — es el patrón arquitectónico que el OPC debería seguir.

### 2.6 Ops Intelligence / fase / cierre

- `src/core/operations-intelligence.ts` re-exporta `generateAlerts`, `computeCoverage`, `detectNoShowSpike`, `summarizeAlerts` con tipos `OpsAlert`, `ShiftCoverage`.
- `src/lib/shifts/shift-phase.ts` — chip de fase (staffing / en curso / cierre).
- `src/lib/shifts/closeout-review-status.ts` — badge PRQ.
- `src/lib/shifts/worker-recommendation.ts` + `src/lib/shifts/pending-flags.ts` + `readiness-grace.ts`.

### 2.7 Guardrails y separación de dominios (documentado en código)

En `src/core/README.md`:
> 1. Read-only by default. Side-effecting writers live in `src/lib/dispatch-writers.ts`.
> 5. Never touches `attendance-resolver`, payroll, `time_entries`.

En `quick-templates.ts`:
> "Fill empty only" — never overwrites operator input.
> Never touches client, locations, meeting point, assigned workers, publication status, payroll truth, traceability, or pay overrides.

Estas invariantes ya están escritas y probadas; el OPC hereda gratis los guardrails.

---

## 3. Inferencias (no verificadas exhaustivamente)

1. **El modelo de "Operación" puede reutilizar `service_requests`** sin crear tabla nueva. Un OPC MVP podría tratar cada `service_request` como una "Operación", cada `service_request_item` como un "rol requerido multi-día", y usar `service_request_shift_links` como el materializado. *Requiere confirmar que la semántica actual (billing) tolera el uso como contenedor de planificación operativa.*
2. **El parser LLM (intake libre → plan)** es la única pieza que requiere edge function nueva. El patrón `ai-workforce/index.ts` es replicable 1:1 (Lovable AI Gateway, JWT, timeout, fallback a edición manual).
3. **La "variación de plan"** ("como la anterior pero con 2 menos y un día extra") no está resuelta hoy. El diff estructural entre operaciones parece ausente del código actual (no encontré `plan_diff`, `operation_snapshot`, ni utilidades de comparación estructural en `src/lib/shifts/`).
4. **El OpsHome ya establece la convención "shell + deep-link"** que el OPC debería seguir para no fragmentar cockpits.

---

## 4. Gaps reales del OPC (lo único verdaderamente nuevo)

| Gap | Justificación (evidencia negativa) |
|---|---|
| **Intake conversacional / parser LLM** | `rg 'staff.planning\|planning-ai\|planning_ai'` → 0 resultados en `src/` y `supabase/` |
| **Modelo mental "Operación" como ciudadano de primera clase en UI** | Hoy `ShiftOperations.tsx` es *por turno*; no hay pantalla "una operación = N días × N roles" navegable |
| **Diff / variación entre planes** | No hay helper `diffOperations`, `snapshotOperation`, `applyDelta` en `src/lib/shifts/` |
| **Preview transaccional del plan antes de commit** | `dispatch-writers.ts` es turno-a-turno; no existe `applyOperationPlan` que agrupe N inserts + N asignaciones bajo una intención única |
| **Ruta y shell del OPC** | Ninguna ruta `staff-planning`, `operations-planning`, `plan-center` en `src/App.tsx` |

---

## 5. Recomendaciones (no implementar aún)

**R1 — Adoptar `service_requests` como contenedor semántico del OPC.** Antes de proponer tablas nuevas, validar que el schema actual (`service_requests` + `_items` + `_shift_links`) tolera un uso adicional como "plan operativo". Si tolera → cero migraciones. Si no → una única tabla `operation_plans` referenciando `service_request_id` opcional.

**R2 — El OPC debe ser un shell tipo `OpsHome`.** Reutilizar:
- `QuickCreateWorkspace` para editar cada turno derivado.
- `worker-recommendation` + `dispatch-engine` para sugerencias por rol.
- `auto-dispatch` (nivel `assist`) para propuestas grupales.
- `quick-templates.ts` v2 como paleta de "tipos de operación".
- `ShiftRepeatSection` para el eje temporal multi-día.
- `operations-intelligence` para el panel de riesgo del plan.

**R3 — Parser LLM como única edge function nueva.** Modelar `supabase/functions/operations-plan-parse/` copiando el esqueleto de `ai-workforce/index.ts` (auth JWT, `LOVABLE_API_KEY`, corsHeaders idénticos, fallback a JSON vacío → edición manual). Output: `{ operations: [{ title, dateRange, roles: [{ type, count, timeWindow }], location, notes }] }`.

**R4 — No duplicar cockpits.** Antes de crear `/app/operations-planning-center`, decidir explícitamente si se fusiona con `/app/ops`, `/app/shift-ops` o `/app/service-requests`. Hoy hay 7 rutas de cockpit; añadir una octava sin retirar otra es un anti-patrón operativo.

**R5 — Introducir `diffOperationPlan` como helper puro en `src/lib/shifts/`** (nuevo archivo, sin schema). Es la pieza que habilita la "variación mágica" del modelo mental Keury sin tocar BD.

**R6 — Escribir SIEMPRE a través de `dispatch-writers.ts`.** Si el OPC necesita commits atómicos (crear operación + N turnos + N asignaciones en una intención), extender `dispatch-writers.ts` con `applyOperationPlan(plan)`; **no** introducir un writer paralelo.

---

## 6. Lo que **NO** debemos volver a construir

- ❌ Otro picker de trabajadores → usar `SingleEmployeePicker.tsx`, `EmployeeCombobox.tsx`, `WorkerPreviewCard.tsx`.
- ❌ Otro scorer → `rankCandidate` en `worker-recommendation.ts`.
- ❌ Otro motor de despacho → `dispatch-engine.ts` + `auto-dispatch.ts`.
- ❌ Otro sistema de plantillas → `quick-templates.ts` v2.
- ❌ Otro parser de bulk → `bulk-import-shifts` edge fn.
- ❌ Otro exportador Connecteam → `connecteam-export.ts`.
- ❌ Otro cockpit "hub" → `OpsHome.tsx` establece el patrón shell.
- ❌ Otra capa de alertas → `operations-intelligence.ts`.
- ❌ Otra tabla contenedora antes de descartar `service_requests`.

---

## 7. Validaciones read-only realizadas en esta auditoría

- `ls` estructural: `src/lib/shifts/`, `src/core/`, `src/components/shifts/{workspace,smart,ops,integrations}`, `supabase/functions/`, `src/pages/admin/`.
- `rg` de superficies exportadas: `worker-recommendation.ts`, `auto-dispatch.ts`, `dispatch-writers.ts`, `dispatch-engine.ts`.
- `rg` de rutas en `src/App.tsx` (filtro `ops|plan|shift|command|quick|bulk|service`).
- `rg` en `src/integrations/supabase/types.ts` para presencia de `service_request*`, `shift_template`, `planning_session`, `operations_plan`.
- Lectura de headers/JSDoc de `OpsHome.tsx`, `OperationsCommandCenter.tsx`, `CommandCenter.tsx`, `quick-templates.ts`, `ShiftRepeatSection.tsx`, `bulk-import-shifts/index.ts`, `ai-workforce/index.ts`, `core/README.md`.
- Cero writes. Cero llamadas a `supabase--migration`. Cero cambios en archivos existentes.

---

## 8. Preguntas abiertas para el siguiente sprint (aún de diseño)

1. ¿La "Operación" del OPC se materializa sobre `service_requests` o merece entidad propia? Depende de si billing y planning deben poder divergir.
2. ¿El OPC reemplaza a `/app/shift-ops` (pasa a ser vista táctica dentro de una operación) o coexiste?
3. ¿El parser LLM devuelve JSON estructurado directamente utilizable por `QuickCreateWorkspace`, o pasa primero por una capa de "propuesta editable" tipo `PrePublishDialog.tsx`?
4. ¿La variación entre planes (`diffOperationPlan`) es un requisito MVP o v2?
5. ¿Qué cockpit de los 7 actuales absorbe el OPC como sub-shell, y cuáles se retiran?

---

**Fin del reporte. Nada más se modificó en el repositorio.**
