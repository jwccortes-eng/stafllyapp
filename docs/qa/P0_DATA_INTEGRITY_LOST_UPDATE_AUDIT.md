# P0-BLOQUEANTE — DATA INTEGRITY AUDIT (Lost Update)

Estado: **AUDITORÍA. Sin cambios de código.** Desarrollo de nuevas funcionalidades congelado.
Fecha: 2026-08-02
Alcance: todos los flujos de edición del ecosistema Stafly (frontend `src/` + RPC de negocio).

---

## 1. Resumen ejecutivo

- **155 archivos** de `src/` ejecutan mutaciones (`.update` / `.upsert` / `.insert` / `.rpc`).
- **Cero** flujos usan control optimista real. No existe en todo el repositorio un solo
  `.eq("updated_at", <valor conocido>)`, ni columna `version` / `lock_version` usada como guardia,
  ni parámetro `expected_updated_at` en ninguna RPC.
- Único mecanismo defensivo hoy existente:
  1. **RPC de turnos** (`assign_worker_to_shift`, `set_shift_assignment_state`, `resolve_shift_request`,
     `remove_worker_from_shift`, `cancel_shift`): validan **estado previo** dentro de una transacción
     `SECURITY DEFINER` (`invalid_transition`, `request_not_pending`, `already_assigned`).
     Protegen la máquina de estados, **no** el resto de columnas del registro.
  2. **Guardia de negocio parcial** `.eq("status","pending")` en aprobación de horas por lotes
     (`TimesheetView.tsx:451`, `DayDetailView.tsx:156`). Evita reprocesar, no evita pisar columnas.
- El patrón dominante es: **el formulario mantiene un snapshot en memoria desde que se abre y lo
  reenvía completo al guardar**. Todo cambio hecho por otro usuario entre apertura y guardado se
  pierde silenciosamente, con `200 OK`.
- `updateShiftVerified` (`src/lib/shifts/update-shift.ts`) verifica que lo escrito coincide con lo
  enviado; **no** verifica que nadie más escribió antes. No previene Lost Update: lo confirma.

Evidencia reproducida previamente: `docs/qa/P0_1_CONCURRENT_SERVICE_EDIT_PROTECTION_AUDIT.md`
(sesión B restaura `meeting_point` a `null` y transporte a `false` con `200 OK`).

---

## 2. Criterio de clasificación de riesgo

| Nivel | Definición |
|---|---|
| **CRÍTICO** | Snapshot completo + datos con impacto en dinero, cumplimiento legal o seguridad operativa. Pérdida silenciosa e irreversible sin traza suficiente para reconstruir. |
| **ALTO** | Snapshot completo (o parcial amplio) sobre datos operativos vivos y multi-editor. Pérdida silenciosa, recuperable sólo por auditoría manual. |
| **MEDIO** | PATCH parcial acotado sobre datos operativos, o snapshot con baja concurrencia real. Pérdida posible pero de superficie estrecha. |
| **BAJO** | Campo único, append-only, o protegido por RPC con validación de estado previo. |

---

## 3. Matriz completa de editores

### 3.1 Servicios / Turnos

| Componente | Mutación | Forma | Columnas enviadas | Riesgo de sobrescritura | Nivel |
|---|---|---|---|---|---|
| `ShiftEditDialog.tsx` (+ `formStateToShiftPayload` en `ShiftFormFields.tsx`) | `updateShiftVerified` → `scheduled_shifts.update` | **Snapshot completo** | date, start_time, end_time, client_id, location_id, meeting_point, transportation_required, vehicle_*, notes, required_workers, roles, status | Pisa cualquier columna editada en paralelo. Reproducido en P0.1 | **CRÍTICO** |
| `MobileShiftEditSheet.tsx` | `updateShiftVerified` | Diff local contra snapshot de apertura | subconjunto de las anteriores | El diff se calcula contra un snapshot **viejo**: revierte al valor de apertura si el campo cambió en DB | **CRÍTICO** |
| `ShiftOperations.tsx:335,395` | `shift_assignments.update({assignment_role})`, `scheduled_shifts.update({transportation_required:false})` | PATCH campo único | assignment_role / transportation_required | Estrecho, pero `transportation_required:false` puede anular una decisión concurrente | **MEDIO** |
| `Shifts.tsx` (`createSingleShift`, `handleQuickCreate`) | `.insert` + reconciliación | Snapshot de creación | payload completo de servicio | Creación: no aplica Lost Update. Riesgo = duplicado por doble envío | **BAJO** |
| `ImportSchedule.tsx:1436-2010` | update/insert/upsert masivo `shifts`, `shift_assignments` | **Snapshot por lote** | fechas, horas, employee_id, roles | Dos importaciones simultáneas se pisan entre sí y pisan ediciones manuales del día | **ALTO** |
| `team-actions.ts:40,59,93` | `rpc(set_shift_assignment_state / resolve_shift_request / assign_worker_to_shift)` | RPC | ids + estado destino | Valida transición previa en transacción | **BAJO** |
| `remove-worker.ts:60` | `rpc(remove_worker_from_shift)` | RPC | assignment_id, reason | Valida `status='removed'` previo | **BAJO** |
| `cancel-shift.ts:66` | `rpc(cancel_shift)` | RPC | shift_id, reason | Valida payroll/actividad | **BAJO** |
| `shift-closure.ts`, `closeout.ts` | insert/update tablas de cierre | Parcial de cierre | closure fields, notes | Dos cierres concurrentes del mismo servicio no están serializados | **ALTO** |
| `MyShifts.tsx:294-334` (portal) | `rpc(worker_respond_to_shift_assignment)` **+ fallback `.update` directo** | Parcial | status, response | El **fallback** salta la validación de estado de la RPC | **ALTO** |
| `useServiceRequests.tsx:196,243-304` | `service_requests.update` + inserts de conversión | Parcial | status, updated_by, cancelled_* | Doble conversión concurrente a turno no está bloqueada | **ALTO** |

### 3.2 Payroll / Horas / Dinero

| Componente | Mutación | Forma | Columnas enviadas | Riesgo | Nivel |
|---|---|---|---|---|---|
| `useCompensation.tsx:199-268` | `compensation_profiles.update` / `.insert` | **Snapshot completo** | default_ride_rate_special, overtime_hourly_rate, kitchen_hourly_rate, bonus_transport_hourly_rate, double_pay_hourly_rate, rate_source, effective_from, is_active, notes, updated_by | Pisa tarifas ajustadas en paralelo → pago incorrecto. Hay `compensation_change_log` (auditoría, no protección) | **CRÍTICO** |
| `EmployeeCompensationTab.tsx`, `CompensationEditDialog.tsx`, `CompensationValidation.tsx`, `CompensationReconciliation.tsx` | update/insert `compensation_profiles` | Snapshot completo | idem | Cuatro superficies distintas escribiendo la misma fila con snapshots independientes | **CRÍTICO** |
| `hours-approval.ts:83,107` | `time_entries.update({status,approved_by,approved_at}).in(ids)` | PATCH | status, approved_by, approved_at | **Sin** guardia `.eq("status","pending")`: aprueba filas ya devueltas a corrección | **ALTO** |
| `TimesheetView.tsx:451`, `DayDetailView.tsx:156` | `time_entries.update(...).in(ids).eq("status","pending")` | PATCH con guardia | status | Guardia de estado presente | **MEDIO** |
| `EmployeeDayDetailDrawer.tsx:118,147` | `time_entries.update` | PATCH | clock_out, campos de entrada | Edita horas ya aprobadas por otro sin comprobar estado | **CRÍTICO** |
| `Movements.tsx:132-303` | update aprobación / insert movimientos | Parcial + snapshot | approval_status, approval_note, approved_by, monto | Doble aprobación concurrente del mismo movimiento | **ALTO** |
| `AdvanceLoanDetailDrawer.tsx:147-301` | update `employee_financial_records` (balance) | PATCH sobre saldo | balance, status | **Read-modify-write de saldo sin lock**: dos abonos concurrentes pierden uno | **CRÍTICO** |
| `useInvoices.tsx:113-329` | update/insert `invoices`, `invoice_lines` | Parcial + snapshot líneas | source_status, líneas | Cierre/reapertura concurrente de factura | **ALTO** |
| `useReconciliationPeriod.tsx`, `PayrollTruthValidation.tsx`, `WeeklyCloseTab.tsx`, `ExceptionsTab.tsx`, `StagedReconciliation.tsx` | insert/update/upsert `reconciliation_*` | Parcial + upsert por lotes | status, notas, overrides | Dos revisores sobre el mismo periodo se pisan overrides | **ALTO** |
| `ImportPayrollExtras.tsx:299,341`, `ImportConnecteam.tsx:491,564` | insert `movements`, upsert `period_base_pay` | Snapshot por fila | horas, tasas | Reimport pisa correcciones manuales posteriores | **ALTO** |

### 3.3 Time Clock

| Componente | Mutación | Forma | Columnas | Riesgo | Nivel |
|---|---|---|---|---|---|
| `PortalClock.tsx:527-650` | insert `clock_events`/`time_entries`, update de clock-out | Insert + PATCH | clock_in/out, lat/lng, shift_id | Doble clock-out desde dos dispositivos; no valida entrada abierta en servidor | **ALTO** |
| `time-corrections.ts:59,79,90` | `rpc(request/review_time_entry_correction)` | RPC | entry_id, cambios, decisión | RPC; validación de estado previo **no verificada línea a línea** | **MEDIO** |
| `useLocationTracking.tsx` | upsert presencia `onConflict` | PATCH | status, stopped_at, is_active | Telemetría, último gana es aceptable | **BAJO** |

### 3.4 Workers / Personas

| Componente | Mutación | Forma | Columnas | Riesgo | Nivel |
|---|---|---|---|---|---|
| `WorkerSelfServiceSections.tsx:316,435,544,676` | `employees.update({campo})` | PATCH campo a campo | preferred_name, phone_number, address_structured, emergency_contact_* | Superficie estrecha; sólo el propio worker | **BAJO** |
| `Workforce.tsx:754,843` | `employees.update({profile_status})`, `.update({employee_role}).in(ids)` | PATCH bulk | profile_status, employee_role | Bulk pisa cambios individuales recientes | **MEDIO** |
| `useWorkerProfile.tsx:126-188` | update/insert/delete perfil, skills, idiomas; upsert visibilidad | PATCH (`updates` del llamador) | variable | Delete+insert de skills no es atómico frente a edición concurrente | **MEDIO** |
| `EmployeeMerge.tsx` / `useIdentityResolution.ts:249` | `rpc(merge_employees)` con gate `employee_has_locked_payroll` | RPC | ids | Gate de negocio previo; merge concurrente de la misma pareja no serializado explícitamente | **ALTO** |
| `WorkerPassport.tsx:197,210`, `useWorkerPassport.tsx` | update `passport_public`, upsert entradas | PATCH | passport_public, entry | Estrecho | **BAJO** |
| `CompleteProfile.tsx:210`, `Apply.tsx` | `.update(updates)` onboarding | PATCH | datos personales | Un solo editor | **BAJO** |
| `MyW9.tsx:223`, `MyDocuments.tsx` | update/insert `contractor_w9` | **Snapshot completo** | payload W9 íntegro | Dato fiscal; snapshot completo pisa correcciones admin | **ALTO** |

### 3.5 Empresas, Clientes, Ubicaciones, Ajustes

| Componente | Mutación | Forma | Columnas | Riesgo | Nivel |
|---|---|---|---|---|---|
| `Locations.tsx:165-186` | update/insert/soft-delete `locations` | **Snapshot completo** | name, address, city, state, client_id, geofence_radius, default_pay_type, default_clock_method, require_car, default_instructions, contact_* | Pisa geofence/instrucciones editadas en paralelo → impacto operativo en fichaje | **ALTO** |
| `useLocationsV2.tsx:78,96` | insert payload / update patch | PATCH en update | según formulario | Menor que el anterior | **MEDIO** |
| `Clients.tsx` | update/insert cliente | Snapshot completo | datos de cliente | Baja concurrencia real | **MEDIO** |
| `CompanyConfig.tsx` / `useCompanyConfig.tsx:54` | `company_settings.update({value})` | PATCH con **merge JSON en cliente** | value (JSONB), updated_at | Merge en cliente sobre lectura vieja: pierde claves añadidas por otro admin | **ALTO** |
| `Automations.tsx:194` | upsert `onConflict:"company_id,rule_key"` | Snapshot por regla | rule_key, config | Último gana por regla | **MEDIO** |
| `CompanyModulesDialog.tsx`, `SandboxSyncDialog.tsx` | update/insert `company_modules` | PATCH | is_active, activated_at | Estrecho | **BAJO** |
| `CompanyUsersDialog.tsx`, `Users.tsx:489-508` | update `profiles`/`user_roles`, upsert `module_permissions`, deletes | PATCH | role, permisos | **Permisos**: delete+insert no atómico puede dejar ventana sin rol o revertir una elevación/revocación concurrente | **ALTO** |
| `Companies.tsx:366` | `.update({plan,status,updated_at})` | PATCH | plan, status | `updated_at` se **escribe**, nunca se compara | **MEDIO** |
| `NotificationTemplates.tsx` | update/insert/delete plantillas | Snapshot completo | name, subject, body, transaction_type, is_default, is_active | Dos editores de la misma plantilla | **MEDIO** |
| `CompanySwitchPinDialog.tsx` | `rpc(set_switch_pin / verify_switch_pin)` | RPC | pin | Server-side | **BAJO** |

### 3.6 Incidencias, Chat, Otros

| Componente | Mutación | Forma | Columnas | Riesgo | Nivel |
|---|---|---|---|---|---|
| `Requests.tsx:311-330` | `employee_tickets.update(updates)` + insert notas | PATCH | status, resolución | Doble resolución concurrente | **MEDIO** |
| `QualityDashboard.tsx:122` | `.update({status:"resolved", resolved_at})` | PATCH | status, resolved_at | Estrecho | **BAJO** |
| `Referrals.tsx:117,129` | `.update({status, admin_notes, reviewed_at})` | PATCH | status, admin_notes | `admin_notes` pisa notas de otro revisor | **MEDIO** |
| `EmployeeChatWidget.tsx`, `PortalChat.tsx`, `ShiftChatPanel.tsx` | insert mensajes | Append-only | content | No aplica | **BAJO** |
| `MyAnnouncements.tsx:124` | delete+insert reacción | Append-only | reaction | No aplica | **BAJO** |
| `document-actions.ts`, `DocumentIntakeCenter.tsx` | update estado documento | PATCH | status, reviewed_* | Doble revisión | **MEDIO** |

---

## 4. Recuento

| Nivel | Nº de flujos | Concentración |
|---|---|---|
| CRÍTICO | 6 | Edición de servicio (desktop y móvil), compensación (2 entradas), horas del día, saldo de adelantos |
| ALTO | 18 | Payroll/reconciliación, importaciones, cierre de turno, permisos, ubicaciones, W9, company_settings |
| MEDIO | 16 | PATCH acotados, ajustes, incidencias |
| BAJO | 14 | RPC validadas, append-only, campo único de un solo editor |

**Patrón raíz único** (no son 54 bugs, es uno solo repetido):
> El cliente lee una fila, la mantiene en memoria un tiempo indeterminado, y luego escribe
> basándose en esa lectura sin declarar sobre qué versión estaba decidiendo.
> El servidor acepta la escritura porque nunca se le dijo qué versión esperaba el cliente.

---

## 5. Estrategia única de concurrencia para Stafly

**Nombre: Versioned Write Contract (VWC).**
Una sola política, aplicable a toda escritura de mutación del ecosistema. No hay excepciones por
pantalla ni por módulo; sólo hay tres clases de escritura y cada una tiene una regla.

### 5.1 Principio

> Toda escritura que **modifica** una fila existente debe declarar sobre qué versión de esa fila
> se tomó la decisión. El servidor rechaza la escritura si la versión ya no es la vigente.
> El cliente nunca resuelve el conflicto en silencio: siempre lo muestra a la persona.

### 5.2 Las tres clases de escritura

| Clase | Definición | Regla |
|---|---|---|
| **A — Creación** | Inserta una fila nueva | Idempotencia por clave de intención (client-generated key), no versión |
| **B — Edición de atributos** | Modifica columnas de una fila existente | **Obligatorio** `expected_version`. Rechazo `409` si no coincide |
| **C — Transición de estado** | Cambia la máquina de estados (aprobar, cerrar, cancelar, asignar) | **Obligatorio** RPC transaccional que valide estado previo. Nunca `.update` directo desde el cliente |

Hoy: la clase C existe parcialmente (turnos), la clase B no existe en absoluto, la clase A no es
idempotente.

### 5.3 Mecanismo (único para todo el producto)

1. **Columna de versión canónica.** Cada tabla editable expone `updated_at` (ya existe en la
   mayoría) como token de versión. No se introduce una columna `version` nueva: se usa
   `updated_at` con precisión de microsegundos y un trigger `BEFORE UPDATE` que la refresca
   siempre. Sirve además como valor legible por humanos en el mensaje de conflicto.
2. **Un único punto de escritura en el cliente.** Todas las ediciones de clase B pasan por un
   helper genérico —evolución de `updateShiftVerified`, generalizado a cualquier tabla:
   recibe `{ table, id, patch, expectedVersion }`, aplica `.eq("updated_at", expectedVersion)`,
   y si `0 rows` devuelve un resultado tipado `conflict` (no un throw genérico).
   Se prohíbe `supabase.from(...).update(...)` fuera de ese helper mediante regla de lint.
3. **PATCH obligatorio, snapshot prohibido.** El helper sólo acepta las columnas realmente
   cambiadas, calculadas contra la fila canónica **vigente** (la de `service-state`), no contra el
   snapshot de apertura del formulario. Esto elimina de raíz los CRÍTICOS de clase B: aunque dos
   personas editen a la vez, si tocan campos distintos no hay colisión de contenido, sólo de versión.
4. **Resolución de conflicto con una sola UI.** Un único componente de conflicto para todo Stafly:
   muestra *qué cambió, quién lo cambió y cuándo*, y ofrece dos salidas —"Recargar y revisar" o
   "Aplicar sólo mis campos sobre la versión nueva". Nunca hay "guardar de todos modos" ciego.
   Encaja con el contrato de feedback OX-1 (Título + Hecho + Consecuencia + Acción).
5. **Clase C migra a RPC.** Toda transición de estado —aprobar horas, cerrar turno, aprobar
   movimiento, mover saldo de adelanto, resolver incidencia, cambiar permisos— se implementa como
   RPC `SECURITY DEFINER` que valida estado previo dentro de la transacción. El saldo de adelantos
   se actualiza con aritmética en SQL (`balance = balance + $delta`), nunca con read-modify-write
   en el cliente.
6. **Clase A idempotente.** Toda creación lleva una `intent_key` generada en cliente con índice
   único; el reintento devuelve la fila existente en lugar de duplicar. Cubre el doble envío en
   creación de servicios, movimientos e importaciones.
7. **Importaciones fuera del carril interactivo.** Los flujos masivos (`ImportSchedule`,
   `ImportConnecteam`, `ImportPayrollExtras`) no compiten campo a campo: se ejecutan como lote
   con bloqueo de rango por empresa+periodo y reportan qué filas no aplicaron por edición manual
   posterior, en lugar de pisarlas.

### 5.4 Orden de adopción propuesto (a ejecutar en un P0.2, no ahora)

1. Infraestructura VWC: helper único + tipo `conflict` + UI de conflicto + regla de lint.
2. Los 6 CRÍTICOS.
3. Los 18 ALTOS, agrupados por tabla (no por pantalla).
4. MEDIOS por barrido, ya sin decisiones de diseño pendientes.
5. BAJOS: sólo se verifica que no regresen a escritura directa.

### 5.5 Límites explícitos

- No se toca RLS, tenants, `payroll`, `time_entries` ni contratos existentes en esta auditoría.
- No se propone reemplazo masivo de código: la política es un carril nuevo al que los editores se
  migran de uno en uno, con la regla de lint impidiendo retrocesos.
- `updateShiftVerified` no se elimina: se generaliza. Su verificación post-escritura sigue siendo
  útil como detección de RLS silencioso, pero deja de ser la única defensa.

---

## 6. Estado

**P0 de integridad: ABIERTO.** Esta entrega es únicamente el mapa. No se ha modificado código.
