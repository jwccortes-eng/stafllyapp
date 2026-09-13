# STAFLY OPERATIONAL SPINE AUDIT
### Command Center + Shift Lifecycle + Worker Operational Profile

**Fecha:** 2026-09-13
**Modo:** READ-ONLY AUDIT. Cero migraciones, cero tablas nuevas, cero estados nuevos,
cero escrituras de producción, cero cambios de permisos, cero fixes automáticos.
**Alcance:** mapa de datos operativo, ciclo de vida del turno, Command Center,
ficha operativa del trabajador, next-action, fricción de flujo, benchmark
Connecteam, silos, mobile, tenant/seguridad.

---

## 1. EXECUTIVE SUMMARY

Stafly **ya tiene la columna vertebral operativa completa**: turnos, asignaciones,
respuestas de worker, fichajes, documentos, cierre, revisión de horas y payroll
existen como datos canónicos, y encima hay una capa madura de **derivación pura**
(`src/lib/shifts`, `src/lib/operations`, `src/lib/people`, `src/lib/timeclock`)
con módulos que ya declaran explícitamente ser "fuente única" de su vocabulario.
Esa capa es el activo más valioso del sistema y es exactamente el cimiento que
pide la unificación de UX: **no hace falta crear tablas ni estados nuevos** para
responder "¿qué necesita atención?", "¿qué pasa con este turno?" y "¿qué pasa
con esta persona?".

Sin embargo, la auditoría encontró **cuatro verdades duplicadas activas en datos
de producción** y **un bug de consulta en la ficha del trabajador**, que harían
que una UX unificada amplifique errores en lugar de corregirlos:

| # | Hallazgo | Evidencia en producción |
|---|---|---|
| 1 | `scheduled_shifts` mantiene dos columnas de ciclo de vida (`status` texto libre + `publication_status` enum) que se sincronizan a mano | 5 turnos con `publication_status='published'` y `status='draft'`; además `open`, `confirmed`, `locked`, `completed` conviven sin contrato |
| 2 | `shift_assignments.status` (decisión admin) y `response_status` (respuesta del worker) se leen como si fueran lo mismo en varias superficies | **5.809 filas** con `status IN (accepted, confirmed)` pero `response_status='pending'` |
| 3 | "Horas pendientes" tiene dos definiciones distintas en dos pantallas de inicio | `time_entries.status='pending'` = 28 filas vs `clock_out IS NULL` = 4 filas |
| 4 | Cinco rutas paralelas de "centro de mando" | `/app`, `/app/command-center`, `/app/command-center-classic`, `/app/ops-center`, `/app/daily-ops` |
| 5 | La ficha del trabajador consulta una columna inexistente | `scheduled_shifts.employee_id` no existe (solo `driver_employee_id`) → Asistencia·30d siempre vacía |

Ninguno de estos hallazgos es un riesgo de payroll ni de aislamiento de tenant:
el cálculo de nómina sigue anclado a `time_entries` reales + ajustes aprobados, y
todas las consultas auditadas están filtradas por `company_id`. Son riesgos de
**verdad operativa mostrada al admin**.

**Veredicto de una línea:** la espina dorsal está lista conceptualmente, pero hay
que consolidar los cuatro duplicados de verdad y corregir el bug de la ficha
antes de construir la capa de UX unificada encima.

---

## 2. CURRENT OPERATIONAL DATA MAP

### 2.1 Tablas canónicas y sus campos de estado

| Entidad | Tabla | Campos de estado | Timestamps de evento |
|---|---|---|---|
| Servicio/Turno | `scheduled_shifts` | `status` (text libre), `publication_status` (enum `draft\|published\|cancelled\|archived`) | `created_at`, `updated_at`, `published_at/by`, `cancelled_at/by`, `deleted_at` |
| Asignación | `shift_assignments` | `status` (text), `response_status` (text), `attendance_status` (text), `is_draft_reservation` (bool) | `created_at`, `responded_at`, `accepted_at`, `rejected_at`, `removed_at`, `last_notified_at`, `attendance_validated_at` |
| Fichaje | `time_entries` | `status` (`pending\|approved\|rejected`), `requires_time_review` | `clock_in`, `clock_out`, `approved_at/by` |
| Evidencia de reloj | `clock_events` | `type`, `punctuality`, `is_payroll_relevant` | `created_at` |
| Documento | `employee_documents` | `review_status` | `reviewed_at`, `expires_at` |
| Persona | `employees` | `profile_status` (enum), `identity_status`, `onboarding_status`, `payroll_approval_blocked`, `is_active`, `user_id` | `created_at`, `updated_at` |
| Ubicación | `locations`, `locations_v2` | `status`, `location_type` (enum `job_site\|meeting_point\|…`) | `deleted_at` |
| Periodo | `pay_periods` | `status`, `reconciliation_status` | `closed_at`, `published_at`, `paid_at` |
| Recibo | `pay_statements` | `status` | `approved_at`, `published_at`, `revoked_at` |
| Solicitud de servicio | `service_requests` | `status` (enum de 9 valores) | `cancelled_at` |
| Cierre | `shift_closeouts` (vía `src/lib/shifts/closeout.ts`) | `status`, `review_status`, `final_approval_status` | — |

**Observación estructural:** la mayoría de estados operativos son `text` sin
CHECK ni enum. El vocabulario se impone solo en TypeScript.

### 2.2 Capa de derivación (el verdadero "motor")

| Módulo | Verdad que posee | Export principal |
|---|---|---|
| `shifts/shift-guards.ts` | ¿Es borrador / publicado / cancelado? | `isDraftShift`, `isPublishedShift` |
| `shifts/publication-truth.ts` | Estado combinado turno×asignación (11 estados) + anomalías | `resolveShiftPublicationTruth` |
| `shifts/assignment-status-truth.ts` | Vocabulario canónico de `status` de asignación | `isOperationalAssignmentStatus`, `isCommittedAssignmentStatus` |
| `shifts/staffing-metrics.ts` | Cobertura vs confirmación | `getShiftStaffingMetrics` |
| `shifts/attendance-truth.ts` | 8 estados de asistencia desde fichajes | `deriveAttendanceTruth` |
| `shifts/attendance-evidence.ts` | Evidencia real vs validación admin | `getAttendanceEvidenceState`, `getPayrollReviewFlags` |
| `shifts/closeout-gate.ts` | Cierre enviado ≠ reconciliado ≠ listo para pago | `evaluateCloseoutGate` |
| `shifts/publish-readiness.ts` / `service-publish-readiness.ts` | Bloqueadores previos a publicar | `evaluatePublishReadiness`, `getServicePublishReadiness` |
| `operations/derive-shift-ops-state.ts` | Bucket operativo del día + nivel de alerta | `deriveShiftOpsState` |
| `operations/daily-ops-grouping.ts` | Cola de acciones del día | `buildActionQueue` |
| `people/person-status.ts` | Identidad / portal / cumplimiento / asignabilidad | `resolvePersonStatus` |
| `portal/portal-status.ts` | Acceso real al portal | `resolvePortalStatus` |
| `timeclock/clock-status.ts` | ¿Puede fichar entrada/salida? | `resolveClockStatus` |
| `shifts/team-hub-model.ts`, `command-center/today-hub-model.ts` | Composición de tarjetas/alertas | `buildTodayHubModel` |

### 2.3 Mutaciones (todas vía RPC, no escritura directa)

`assign_worker_to_shift`, `remove_worker_from_shift`, `set_shift_assignment_state`,
`versioned_assignment_transition`, `worker_respond_to_shift_assignment`,
`versioned_update_shift`, `cancel_shift`, `publish_shift_draft`,
`request_time_entry_correction`, `review_time_entry_correction`,
`versioned_update_time_entry`, `review_employee_document`,
`consolidate_period_base_pay`, `publish_pay_statement`,
`bulk_publish_pay_statements`, `shift_closeout_can_final_approve`.

Esto es una fortaleza: **la escritura ya está centralizada y auditada** (política VWC).

---

## 3. CURRENT SHIFT LIFECYCLE

Para cada etapa conceptual: ¿derivable hoy?, ¿desde dónde?, ¿estado almacenado?,
¿conflicto?, ¿qué evento avanza?, ¿qué bloquea?, ¿qué acción admin y dónde?

| Etapa | Derivable hoy | Fuente canónica | Estado almacenado | Conflicto | Evento que avanza | Bloqueo | Acción admin |
|---|---|---|---|---|---|---|---|
| **CREATED / DRAFT** | ✅ | `publication_status='draft'` | Sí | `status` puede decir `open` o `draft` indistintamente (52 vs 31 filas) | `publish_shift_draft` | Faltan Job Site / horario / cobertura | `/app/shifts` → editar |
| **PUBLISHED** | ✅ | `publication_status='published'` + `published_at` | Sí | **5 filas publicadas con `status='draft'`** | RPC de publicación | `evaluatePublishReadiness` blockers | `/app/shifts` (bulk publish) |
| **NEEDS STAFF** | ✅ | `getShiftStaffingMetrics().assignedActive < required` | ❌ derivado | Ninguno | Asignar worker | Sin candidatos asignables | `/app/shift-ops?tab=team` |
| **PARTIALLY STAFFED** | ✅ | `0 < assignedActive < required` | ❌ derivado | Ninguno | Asignar worker | — | Igual |
| **STAFFED** | ✅ | `assignedActive >= required` | ❌ derivado | Ninguno | — | — | — |
| **WORKER RESPONSE PENDING** | ⚠️ | `response_status='pending'` | Sí | **5.809 filas dicen `accepted/confirmed` en `status` y `pending` en `response_status`** | Worker acepta desde el portal | Sin portal activo / sin notificación | `/app/shift-ops?tab=team` (mensaje) |
| **CONFIRMED** | ⚠️ | `getShiftStaffingMetrics().confirmed` | Parcial | `needs_reacceptance` invalida aceptación previa (bien resuelto) | Aceptación real | Cambio material del turno | Igual |
| **READY** | ✅ | `getServiceLifecycleReadiness` / `getShiftMissingItems` | ❌ derivado | Ninguno | Resolver bloqueadores | Job Site, conductor, punto de encuentro | `/app/shift-ops` |
| **IN PROGRESS** | ✅ | `deriveShiftOpsState` → `in_progress` (reloj + ventana horaria) | ❌ derivado | Ninguno | Primer clock-in | — | `/app/daily-ops` |
| **COMPLETED** | ⚠️ | `deriveShiftOpsState` → `closed` | Sí (`status='completed'`, solo 4 filas) | La columna casi no se usa; la verdad es derivada | Fin de ventana + sin relojes abiertos | Clock-out faltante | `/app/timeclock` |
| **NEEDS HOURS REVIEW** | ✅ | `getPayrollReviewFlags` + `time_entries.status='pending'` (28) | Sí | Definición divergente entre pantallas (ver §11) | Aprobación de horas | Evidencia ausente | `/app/payroll-review-queue` |
| **APPROVED** | ✅ | `time_entries.status='approved'` + `closeout.final_approval_status` | Sí | Ninguno | Aprobación con autoridad | `pendingHours > 0` | `/app/daily-close` |
| **READY FOR PAYROLL** | ✅ | `evaluateCloseoutGate` → `PAYROLL_READY` | ❌ derivado | Ninguno | Firma final | Bloqueadores del gate | `/app/payroll-review-queue` |

**Anomalía nombrada y reconocida por el propio código:**
`PUBLISHED_WITH_DRAFT_RESERVATIONS` (`publication-truth.ts`) — el servicio está
publicado pero la asignación sigue siendo reserva tentativa. El resolver la
detecta explícitamente en vez de ocultarla. Correcto, pero indica que la base de
datos no impide el estado inconsistente.

---

## 4. COMMAND CENTER — CURRENT STATE

### 4.1 Superficies existentes (cinco rutas)

| Ruta | Componente | Qué es | Fuente |
|---|---|---|---|
| `/app` (desktop) | `Home.tsx` → `TodayHubView` | Hub del día | `useTodayOperations` + `buildTodayHubModel` |
| `/app` (móvil) | `MobileAdminHome.tsx` | **Otro** hub del día con sus propias consultas | 4 `count` sueltos |
| `/app/command-center` | `CommandCenterHub.tsx` | Caparazón de 5 pestañas que **reembebe** `TodayHubView`, `NeedsAttention`, `OperationsCommandCenter`, `DailyClose`, `PayrollReviewQueue` | delegado |
| `/app/command-center-classic` | `CommandCenter.tsx` (1.022 líneas) | Versión previa completa | propia |
| `/app/ops-center` | `OperationsCommandCenter.tsx` (901 líneas) | Torre en vivo | propia |
| `/app/daily-ops` | `DailyOps.tsx` + `DailyOpsActionQueue` | Cola "qué resolver ahora" | `useTodayOperations` + `buildActionQueue` |

### 4.2 Inventario de tarjetas / KPIs / colas (`TodayHubView`)

| Bloque | Pregunta que responde | Fuente | ¿Accionable? | Destino | Derivado/Almacenado | ¿Lleva al problema exacto? |
|---|---|---|---|---|---|---|
| Atención | ¿Qué está roto ahora? | `model.alertGroups` (cobertura, sin confirmar, riesgo de asistencia, sin clock-out, sin conductor, sin publicar, sin ubicación) | Sí, 1 CTA por alerta; sin permiso muestra texto explicativo | `/app/shift-ops?id=…&tab=team`, `/app/timeclock` | Derivado | ✅ deep-link al turno y pestaña |
| Operaciones de hoy | ¿Qué está activo y en qué orden de urgencia? | `model.activeOperations` | Sí (acción principal + secundarias) | `shift-ops` | Derivado | ✅ |
| Equipos en riesgo | ¿Dónde falta gente o confirmación? | `model.teamSummaries` | Sí | `shift-ops` | Derivado | ✅ |
| Listo para cerrar | ¿Qué turno se puede cerrar? | `model.closeoutItems` | Sí | `/app/daily-close` | Derivado | ⚠️ va a la pantalla, no al turno |
| Validaciones pendientes | ¿Qué decisión falta firmar? | `model.validationItems` | Sí | `/app/validation-center` | Derivado | ⚠️ igual |
| KPI Horas pendientes | ¿Cuántas horas faltan revisar? | `time_entries.clock_out IS NULL` | Sí si `canAccessValidations` | `/app/payroll-review-queue` | Conteo en vivo | ⚠️ sin filtro preaplicado |
| KPI Documentos pendientes | ¿Cuántos documentos esperan revisión? | `employee_documents.review_status='pending'` | Sí, sin gate de permiso visible | `/app/documents` | Conteo en vivo | ⚠️ sin filtro |
| Banner de contadores | ¿Los datos son confiables? | error de consulta | "Reintentar" | — | Meta | ✅ |
| Acción principal pegajosa (móvil) | ¿Cuál es el siguiente mejor paso? | `model.primaryAction` | Sí | variable | Derivado | ✅ |

**Buena práctica confirmada:** cuando una consulta de conteo falla, la UI
**suprime el número en lugar de mostrar 0** (`useHubCounts`). No hay ceros falsos.

**Deriva documental:** el encabezado de `CommandCenterHub.tsx` describe una tira
de KPIs (turnos de hoy, asignaciones pendientes, relojes abiertos, periodos
abiertos, documentos pendientes) que **no existe en el JSX actual**. Comentario
obsoleto.

### 4.3 Colas derivables **hoy**, sin tabla nueva

| Momento | Cola | ¿Derivable hoy? | Con qué |
|---|---|---|---|
| Hoy / 24 h | Turnos sin personal | ✅ | `getShiftStaffingMetrics` |
| | Parcialmente cubiertos | ✅ | idem |
| | Respuestas pendientes | ✅ | `response_status='pending'` (⚠️ requiere limpiar §11-B) |
| | Asignaciones rechazadas | ✅ | `status/response_status='rejected'` |
| | Sin ubicación / punto de encuentro | ✅ | `getShiftMissingItems` |
| | Reemplazo urgente | ✅ | rechazo + proximidad de inicio |
| | Riesgo de no-show | ✅ | `deriveShiftOpsState` (`not_started` tras gracia de 15 min) |
| Durante | Esperados / fichados / sin fichar | ✅ | `deriveAttendanceTruth` |
| | Tarde y excepciones | ✅ | `getAttendanceEvidenceState` |
| | Reemplazo necesario | ✅ | combinación de los anteriores |
| Post-turno | Completados | ✅ | `deriveShiftOpsState` |
| | Sin clock-out | ✅ | `missing_clock_outs` |
| | Horas a revisar | ✅ | `getPayrollReviewFlags` (⚠️ unificar definición) |
| | Variación real vs programado | ✅ | `time_entries` vs `scheduled_shifts` (solo informativo) |
| | Excepciones sin resolver | ✅ | `attendance-truth` |
| | Listo para aprobación | ✅ | `evaluateCloseoutGate` |
| Payroll | Horas reales aprobadas | ✅ | `time_entries.status='approved'` |
| | Personas/entradas listas | ✅ | `evaluateCloseoutGate` → `PAYROLL_READY` |
| | Bloqueados y por qué | ✅ | `CloseoutGateResult.blockers` (ya traen razón y deep-link) |

**Conclusión:** las 18 colas pedidas son derivables hoy. Ninguna requiere tabla,
estado ni workflow nuevo.

---

## 5. WORKER DETAIL — CURRENT STATE

**Ruta:** `/app/employees/:id` → `UnifiedPersonProfile.tsx` (1.528 líneas).
`/app/workers/:id` redirige aquí.

**Estructura actual:** Hero (avatar, nombre, `ReadinessBadge`, `PersonStatusMatrix`
con las 4 dimensiones) → tira de Snapshot (Portal, Documentos, Readiness,
Asistencia·30d, Último fichaje, Última actividad) → panel de pestañas
(`info, profile, compensation, access, docs, shifts, fit, activity`).

### 5.1 🔴 Bug confirmado contra la base de datos

```
sb.from("scheduled_shifts").select(...).eq("employee_id", id)
```
`scheduled_shifts` **no tiene** columna `employee_id` (solo `driver_employee_id`
— verificado en `information_schema`). Consecuencia: `recentShifts` queda vacío y
**Asistencia·30d muestra siempre 0 turnos / 0 tardanzas / 0 no-shows para todas
las personas**. Además el filtro busca `status='late'` y `status='no_show'`, que
no son valores existentes de `scheduled_shifts.status`. Doble error: la métrica
no funcionaría ni con la tabla correcta. La verdad real vive en
`shift_assignments` + `time_entries`.

### 5.2 Datos que existen en el sistema pero **no** se ven en la ficha

| Dato | Dónde vive hoy | Por qué importa |
|---|---|---|
| Próximo turno | `shift_assignments` (la pestaña ordena por `created_at`, no por fecha) | "¿Qué hace mañana?" no se puede responder |
| Estado de respuesta | `response_status`, `is_draft_reservation`, `ShiftPublicationTruth` | Hoy se colapsa a OK/Pend |
| Cumplimiento detallado | `useWorkerCompliance` — solo en el portal del worker | El admin no ve lo que sí ve el trabajador |
| Pasaporte / reputación | `/app/passport`, `useWorkerPassport` | Turnos totales, horas, calificación |
| Excepciones de tiempo | `attendance-truth.ts` (`review_required`, `missing_clock_out`) | Es el insumo de la revisión de horas |
| Preparación de payroll | `closeout-gate.ts` | Solo existe por turno, no por persona |
| Vencimiento de documentos | `employee_onboarding_documents.status='expired'` (se consulta pero no se muestra) | Bloquea asignabilidad |
| Línea de tiempo completa | `activity_log` filtrado solo a `entity_type='employee'`, 8 filas | Excluye publicaciones de turno, payroll y visitas |
| Historial de recepción | `office_visits` (se consulta en `frontDeskVisits`) | Puede estar consultado y no renderizado |

### 5.3 Timeline sin sistema nuevo

Todos los eventos pedidos ya tienen timestamp o fila propia:
invitado (`employee_invitations.created_at`), activado (`employees.user_id` +
`activity_log`), documento subido/aprobado (`employee_documents.created_at/reviewed_at`),
asignado (`shift_assignments.created_at`), aceptado/rechazado (`accepted_at`/`rejected_at`),
fichó entrada/salida (`time_entries.clock_in/clock_out`), horas aprobadas
(`time_entries.approved_at`), payroll procesado (`pay_statements.published_at`).
**Un timeline unificado es 100 % derivable por unión y orden. No requiere tabla de eventos.**

---

## 6. PAYROLL / TIME SOURCE-OF-TRUTH MAP

```
clock_events (evidencia)  ──►  time_entries (VERDAD DE HORAS)
                                    │  status: pending → approved
                                    ▼
shift_closeouts (review_status, final_approval_status)
                                    ▼
              evaluateCloseoutGate → PAYROLL_READY
                                    ▼
    period_base_pay + payroll_adjustments  ──►  pay_statements (congelado)
```

Reglas verificadas y **intactas**:
- `scheduled_shifts.start_time/end_time` es referencia operativa, **nunca** fuente de pago.
- Las validaciones admin de asistencia se guardan como `shift_notes` y **no** crean `time_entries`.
- `pay_statements` congela totales (`frozen_*`) y tiene triggers de inmutabilidad.
- Datos: 7.435 `time_entries` (7.404 aprobadas, 28 pendientes, 3 rechazadas); 4 relojes abiertos.
- 6.896 `time_entries` sin `shift_id` son **importaciones históricas** (ene–abr 2026). Desde mayo 2026 la vinculación es prácticamente total (agosto: 25/25). No es una fuga actual.

**Ninguna de las tres movidas recomendadas toca esta cadena.**

---

## 7. WHAT CAN BE DERIVED TODAY

Derivable **hoy**, sin estado nuevo:
- Bucket operativo del turno, nivel de alerta y razón humana.
- Cobertura vs confirmación (contrato único ya existente).
- Asistencia por persona en 8 estados, con evidencia real ganando sobre validación admin.
- Bloqueadores de publicación y de cierre, con razón y deep-link.
- Las 18 colas del §4.3.
- Estado de persona en 4 dimensiones (`resolvePersonStatus`).
- Timeline de actividad por unión de timestamps existentes.
- Próximo turno, último turno, horas reales del periodo, recibos publicados.

Requiere **limpieza de datos** antes de ser confiable:
- Confirmación real del worker (por la divergencia `status` vs `response_status`).
- Estado de ciclo de vida del turno (por la doble columna).
- "Horas pendientes" (dos definiciones).

No derivable hoy sin nueva captura (y **no** se recomienda construirlo ahora):
- Motivo estructurado de no-show.
- Coste/margen por turno en vivo.
- Predicción de riesgo basada en histórico multiempresa.

---

## 8. NEXT-ACTION RULE CANDIDATES

Todas determinísticas. Formato: INPUT → FUENTE → CONDICIÓN → ACCIÓN → CONFIANZA → RIESGO DE FALSO POSITIVO → TENANT.

| # | Regla | Input | Fuente canónica | Condición | Acción | Confianza | Falso positivo | Tenant |
|---|---|---|---|---|---|---|---|---|
| 1 | Sub-dotado | asignaciones, `slots` | `getShiftStaffingMetrics` | `assignedActive < required` y publicado | Buscar/asignar | Alta | Bajo (`slots` mal capturado) | `company_id` |
| 2 | Sin confirmar cerca del inicio | `response_status`, hora de inicio | `assignment-status-truth` | pendiente y faltan <12 h | Mensaje/llamada | **Media** | **Alto hoy** por §11-B | `company_id` |
| 3 | Rechazo | `rejected_at` | `shift_assignments` | rechazo sin reemplazo | Abrir reemplazo | Alta | Bajo | `company_id` |
| 4 | Job Site faltante | `location_id`, `locations_v2` | `getShiftMissingItems` | publicado sin job site | Completar dirección | Alta | Bajo | `company_id` |
| 5 | Cumplimiento faltante | documentos requeridos | `resolvePersonStatus` | `MISSING_DOCS`/`EXPIRED_DOCS` | Resolver documento | Alta | Medio (vencimientos no normalizados) | `company_id` |
| 6 | No fichó tras el inicio | `time_entries` | `deriveShiftOpsState` | +15 min sin entrada | Llamar / validar presencia | Alta | Medio (fichaje offline en cola) | `company_id` |
| 7 | Sin clock-out | `clock_out IS NULL` | `deriveShiftOpsState` | +30 min del fin | Cerrar con auditoría | Alta | Bajo | `company_id` |
| 8 | Completado sin revisar | fin + horas | `getPayrollReviewFlags` | horas sin aprobar | Revisar horas | Alta | Bajo | `company_id` |
| 9 | Aprobado → payroll | gate de cierre | `evaluateCloseoutGate` | `PAYROLL_READY` | Enviar a payroll | Alta | Bajo | `company_id` |
| 10 | Publicado con reserva tentativa | `is_draft_reservation` | `publication-truth` | anomalía nombrada | Confirmar o retirar | Alta | Bajo | `company_id` |

**Regla 2 no debe implementarse hasta resolver §11-B**: con 5.809 filas
divergentes generaría ruido masivo.

**IA: no ahora.** Las 10 reglas son determinísticas y auditables. Introducir IA
antes de limpiar la verdad amplificaría la divergencia.

---

## 9. WORKFLOW / CLICK FRICTION

| Flujo | Pantallas | Clics | Contexto perdido | Callejón / fricción |
|---|---|---|---|---|
| **A. Command Center → sub-dotado → asignar** | Hub → `shift-ops?tab=team` → selector | 3–4 | Ninguno (deep-link con pestaña) | ✅ El mejor flujo del sistema |
| **B. Turno → respuesta del worker → contexto de la persona** | `shift-ops` → `employees/:id` → volver | 4–6 | **Sí**: al volver se pierde el turno y la pestaña | Sin panel lateral de persona dentro del turno |
| **C. Persona → documentos → asignabilidad** | `employees/:id` → pestaña docs → `documents` | 3–5 | Parcial | La razón de bloqueo no enlaza al documento concreto |
| **D. Turno terminado → real → revisión → aprobación** | `daily-ops` → `timeclock` → `payroll-review-queue` → `daily-close` | 6–9 | **Sí**: cada pantalla tiene su propio filtro | Los KPIs del hub no preaplican `shiftId` |
| **E. Aprobado → payroll** | `payroll-review-queue` → `payroll` | 3–4 | Bajo | Los bloqueadores del gate ya traen deep-link (bien) |

Fricción transversal: **cinco rutas de centro de mando** obligan al admin a
aprender qué pantalla sirve para qué, y `docs/SHIFT_OPERATIONAL_FLOW.md` existe
precisamente porque esa distinción no es evidente en la UI.

---

## 10. MOBILE FINDINGS

**Fortalezas reales:**
- Constante `TAP = min-h-[44px] min-w-[44px]` aplicada a cabeceras plegables y CTA.
- Barra inferior pegajosa con `env(safe-area-inset-bottom)` y **una sola** acción principal.
- `DailyOpsActionQueue` bifurca bien: móvil = fila tocable + bottom sheet con contexto y CTA "Operar"; escritorio = rejilla densa.
- Tira de pestañas del hub con scroll horizontal y píldoras.
- Métricas de `MobileAdminHome` en mosaicos de `min-h-[88px]`.

**Debilidades:**
- `/app` en móvil renderiza `MobileAdminHome`, una **segunda** implementación del hub con consultas propias — el admin ve números distintos en teléfono y computadora.
- En móvil, Equipos / Cierre / Validaciones arrancan **plegados**: lo urgente puede quedar oculto tras un toque extra.
- `Upcoming60Sheet` abre como panel lateral derecho en vez de bottom sheet (inconsistente con el resto del patrón móvil).
- Los KPIs enlazan a pantallas completas sin filtro preaplicado: en teléfono eso significa listas largas y desplazamiento.
- No se pudo verificar solapamiento real de la barra pegajosa (requiere ejecución, fuera de alcance de una auditoría de solo lectura).

**Veredicto móvil:** se puede resolver una urgencia desde el teléfono en los
flujos A y parte de D; los flujos B y C no son razonables en móvil hoy.

---

## 11. SILOS / DUPLICATED TRUTHS

### A. 🔴 DANGEROUS — Ciclo de vida del turno duplicado
`scheduled_shifts.status` (texto libre) **y** `publication_status` (enum) conviven.
Producción: 1.226 `published/published`, 419 `published/open`, 225 `published/confirmed`,
169 `published/locked`, 52 `draft/open`, 31 `draft/draft`, **5 `published/draft`**, 4 `published/completed`.
No hay CHECK ni trigger que los mantenga coherentes.

### B. 🔴 DANGEROUS — Decisión admin vs respuesta del worker
`status IN (accepted, confirmed)` con `response_status='pending'`: **5.809 filas**
(3.820 + 1.989). `staffing-metrics.ts` lo resuelve correctamente (exige respuesta
real salvo `status='confirmed'`), pero `shift-operations-intelligence.ts` calcula
`slots - confirmed` como "cobertura incompleta", **contradiciendo el contrato
canónico** (cobertura = asignados/plazas; confirmación = confirmados/asignados).

### C. 🔴 DANGEROUS — "Horas pendientes" con dos definiciones
`MobileAdminHome`: `time_entries.status='pending'` → **28**.
`TodayHubView`: `clock_out IS NULL` → **4**.
Mismo rótulo, números distintos, misma empresa.

### D. 🟡 DANGEROUS-LEVE — Cinco centros de mando
`/app`, `/app/command-center`, `/app/command-center-classic`, `/app/ops-center`,
`/app/daily-ops` (+ `MobileAdminHome`). Tres de ellos comparten `useTodayOperations`
(seguro), pero `CommandCenter.tsx` y `MobileAdminHome` consultan por su cuenta.

### E. 🟢 SAFE DERIVED (no consolidar, están bien)
- Cobertura/confirmación → `getShiftStaffingMetrics` (fuente única).
- Asistencia → `attendance-truth` + `attendance-evidence` (evidencia real gana).
- Estado de persona → `resolvePersonStatus` (4 dimensiones separadas por diseño).
- Portal → `resolvePortalStatus` (`employees.user_id` como única verdad).
- Cierre → `evaluateCloseoutGate` (3 estados distintos, correctamente separados).
- Bucket del día → `deriveShiftOpsState`.

### F. 🟡 Deriva documental
Encabezado de `CommandCenterHub.tsx` describe una tira de KPIs inexistente.

---

## 12. TENANT / SECURITY BOUNDARIES

- Todas las consultas auditadas del hub, daily-ops y ficha filtran por
  `company_id` o `employee_id` **antes** de cualquier otro filtro.
- `useTodayOperations` acota las consultas dependientes a los IDs de turnos ya
  filtrados por empresa, evitando además el tope de 1.000 filas.
- Permisos: `useTodayHubPermissions` es **fail-closed** — sin permiso la tarjeta
  se muestra sin CTA y con la razón, en vez de ocultar el problema.
- Rutas sensibles siguen con `PermissionGate` (`payroll.manage`, `time_entries.adjust`,
  `workers.invite`, `company.settings`) y `CompanyRequiredGuard`.
- Los adjuntos y medios siguen en buckets privados con URLs firmadas.
- **Excepción menor:** el KPI de Documentos pendientes enlaza a `/app/documents`
  sin gate de permiso visible en la tarjeta (la ruta sí está protegida, pero la
  tarjeta expone un conteo a quien quizá no deba verlo).
- La unificación de UX propuesta **no requiere** tocar RLS, RPCs ni permisos:
  las tres movidas son composición de lecturas ya autorizadas.

---

## 13. WHAT STAFLY ALREADY DOES BETTER FOR STAFFING

1. **Cobertura ≠ confirmación** como contrato explícito y único. Casi ningún
   sistema de turnos distingue "asignado" de "la persona dijo que sí".
2. **La evidencia real siempre gana sobre la validación administrativa**: marcar
   "presente" no crea horas pagables. Separación limpia operación/nómina.
3. **Cierre en tres estados** (enviado / reconciliado / listo para pago) con
   autoridad distinta en cada uno.
4. **Estado de persona en 4 dimensiones** que nunca se colapsan: portal activo no
   implica asignable, documentos faltantes no bloquean por sí solos.
5. **Bloqueadores con razón y deep-link**, no mensajes genéricos.
6. **Sin ceros falsos**: si una consulta falla, se suprime el número.
7. **Escritura centralizada y versionada** (política VWC) con auditoría.
8. **Anomalías nombradas** en vez de ocultadas (`PUBLISHED_WITH_DRAFT_RESERVATIONS`).
9. **Lenguaje diferenciado por audiencia**: admin dice "Servicios", worker dice "Turnos".
10. **Multiempresa real** con aislamiento verificado en cada consulta.

---

## 14. CONNECTEAM-INSPIRED PATTERNS WORTH ADAPTING

1. **Una sola puerta de entrada operativa** con subvistas, no cinco rutas hermanas.
2. **Panel lateral de contexto** (persona o turno) sin abandonar la pantalla actual.
3. **Deep-links con filtro preaplicado** desde cada KPI (`?shiftId=`, `?status=`).
4. **Timeline unificado por entidad** construido desde eventos existentes.
5. **Acción masiva desde la cola** (mensaje a todos los pendientes de un turno).
6. **Resumen "qué pasó hoy"** al cierre de jornada, derivado, sin tabla nueva.

## 15. CONNECTEAM PATTERNS WE SHOULD NOT COPY

1. **Paridad de módulos por catálogo** (encuestas, cursos, wellness): dispersa el foco.
2. **Chat como sistema operativo**: Stafly ya decide desde la operación, no desde la conversación.
3. **Estado de turno almacenado y editable a mano**: reintroduciría el problema §11-A.
4. **Horas programadas convertidas en horas pagables**: viola la regla de oro.
5. **Dashboards de gráficas**: el admin necesita una cola accionable, no analítica.
6. **Auto-aprobación de horas por reglas**: la aprobación debe tener autoridad humana.
7. **Rol de "administrador" monolítico**: Stafly ya tiene responsabilidades por etapa.

---

## 16. TOP 10 GAPS

Ordenados por impacto operativo. (OP = operativo, UX, R = riesgo, C = complejidad; 1–5)

| # | Gap | OP | UX | R | C |
|---|---|---|---|---|---|
| 1 | `status` vs `publication_status` sin contrato ni constraint (5 filas incoherentes) | 5 | 4 | 4 | 3 |
| 2 | 5.809 asignaciones con decisión admin ≠ respuesta del worker | 5 | 5 | 4 | 2 |
| 3 | Asistencia·30d de la ficha siempre vacía por columna inexistente | 5 | 5 | 2 | 1 |
| 4 | Cinco rutas de centro de mando + hub móvil separado | 4 | 5 | 2 | 3 |
| 5 | "Horas pendientes" con dos definiciones (28 vs 4) | 4 | 4 | 3 | 1 |
| 6 | Ficha sin próximo turno, cumplimiento, excepciones ni timeline | 4 | 5 | 1 | 3 |
| 7 | KPIs sin filtro preaplicado en el destino | 3 | 4 | 1 | 2 |
| 8 | `shift-operations-intelligence` usa `slots - confirmed` contra el contrato canónico | 3 | 3 | 3 | 1 |
| 9 | Secciones críticas plegadas por defecto en móvil | 3 | 4 | 1 | 1 |
| 10 | Deriva documental en `CommandCenterHub` (tira de KPIs inexistente) | 1 | 2 | 1 | 1 |

---

## 17. RECOMMENDED THREE MOVES

### A. COMMAND CENTER — *Una sola torre, colas derivadas, destino exacto*

- **Problema:** cinco rutas paralelas, un hub móvil distinto al de escritorio y KPIs
  que llevan a pantallas sin filtro. El admin aprende rutas en vez de resolver.
- **Datos existentes:** `useTodayOperations`, `buildTodayHubModel`,
  `deriveShiftOpsState`, `buildActionQueue`, `getShiftStaffingMetrics`,
  `getPayrollReviewFlags`, `evaluateCloseoutGate`. **Nada nuevo.**
- **Comportamiento propuesto:** `/app/command-center` como única torre; el resto
  redirige conservando parámetros. Mismo modelo en escritorio y móvil (retirar la
  segunda implementación móvil). Cada KPI y cada fila de cola navega con filtro
  preaplicado (`?shiftId=`, `?employeeId=`, `?status=`). Las 18 colas del §4.3 se
  agrupan en cuatro momentos: **Antes · Durante · Después · Pago**.
- **Impacto de arquitectura:** solo composición y enrutamiento. Sin tablas, sin RPC, sin estados.
- **Riesgo de seguridad:** nulo; se reutilizan lecturas ya autorizadas y el gate fail-closed.
- **Riesgo de payroll:** nulo; la pestaña de pago sigue siendo validación previa, no cálculo.
- **Beneficio esperado:** una sola pantalla que responde "¿qué necesita atención ahora?" y lleva al problema exacto en un toque.
- **Móvil:** secciones urgentes abiertas por defecto, bottom sheet uniforme, una sola acción pegajosa.

### B. SHIFT LIFECYCLE — *Un estado derivado visible, dos columnas reconciliadas*

- **Problema:** dos columnas de ciclo de vida sincronizadas a mano, con 5 turnos ya incoherentes y vocabulario sin contrato (`open`, `confirmed`, `locked`).
- **Datos existentes:** `resolveShiftPublicationTruth` ya produce los 11 estados correctos.
- **Comportamiento propuesto:** que **toda** la UI lea exclusivamente el estado
  derivado por `publication-truth.ts` + `deriveShiftOpsState`, y que ninguna
  pantalla muestre `scheduled_shifts.status` crudo. Una cinta de ciclo de vida
  única en el detalle del turno (Borrador → Publicado → Dotado → Confirmado →
  En curso → Completado → Horas revisadas → Listo para pago), con el bloqueador
  activo y su acción. Reconciliar las 5 filas incoherentes en una operación
  auditada aparte, **fuera** de esta movida.
- **Impacto de arquitectura:** presentación + una regla de lint que prohíba leer `status` crudo. Sin migración en esta fase.
- **Riesgo de seguridad:** nulo.
- **Riesgo de payroll:** nulo; el estado derivado no alimenta horas.
- **Beneficio esperado:** el admin explica en voz alta dónde está el turno y qué falta, sin abrir cinco pantallas.
- **Móvil:** cinta compacta horizontal con el paso actual y un solo CTA.

### C. WORKER OPERATIONAL PROFILE — *La persona como operación, no como ficha*

- **Problema:** la ficha muestra identidad y documentos, pero no responde "¿qué
  pasa con esta persona ahora?". Además su métrica de asistencia está rota.
- **Datos existentes:** `resolvePersonStatus`, `shift_assignments`, `time_entries`,
  `attendance-truth`, `useWorkerCompliance`, `employee_documents`,
  `pay_statements`, `activity_log`.
- **Comportamiento propuesto:** encabezado con la matriz de 4 dimensiones (ya
  existe) + bloque **Ahora** (próximo turno, estado de respuesta, turno abierto,
  incidencia sin resolver) + bloque **Puede trabajar** (cumplimiento y documentos
  con la razón exacta) + bloque **Hizo** (turnos previos y horas reales) + bloque
  **Necesita revisión** (excepciones de tiempo, documentos, respuesta pendiente)
  + **timeline** por unión de timestamps existentes. Corregir primero la consulta
  rota usando `shift_assignments` + `time_entries`.
- **Impacto de arquitectura:** composición de lecturas + reutilización de
  `useWorkerCompliance` en el lado admin. Sin tablas ni eventos nuevos.
- **Riesgo de seguridad:** medio-bajo — exponer cumplimiento al admin debe
  respetar permisos de documentos; se recomienda gate explícito por bloque.
- **Riesgo de payroll:** nulo si el bloque de payroll es **solo lectura** (horas
  aprobadas y recibos publicados), sin acción de cálculo.
- **Beneficio esperado:** decidir sobre una persona sin abrir cuatro pantallas.
- **Móvil:** secciones plegables con **Ahora** y **Necesita revisión** abiertas por defecto; llamar/mensajear como acciones pegajosas.

---

## 18. DO NOT BUILD YET

1. Cualquier tabla de eventos, alertas, estados o colas — todo es derivable.
2. Recomendaciones con IA — primero las 10 reglas determinísticas del §8.
3. Regla 2 (sin confirmar cerca del inicio) — hasta resolver §11-B.
4. Predicción de no-show o scoring de riesgo.
5. Automatizar la aprobación de horas o el cierre.
6. Escribir en `time_entries`, `shift_assignments` o `scheduled_shifts` desde el Command Center.
7. Migración/backfill del doble estado del turno dentro de estas tres movidas.
8. Nueva paridad de módulos estilo Connecteam.
9. Gráficas o analítica en el centro de mando.
10. Un cuarto centro de mando.

---

## 19. RECOMMENDED IMPLEMENTATION ORDER

**Fase 0 — Limpieza de verdad (obligatoria, antes de la UX)**
0.1 Corregir la consulta rota de la ficha (`scheduled_shifts.employee_id`).
0.2 Unificar la definición de "horas pendientes" en una sola función.
0.3 Alinear `shift-operations-intelligence` con el contrato cobertura/confirmación.
0.4 Auditar y reconciliar, con evidencia, las 5 filas `published/draft`.
0.5 Decidir y documentar el contrato de `status` vs `publication_status`.
0.6 Diagnosticar las 5.809 asignaciones divergentes (¿importación histórica o flujo real?).

**Fase 1 — Movida B (ciclo de vida del turno).** Consolida el vocabulario que las otras dos consumen.

**Fase 2 — Movida A (Command Center único).** Una torre, colas derivadas, deep-links con filtro, paridad móvil.

**Fase 3 — Movida C (ficha operativa del trabajador).** Se apoya en el estado unificado de las fases 1 y 2.

**Fase 4 — Reglas de next-action del §8** (las 9 seguras; la regla 2 solo tras 0.6).

Cada fase cierra con las 5 respuestas de la política VWC: menos código, helper
único, diálogo único, auditoría única, pruebas únicas.

---

## ANEXO — Garantías de esta auditoría

Cero migraciones. Cero tablas. Cero estados nuevos. Cero escrituras de producción.
Cero cambios de permisos, RLS, auth, payments, bookings, chat, edge functions,
cálculos de nómina, `time_entries`, `shift_assignments`, `scheduled_shifts`,
documentos, tenants ni límites de empresa. Todas las consultas ejecutadas fueron
`SELECT` de conteo y de esquema. El comunicado piloto `1942ada8-…` permanece en
borrador con 0 destinatarios; no se envió ningún correo.

---

🟡 DATA / WORKFLOW CLEANUP REQUIRED BEFORE UX UNIFICATION
