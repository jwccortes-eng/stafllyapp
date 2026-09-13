# STAFLY — SOURCE OF TRUTH RECONCILIATION

**Modo:** análisis de solo lectura sobre producción + correcciones de código mínimas.
**Sin migraciones. Sin bulk updates. Sin cambios de payroll, auth, RLS ni límites de tenant.**
Referencia previa: `docs/qa/STAFLY_OPERATIONAL_SPINE_AUDIT.md`.

---

## 1. SHIFT STATE SEMANTICS

Un turno tiene **dos ejes independientes**, y hoy ambos existen y ambos son necesarios:

| Campo | Significado real | Quién escribe | Quién lee |
|---|---|---|---|
| `scheduled_shifts.publication_status` (`draft` / `published`) | ¿Es visible y vinculante para trabajadores? | `publish_shift_draft`, `bulk-create-write.ts`, import | `publication-truth.ts`, portal, `visibility.ts` |
| `scheduled_shifts.status` (`scheduled`, `in_progress`, `completed`, `cancelled`…) | ¿En qué punto del día operativo está? | `cancel_shift`, cierre de turno, operaciones | Command centers, `derive-shift-ops-state.ts` |

**No son duplicados**: uno responde "¿existe para el mundo?", el otro "¿qué está pasando con él?".
Lo que sí falta es una **lectura combinada** y ésa ya existe derivada en
`src/lib/operations/derive-shift-ops-state.ts` + `src/lib/shifts/publication-truth.ts`.

**Candidato canónico:** `publication_status` para visibilidad, `status` para ciclo de vida,
**estado operativo visible = derivado** de ambos + asignaciones + fichajes. **No hace falta
ninguna columna nueva de estado.**

## 2. 5 INCONSISTENT SHIFT RECORDS

`36004fca…` (QK-001545), `74043a9d…` (QK-001546), `d8049ebc…` (QK-001547),
`17b9e779…` (MSS-000075), `66744fd6…` (JS-000003).

Hallazgos: creados el 2026-08-01, **sin `import_batch_id`, 0 asignaciones, 0 fichajes,
fechas ya pasadas**. Impacto operativo: **ninguno**. Nadie fue afectado.

Causa raíz encontrada: `cancel_shift` (migración `20260801223954…sql`, líneas 134-139)
cambia `status` a `cancelled` **sin tocar `publication_status`**. Resultado en producción:
21 filas `draft + cancelled` y 4 `published + cancelled`. Es un residuo semántico, no
corrupción.

**Decisión:** no se ejecuta ninguna corrección de datos. Un turno cancelado ya se filtra
por `status`, y la combinación es interpretable. La corrección correcta es en el RPC
(sección 11), no en las filas.

## 3. ASSIGNMENT / RESPONSE SEMANTICS

| Evidencia canónica | Fuente | Derivado o almacenado | Etiqueta en UI |
|---|---|---|---|
| Asignación creada | `shift_assignments` (fila existe) | almacenado | Asignado |
| Decisión de la administración | `shift_assignments.status` | almacenado | Asignado / Retirado |
| Persona notificada | `last_notified_at` | almacenado (irregular) | UNKNOWN histórico |
| Respuesta pendiente | `response_status = 'pending'` | almacenado | Esperando respuesta |
| **Persona aceptó** | `response_status='accepted'` **+** `accepted_at`/`responded_at` | almacenado | Confirmado por la persona |
| Persona rechazó | `response_status='rejected'` / `rejected_at` | almacenado | Rechazado |
| Requiere reconfirmar | `response_status='needs_reacceptance'` | almacenado | Debe reconfirmar |
| Retirado / reemplazado | `status` excluido | almacenado | Retirado |
| Trabajo real | `time_entries.clock_in` | almacenado | Fichó / Trabajó |
| Apto para nómina | `time_entries.status='approved'` + ajustes aprobados | almacenado | Aprobado |

`status` = eje administrativo. `response_status` = eje del trabajador. **Nunca son sinónimos.**

## 4. 5,809 RECORD ANALYSIS

- 3.820 `accepted` + `pending`, 1.989 `confirmed` + `pending`.
- **0 tienen `accepted_at`.** Todas pertenecen a turnos **ya pasados**. Sólo 165 tienen fichaje.
- `import_batch_id` sólo está en 121 de 5.809: **no sirve como discriminador**.
- `assign_worker_to_shift` siempre inserta `pending/pending`; sólo
  `worker_respond_to_shift_assignment` mueve ambos ejes a la vez.
  `ImportSchedule.tsx` y `migration-schedule-sync` escriben **sólo `status`**, dejando
  `response_status` en su DEFAULT.

**Veredicto: NO es corrupción.** Son rosters administrativos/importados donde nunca hubo un
acto del trabajador. Históricamente **no se puede saber** si alguien fue notificado: eso se
reporta como **UNKNOWN**, no se inventa. **No se actualizó ninguna fila.**

## 5. MOBILE VS DESKTOP HOURS DISCREPANCY

Dos preguntas distintas con el mismo nombre:

- Today Hub (`TodayHubView.tsx`): `time_entries.clock_out IS NULL` → **4** = reloj abierto.
- Home móvil (`MobileAdminHome.tsx`): `time_entries.status='pending'` → **28** = sin aprobar.

Ambos números eran correctos; la etiqueta era falsa. Definición canónica adoptada
(`src/lib/operations/operational-counts.ts`):

- **HOURS NEEDING REVIEW** = `time_entries.status='pending'` (cola previa a nómina).
- **OPEN CLOCK** = `clock_out IS NULL` (en turno o falta marcar salida).

Ambas superficies ahora leen del mismo módulo. Las horas planificadas nunca intervienen.

## 6. ATTENDANCE BLOCK ROOT CAUSE

`UnifiedPersonProfile.tsx` consultaba `scheduled_shifts.employee_id`, **columna que no
existe** (sólo existe `driver_employee_id`), sin comprobar el error → siempre "No shifts".
Los turnos de una persona viven en `shift_assignments`.

**Conducta elegida:** reemplazar por una métrica verdadera con datos existentes
(asignaciones vivas de 30 días vs. fichajes reales) y, si la fuente falla, mostrar
"—" / "Attendance source unavailable" en lugar de un cero inventado.

## 7. FIVE COMMAND CENTER SURFACES

| Ruta | Audiencia | Propósito | Clasificación |
|---|---|---|---|
| `/app/command-center` (`CommandCenterHub.tsx`) | Admin / manager | Entrada operativa general | **CANONICAL** |
| `/app` (`Home.tsx`) | Todos los roles admin | Aterrizaje y accesos | CONTEXTUAL VIEW |
| `/app/daily-ops` (`DailyOps.tsx`) | Operaciones | Día en curso; mejor arquitectura (`useTodayOperations` + `daily-ops-grouping`) | CONTEXTUAL VIEW |
| `/app/ops-center` (`OperationsCommandCenter.tsx`) | Operaciones | Panel alterno, reimplementa métricas inline | CONTEXTUAL VIEW |
| `/app/command-center-classic` (`CommandCenter.tsx`) | Legado | Versión previa del hub | **LEGACY — RETIRE** |

Entrada canónica recomendada: **`/app/command-center`**, con la pestaña "hoy" reutilizando
el pipeline de DailyOps. **No se removió ninguna ruta en esta tarea.**

## 8. CANONICAL DATA SOURCES

- Visibilidad de servicio → `scheduled_shifts.publication_status`
- Ciclo de vida del servicio → `scheduled_shifts.status`
- Roster / decisión admin → `shift_assignments.status`
- Respuesta del trabajador → `shift_assignments.response_status` + timestamps
- Trabajo real → `time_entries`
- Nómina → `time_entries` aprobados + ajustes aprobados (**única autoridad de pago**)

## 9. DERIVED STATES

Sin persistencia nueva: `publication-truth.ts`, `derive-shift-ops-state.ts`,
`staffing-metrics.ts`, `attendance-truth.ts`, `closeout-gate.ts`, y los dos nuevos
`assignment-response-truth.ts` y `operational-counts.ts`.

## 10. LEGACY / DUPLICATED STATES

- `status === 'confirmed'` leído como "la persona confirmó" en ~10 superficies
  (`EmployeeProfileTabs`, `ShiftDetailDialog`, `MobileShiftTeamHub`, `MobileShiftsView`,
  `OperationsCommandCenter`, `ShiftOperations`, `next-best-action`, `publication-truth`).
- `OperationsCommandCenter.tsx` reimplementa staffing/attendance inline.
- `DailyCloseKpiPanel.tsx` reimplementa `isPublishedShift`.
- `/app/command-center-classic` duplica el hub.

## 11. REQUIRED DATA FIXES

Ninguno urgente. Pendientes propuestos, **no ejecutados**:

1. `cancel_shift` debería dejar constancia de la cancelación sin contradecir la publicación
   (cambio de RPC, requiere autorización explícita).
2. Rutas de import deberían escribir `response_status` explícitamente para que el eje del
   trabajador no herede un DEFAULT engañoso.
3. Las 5.809 filas **se quedan como están**: reescribirlas destruiría la única señal de que
   nunca hubo respuesta.

## 12. REQUIRED CODE FIXES

Aplicados en esta tarea (sólo presentación y selectores, sin escritura):

- **Nuevo** `src/lib/operations/operational-counts.ts`: definición única de "horas por
  revisar", "reloj abierto" y "respuestas pendientes".
- **Nuevo** `src/lib/shifts/assignment-response-truth.ts` (+ pruebas): nunca afirma
  confirmación del trabajador sin evidencia; devuelve `unknown` antes que inventar.
- `TodayHubView.tsx` y `today-hub-model.ts`: separan horas por revisar de reloj abierto.
- `MobileAdminHome.tsx`: usa los contadores compartidos y corrige "respuestas pendientes",
  que medía `status='pending'` (646 filas) en vez de `response_status='pending'` sobre
  servicios publicados de hoy en adelante.
- `UnifiedPersonProfile.tsx`: bloque de asistencia sobre `shift_assignments` + `time_entries`,
  con degradado honesto si la fuente falla.

Pendiente para una tarea posterior: adoptar `assignment-response-truth` en las ~10 superficies
que etiquetan "Confirmado" leyendo sólo `status`.

## 13. PRODUCTION MUTATIONS

**Ninguna.** Cero UPDATE, cero INSERT, cero DELETE, cero migraciones, cero correos.
Todo el trabajo de base de datos fue de lectura.

## 14. PAYROLL SAFETY CHECK

Sin cambios en fórmulas, en `time_entries`, en ajustes aprobados ni en `pay_statements`.
Los contadores nuevos sólo cuentan filas; nunca calculan pago ni usan horas planificadas.
Payroll sigue apoyándose exclusivamente en fichajes reales y ajustes aprobados.

## 15. TENANT / RLS SAFETY CHECK

Sin cambios de RLS, políticas, permisos ni límites de compañía. Todas las consultas nuevas
van filtradas por `company_id`, igual que las que reemplazan.

## 16. RECOMMENDED NEXT STEP

Con la semántica ya fijada y compartida, el siguiente paso es **unificar la etiqueta de
"Confirmado"** en las superficies restantes usando `assignment-response-truth`, y sólo
después consolidar `/app/command-center` como entrada canónica retirando
`/app/command-center-classic`. La corrección de `cancel_shift` requiere autorización aparte.

---

🟡 SEMANTICS RESOLVED — CONTROLLED DATA CLEANUP REQUIRED
