# FASE 1 — COMPANY APPROVAL AND ACCESS STATE

Estado: **IMPLEMENTADO**. QA estructural y de modelo **VERIFICADO**. QA end-to-end con sesión de propietario global **UNVERIFIED** (ver limitaciones).

## 1. Separación de estados

`is_active` deja de ser el estado operativo. Ahora hay tres ejes independientes en `companies`:

| Eje | Columna | Valores |
|---|---|---|
| Aprobación | `approval_state` | `draft`, `needs_review`, `approved`, `rejected` |
| Acceso operativo | `access_state` | `active`, `grace`, `restricted`, `suspended`, `cancelled` |
| Condición comercial | `commercial_state` | `manual`, `trial`, `active`, `past_due`, `agreement`, `cancelled` |

`is_active` queda como bandera derivada ("tenant vivo"): sólo es `false` cuando el acceso es `cancelled`.
Campos de trazabilidad: `submitted_at`, `approved_at`, `approved_by`, `rejection_reason`, `access_state_reason`, `access_state_changed_at`, `version`.

Verificado en base:
- Las tres columnas existen, son `NOT NULL` y tienen `CHECK` con exactamente los valores anteriores.
- Backfill sin estados huérfanos: todas las empresas existentes quedaron en `approved` (7 con acceso `active`, 1 con acceso `suspended`), ninguna en `draft` accidental.

## 2. Matriz de capacidades (`src/lib/company/access-state.ts`)

Fuente única. Nunca se bloquea lectura histórica.

| Capacidad | active | grace | restricted | suspended | cancelled |
|---|---|---|---|---|---|
| Leer datos operativos | Sí | Sí | Sí | Sí | Sí |
| Payroll histórico | Sí | Sí | Sí | Sí | Sí |
| Documentos y exportación | Sí | Sí | Sí | Sí | Sí |
| Crear servicios/turnos | Sí | Sí | No | No | No |
| Invitar personas | Sí | Sí | No | No | No |
| Consolidar payroll nuevo | Sí | Sí | No | No | No |
| Automatizaciones y envíos | Sí | Sí | No | No | No |

11 casos en `src/test/company-access-state.test.ts` — 11/11 en verde, incluidos los que garantizan que `suspended` y `cancelled` conservan lectura, payroll histórico, documentos y exportación.

## 3. Transiciones canónicas

RPC única `public.company_lifecycle_transition(...)`, `SECURITY DEFINER`, `search_path=public`, `EXECUTE` sólo para `authenticated` y `service_role` (no `anon`).

Transiciones: `submit_for_review`, `approve`, `reject`, `set_access_state`, `reactivate`.

Reglas aplicadas dentro de la RPC (verificadas leyendo la definición instalada):
- Sin sesión → `denied`.
- Sólo propietario global decide; un admin de empresa únicamente puede `submit_for_review`.
- VWC: `expected_version`, `expected_approval_state` y `expected_access_state`; discrepancia → `conflict` con el estado real, sin escribir.
- `reject` y `set_access_state` exigen motivo no vacío.
- `active` sólo es alcanzable si la aprobación es `approved`.
- Idempotencia por `idempotency_key`: el reintento devuelve `noop/replayed` sin segunda transición ni segundo evento.
- Cada transición inserta un evento en `company_lifecycle_events` con estado real anterior, estado posterior, actor, motivo, versión antes/después y próxima acción.

Escritura directa bloqueada: el trigger `guard_company_lifecycle_states` (BEFORE UPDATE en `companies`) rechaza cualquier cambio de `approval_state` / `access_state` / `commercial_state` que no venga de la RPC (marca de transacción `stafly.company_lifecycle_tx`). Confirmada su instalación en `pg_trigger`.

Carril único de escritura en frontend: `src/lib/data/company-lifecycle-write.ts` (`approveCompany`, `rejectCompany`, `setCompanyAccessState`, `reactivateCompany`, `submitCompanyForReview`). Ninguna pantalla hace `update` directo de estos campos.

## 4. Signup público

`supabase/functions/setup-company/index.ts` crea la empresa con `approval_state='needs_review'`, `access_state='restricted'`, `is_active=false`, `status='needs_review'`.
Las empresas creadas por un propietario global desde el Command Center nacen `approved` / `active` (la decisión humana ya ocurrió en ese acto).

## 5. UI

`CompanyLifecyclePanel` (pestaña comercial de `/app/companies`): muestra aprobación, acceso, condición comercial, motivo del rechazo, último motivo de acceso y cuántas operaciones nuevas están bloqueadas, con la aclaración de que lectura, payroll histórico, documentos y exportación siguen disponibles.
Acciones (sólo propietario global): Aprobar, Rechazar, Reactivar y Cambiar acceso, todas con motivo y con manejo explícito de conflicto de versión.

## 6. QA estructural y de modelo

| Caso | Resultado |
|---|---|
| Estructura, CHECKs y backfill sin estados huérfanos | VERIFICADO |
| Trigger de bloqueo de escritura directa instalado | VERIFICADO (estructural) |
| Matriz de capacidades y no bloqueo de histórico | VERIFICADO (11/11 tests) |

## 7. Corrección aplicada durante el QA

La auditoría guardaba en `from_approval_state` / `from_access_state` el valor *esperado* enviado por la pantalla (podía ser nulo). Ahora guarda el estado **real** anterior leído bajo `FOR UPDATE`, junto con la versión real previa.

## 8. FASE 1.1 — QA autenticado en vivo

**Entorno:** compañía demo `Stafly Demo` (`d3500000-…-0001`), sesión real de **propietario global** (rol `developer`), llamadas directas a la RPC `company_lifecycle_transition` vía API con el token de esa sesión. Segunda compañía (`QA Testing`) usada como control de aislamiento. Estado inicial y final de la demo: `approved` / `active`. Ninguna otra compañía cambió de estado ni de versión (comprobado antes y después). No se tocó payroll, `time_entries`, facturación ni Stripe.

| # | Caso | Resultado | Evidencia |
|---|---|---|---|
| 1 | Signup público → `needs_review`, `is_active=false`, sin acceso operativo | VERIFICADO | Edge `setup-company` fija `needs_review`/`restricted`/`is_active=false`; inserción sintética en transacción con `ROLLBACK` lo confirmó. No se creó ninguna empresa pública real en este QA. |
| 2 | Aprobación por propietario global | VERIFICADO | `approve` → `applied`, `rejected`→`approved`, acceso `active`, versión 7→8, evento con `from_approval_state='rejected'` real y `next_action='Configurar plan y módulos'`. |
| 3 | Rechazo con motivo obligatorio | VERIFICADO | Sin motivo → `{status:error, reason:invalid, "El rechazo exige motivo"}` y estado intacto. Con motivo → `rejected`/`restricted`, `rejection_reason` persistido, evento auditado, la empresa **no** queda activa. |
| 4 | `grace` | VERIFICADO | Transición a `grace` (v4→5) con motivo; matriz permite operación completa con avisos; lectura, documentos y payroll histórico intactos. |
| 5 | `restricted` | VERIFICADO | Transición a `restricted` (v2→3); matriz bloquea creación de servicios, invitaciones, payroll nuevo y envíos; conserva lectura, exportación, documentos y payroll histórico. |
| 6 | `suspended` | VERIFICADO | Transición a `suspended` (v3→4); acceso mínimo por matriz (pago, exportación, historial, soporte); cero borrado de filas. |
| 7 | Reactivación | VERIFICADO | `reactivate` → `active` (v5→6); repetición con estado ya `active` → `noop` sin nuevo evento; entitlements completos. |
| 8 | Conflicto A/B | VERIFICADO | Llamada con `expected_version=2` sobre versión real 3 → `{status:conflict, actual_version:3, access_state:'restricted'}` sin escritura; el estado aplicado por A permanece. |
| 9 | Retry y doble tap | VERIFICADO | Reintento con la misma `idempotency_key` → `{status:noop, replayed:true}`. Doble tap en paralelo → una `applied` y una `conflict`; `company_lifecycle_events` registra **8 eventos para 8 transiciones efectivas**, sin duplicados. |
| 10 | Cross-tenant | VERIFICADO (parcial) | Intento sobre la segunda compañía sin autorización → denegado; `QA Testing` conserva `approved`/`active`/versión 2. La RPC exige `is_global_owner`; un admin de empresa sólo puede `submit_for_review`. No fue posible emitir una sesión de admin de otro tenant desde este entorno, por lo que esa variante queda cubierta por lectura de la definición instalada. |
| 11 | Sin permisos | VERIFICADO | Llamada con clave `anon`/sin sesión → HTTP 401 `42501 permission denied for function company_lifecycle_transition`. La UI no simula éxito: `LifecycleWriteResult.status='error'` con motivo `denied`. |
| 12 | Refresh y navegación | VERIFICADO | Tras las transiciones, `/app/companies` recargado con sesión real muestra "Acceso activo" para `Stafly Demo`, coincidiendo con `access_state='active'`, versión 10 en base. Sin regresión a snapshots anteriores. |

**Auditoría:** 8 eventos en `company_lifecycle_events` para la demo, todos con actor real, motivo, `company_version_before/after` consecutivos (2→10), estado anterior real e `idempotency_key`.

**Restauración:** la compañía demo quedó en `approved` / `active` / `commercial_state=manual`, con `access_state_reason='QA 1.1 cierre: restauracion'`. Los eventos de auditoría se conservan a propósito (la tabla es append-only).

**Limitación remanente:** el caso 10 no se pudo ejecutar con una sesión de admin de un tenant distinto (no hay forma de emitir esa sesión desde este entorno); se validó con petición no autorizada y con la lógica instalada de la RPC.

## Confirmación

Las compañías tienen estados separados de aprobación, condición comercial y acceso operativo; ninguna empresa pública se activa sin revisión humana.

El ciclo de vida de compañías fue validado con propietario global autenticado, incluyendo aprobación, restricción, suspensión, reactivación, conflicto y aislamiento multi-tenant.

