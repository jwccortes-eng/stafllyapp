# P0 — VWC Fase 3: Matriz de los 18 editores de riesgo ALTO

**Estado:** report-only. Ningún archivo de aplicación fue modificado en esta entrega.
**Fuente:** `docs/qa/P0_DATA_INTEGRITY_LOST_UPDATE_AUDIT.md` (secciones 3.1 a 3.6, nivel **ALTO**).
**Predecesores:** Fase 1 (servicios) y Fase 2 (horas, compensación, saldos) ya migradas.

---

## 0. Nota previa sobre el alcance solicitado

La prioridad pedida (Workers → Documentos → Clientes → Configuración de empresa → Asignaciones → Bookings → Campañas) **no mapea 1:1** con la población real de los 18 ALTO. Hechos:

- No existen entidades `bookings` ni `campaigns` en este producto. Su equivalente funcional es **`service_requests`** (solicitudes de servicio de cliente = "booking") y **`flash_jobs` / `job_applications`** (convocatorias = "campaña"). Sólo `service_requests` está clasificado ALTO; `flash_jobs` no aparece en el nivel ALTO.
- `Clients.tsx` está clasificado **MEDIO**, no ALTO. Queda fuera de esta fase salvo que se decida elevarlo.
- 8 de los 18 ALTO viven en **payroll / reconciliación / horas**, área que esta orden marca como "no tocar". Se listan igualmente en la matriz, pero quedan **bloqueados** y sin bloque de migración asignado hasta autorización explícita.

Esto reduce el conjunto realmente migrable en Fase 3 a **10 editores**. La matriz lo deja explícito por fila.

---

## 1. Los 18 editores ALTO

Numeración estable (`H01`–`H18`) para referenciarlos en las fases siguientes.

| # | Módulo | Archivo / superficie | Entidad · tabla |
|---|---|---|---|
| H01 | Workers / identidad | `EmployeeMerge.tsx`, `useIdentityResolution.ts:249` — desktop admin | Persona · `employees` (+ relaciones) |
| H02 | Workers / fiscal | `MyW9.tsx:223` — portal worker (mobile+desktop) | W9 · `contractor_w9` |
| H03 | Workers / fiscal | `MyDocuments.tsx` — portal worker | W9 y documentos · `contractor_w9`, `employee_documents` |
| H04 | Configuración de empresa | `CompanyConfig.tsx` / `useCompanyConfig.tsx:54` — desktop admin | Ajustes · `company_settings` |
| H05 | Permisos y usuarios | `CompanyUsersDialog.tsx` — desktop admin | Membresía · `company_users`, `user_roles`, `module_permissions` |
| H06 | Permisos y usuarios | `Users.tsx:489-508` — desktop admin | Perfil/rol · `profiles`, `user_roles`, `module_permissions` |
| H07 | Ubicaciones | `Locations.tsx:165-186` — desktop admin | Ubicación · `locations` |
| H08 | Asignaciones (portal) | `MyShifts.tsx:294-334` — portal worker mobile | Asignación · `shift_assignments` |
| H09 | Bookings (solicitudes) | `useServiceRequests.tsx:196,243-304` — desktop + mobile admin | Solicitud · `service_requests` |
| H10 | Cierre de servicio | `shift-closure.ts`, `closeout.ts` — Shift Ops mobile + desktop | Cierre · `shift_closeout_reports`, `scheduled_shifts` |
| H11 | Importación de turnos | `ImportSchedule.tsx:1436-2010` — desktop admin | Lote · `scheduled_shifts`, `shift_assignments` |
| H12 | Horas | `hours-approval.ts:83,107` — desktop admin | Horas · `time_entries` |
| H13 | Time clock | `PortalClock.tsx:527-650` — portal worker mobile | Fichaje · `clock_events`, `time_entries` |
| H14 | Dinero | `Movements.tsx:132-303` — desktop admin | Movimiento · `movements` |
| H15 | Facturación | `useInvoices.tsx:113-329` — desktop admin | Factura · `invoices`, `invoice_lines` |
| H16 | Reconciliación | `useReconciliationPeriod.tsx`, `PayrollTruthValidation.tsx`, `WeeklyCloseTab.tsx`, `ExceptionsTab.tsx`, `StagedReconciliation.tsx` | Periodo · `reconciliation_*` |
| H17 | Importación payroll | `ImportPayrollExtras.tsx:299,341` — desktop admin | Movimientos · `movements` |
| H18 | Importación payroll | `ImportConnecteam.tsx:491,564` — desktop admin | Base de pago · `period_base_pay` |

---

## 2. Matriz detallada

### H01 — Merge de empleados
- **Campos:** ids de empleado origen/destino, relaciones (turnos, documentos, financieros).
- **Mutación actual:** `rpc(merge_employees)` con gate cliente `employee_has_locked_payroll`.
- **Forma:** RPC (sin `expected_version`, sin `intent_key`).
- **Lost update:** medio-alto. Dos merges concurrentes de la misma pareja no están serializados; el gate se evalúa en cliente antes de la llamada.
- **Multi-tenant:** alto — mueve relaciones entre personas; si las dos personas viven en compañías distintas, el merge crea contaminación cruzada.
- **Dependencias:** payroll bloqueado, `shift_assignments`, `employee_documents`, `employee_financial_records`, `get_employee_assignment_status`.
- **Carril:** **3 — RPC transaccional** endurecida (lock de filas, gate dentro de la transacción, `idempotency_key`, auditoría).
- **Prioridad:** P1 (bloque A).

### H02 — W9 del worker (portal)
- **Campos:** payload W9 completo (nombre legal, TIN, tipo fiscal, dirección, firma, fecha).
- **Mutación actual:** `contractor_w9.update({...todo el payload})`.
- **Forma:** **snapshot completo**.
- **Lost update:** alto. Un reenvío del worker pisa correcciones o rechazos hechos por admin entre lectura y envío.
- **Multi-tenant:** medio — la fila es por empleado; el riesgo es de estado de revisión, no de tenant.
- **Dependencias:** compliance fiscal, estado de revisión, storage de firma.
- **Carril:** **2 — PATCH versionado** para atributos + **3 — RPC** para `status`/`reviewed_*`.
- **Prioridad:** P1 (bloque A).

### H03 — Documentos del worker (portal)
- **Campos:** `document_type`, `storage_path`, `expiration_date`, `status`, `reviewed_by`, `reviewed_at`, `rejection_reason`.
- **Mutación actual:** update/insert directos sobre `contractor_w9` y `employee_documents`.
- **Forma:** snapshot parcial amplio + insert sin `intent_key`.
- **Lost update:** alto. Resubida concurrente devuelve un documento aprobado a `pending`, o pisa `rejection_reason`.
- **Multi-tenant:** alto — `company_id` no se valida en el cliente al escribir.
- **Dependencias:** storage, `document_review_events`, compliance de asignación (`get_employee_assignment_status`).
- **Carril:** **1 — creación idempotente** (nueva versión de documento) + **3 — RPC** para transiciones `pending→approved/rejected/correction_requested/expired/replaced`. Nunca PATCH genérico sobre `status`.
- **Prioridad:** P1 (bloque B).

### H04 — `company_settings`
- **Campos:** `value` (JSONB completo), `updated_at`.
- **Mutación actual:** lectura del JSON, **merge en cliente**, `update({value: merged})`.
- **Forma:** **read-modify-write** sobre JSONB.
- **Lost update:** muy alto. El merge parte de una lectura vieja: cualquier clave añadida por otro admin desaparece sin rastro.
- **Multi-tenant:** alto — una sola fila por compañía, editada por varios admins.
- **Dependencias:** branding, reglas de agenda, notificaciones, módulos, compliance.
- **Carril:** **2 — PATCH versionado con whitelist de claves** (merge server-side, fail-closed). Excluir de la whitelist: `is_active`, ownership, billing, permisos.
- **Prioridad:** P1 (bloque D).

### H05 — Usuarios de la compañía
- **Campos:** `role`, membresía, `module_permissions.is_active`.
- **Mutación actual:** `update` + `upsert` + `delete` en secuencia, sin transacción.
- **Forma:** delete+insert no atómico.
- **Lost update:** alto, con ventana de **cero permisos** visible para el usuario afectado.
- **Multi-tenant:** crítico — define quién ve qué compañía.
- **Dependencias:** RLS, `has_role`, `has_module_permission`.
- **Carril:** **3 — RPC transaccional** con actor, `company_id`, estado previo esperado y auditoría. No PATCH.
- **Prioridad:** P2 (bloque E) — requiere revisión de seguridad aparte por tocar permisos.

### H06 — `Users.tsx` (perfil + rol global)
- Igual que H05, más `profiles`. Misma clasificación y mismo carril.
- **Prioridad:** P2 (bloque E).

### H07 — Ubicaciones
- **Campos:** `name`, `address`, `city`, `state`, `client_id`, `geofence_radius`, `default_pay_type`, `default_clock_method`, `require_car`, `default_instructions`, `contact_*`, `deleted_at`.
- **Mutación actual:** `locations.update(payload)` con el formulario entero; soft-delete/restore por PATCH de `deleted_at`.
- **Forma:** **snapshot completo**.
- **Lost update:** alto y con impacto operativo directo: pisar `geofence_radius` o `default_clock_method` rompe el fichaje en campo.
- **Multi-tenant:** alto — `client_id` editable puede reasignar la ubicación.
- **Dependencias:** fichaje geolocalizado, `scheduled_shifts.location_id`, clientes.
- **Carril:** **2 — PATCH versionado**; `deleted_at` (archivar/restaurar) por **3 — RPC**.
- **Prioridad:** P2 (bloque C/D).

### H08 — Respuesta del worker a la asignación
- **Campos:** `status`, `response_at`, `response_note`.
- **Mutación actual:** `rpc(worker_respond_to_shift_assignment)` **con fallback a `.update()` directo** si la RPC falla.
- **Forma:** RPC + PATCH de escape.
- **Lost update:** alto — el fallback salta la validación de estado previo y puede resucitar `assigned` sobre `removed`/`cancelled`.
- **Multi-tenant:** medio.
- **Dependencias:** `staffing-metrics`, notificaciones, cobertura del servicio, multi-driver.
- **Carril:** **3 — RPC transaccional exclusiva**. Acción concreta: **eliminar el fallback**.
- **Prioridad:** P1 (bloque F) — es el cambio de menor superficie y mayor retorno.

### H09 — Solicitudes de servicio ("bookings")
- **Campos:** `status`, `updated_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, detalles de la solicitud, conversión a turno.
- **Mutación actual:** `service_requests.update` + inserts de conversión, sin bloqueo.
- **Forma:** PATCH parcial + creación no idempotente.
- **Lost update:** alto — doble conversión concurrente genera **dos servicios** para una solicitud.
- **Multi-tenant:** alto — `company_id` y `client_id` presentes en el payload.
- **Dependencias:** `scheduled_shifts`, `service_request_shift_links`, cliente, facturación.
- **Carril:** atributos → **2 PATCH versionado**; `status`/cancelación → **3 RPC**; conversión a turno → **1 creación idempotente** con `intent_key`.
- **Prioridad:** P2 (bloque G).

### H10 — Cierre de servicio
- **Campos:** campos de cierre, notas, incidencias, `shift.status`.
- **Mutación actual:** insert + varios `update` encadenados (`closeout.ts:124,160,192`, `shift-closure.ts:233`).
- **Forma:** parcial multi-paso sin transacción.
- **Lost update:** alto — dos cierres concurrentes producen estados mixtos entre reporte y turno.
- **Multi-tenant:** medio.
- **Dependencias:** `time_entries`, badge de revisión en Shift Ops, PRQ, payroll aguas abajo.
- **Carril:** **3 — RPC transaccional** única e idempotente por `shift_id`.
- **Prioridad:** P2 (bloque F).

### H11 — Importación de turnos
- **Campos:** fechas, horas, `employee_id`, roles, en lote.
- **Forma:** **snapshot por lote** (update/insert/upsert masivo).
- **Lost update:** muy alto — un reimport pisa ediciones manuales del día.
- **Multi-tenant:** alto (lotes por compañía).
- **Carril:** **1 — creación idempotente** por `intent_key` de lote + fila; upsert sólo con `expected_version` por fila.
- **Prioridad:** P3 — requiere diseño propio de idempotencia de lote. Se propone tratarlo como mini-fase 3.5.

### H12 a H18 — Payroll, horas, dinero, reconciliación, importación payroll
| # | Forma actual | Lost update | Carril recomendado | Estado |
|---|---|---|---|---|
| H12 `hours-approval.ts` | PATCH `.in(ids)` sin guardia de estado | alto | 3 — RPC con `expected_status='pending'` | **Bloqueado** (payroll/`time_entries`) |
| H13 `PortalClock.tsx` | insert + PATCH sin validación de entrada abierta | alto | 1 idempotente + 3 RPC de clock-out | **Bloqueado** (`time_entries`) |
| H14 `Movements.tsx` | parcial + snapshot de aprobación | alto | 3 RPC de aprobación idempotente | **Bloqueado** (dinero) |
| H15 `useInvoices.tsx` | parcial + snapshot de líneas | alto | 2 PATCH versionado + 3 RPC de estado | **Bloqueado** (dinero) |
| H16 `reconciliation_*` | upsert por lotes multi-revisor | alto | 2 + 3 por periodo | **Bloqueado** (payroll) |
| H17 `ImportPayrollExtras.tsx` | snapshot por fila | alto | 1 idempotente por fila | **Bloqueado** (payroll) |
| H18 `ImportConnecteam.tsx` | upsert `period_base_pay` | alto | 4 — aritmética atómica SQL | **Bloqueado** (payroll) |

Multi-tenant en todos ellos: alto (todos llevan `company_id`). Dependencias: `pay_periods`, `time_entries`, `compensation_profiles`, cierre contable.

---

## 3. Clasificación por carril

| Carril | Editores |
|---|---|
| 1 — Creación idempotente | H03 (nueva versión de documento), H09 (conversión), H11, H13, H17 |
| 2 — PATCH versionado | H02, H04, H07, H09 (atributos), H15 |
| 3 — RPC transaccional | H01, H03 (transiciones), H05, H06, H07 (archivar), H08, H09 (estado), H10, H12, H14, H16 |
| 4 — Atómico SQL | H18 |

---

## 4. Orden sugerido por bloques

| Bloque | Contenido | Editores | Justificación |
|---|---|---|---|
| A | Workers / identidad y fiscal | H01, H02 | Identidad de persona; pérdida no recuperable |
| B | Documentos y compliance | H03 | Riesgo legal; revisión pisada |
| C | Clientes y ubicaciones | H07 | Impacto operativo directo en fichaje |
| D | Configuración de empresa | H04 | Pérdida silenciosa de claves JSON |
| E | Permisos y usuarios | H05, H06 | Requiere revisión de seguridad previa |
| F | Asignaciones y estados compartidos | H08, H10 | Menor superficie, alto retorno |
| G | Bookings / solicitudes | H09 | Duplicación de servicios |
| H | Importación de turnos | H11 | Diseño de idempotencia de lote |
| — | Payroll y dinero | H12–H18 | **Bloqueado** por esta orden |

Campañas: sin editores ALTO. `flash_jobs` y `job_applications` están en niveles MEDIO/BAJO; se propone dejarlos para la fase de MEDIOS.

---

## 5. Qué no se toca en esta fase

payroll, `time_entries`, auth, RLS, tenants, datos de producción, activación de compañías, historial, recálculo de nómina.

---

## 6. Decisión pendiente

Para pasar a implementación se necesita confirmación sobre:

1. Aceptar el alcance real de **10 editores migrables** (A–H) y dejar H12–H18 bloqueados, **o** levantar el bloqueo de payroll para completar los 18.
2. Si `Clients.tsx` (hoy MEDIO) debe elevarse a esta fase por la prioridad "Clientes".
3. Si el bloque E (permisos) entra en esta fase o va a una revisión de seguridad separada.

Sin esa confirmación no se ejecuta ninguna migración.
