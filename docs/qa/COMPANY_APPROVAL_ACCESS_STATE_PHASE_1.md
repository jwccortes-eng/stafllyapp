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

## 6. QA

| Caso | Resultado |
|---|---|
| Signup público entra en revisión, sin acceso operativo | VERIFICADO (inserción sintética en transacción con `ROLLBACK`: `needs_review` / `restricted` / `is_active=false`) |
| Estructura, CHECKs y backfill sin estados huérfanos | VERIFICADO |
| Trigger de bloqueo de escritura directa instalado | VERIFICADO (estructural) |
| RPC no ejecutable por `anon`; sin sesión responde `denied` | VERIFICADO (grants + rama `auth.uid() IS NULL`) |
| Matriz de capacidades y no bloqueo de histórico | VERIFICADO (11/11 tests) |
| Aprobación humana activa el acceso | UNVERIFIED en vivo |
| Rechazo con motivo obligatorio y auditoría | UNVERIFIED en vivo |
| `grace` con avisos, `restricted`/`suspended` con acceso mínimo | UNVERIFIED en vivo |
| Idempotencia de reintento y conflicto de versión | UNVERIFIED en vivo |

**Limitación:** el rol de la consola de trabajo no puede ejecutar la RPC ni actualizar `companies` (sin `EXECUTE` ni `UPDATE`), y tampoco puede borrar filas, por lo que no existe forma de ejecutar las transiciones reales con rollback garantizado desde aquí. Ejecutar esos casos requiere una sesión real de propietario global sobre el tenant demo. No se ejecutaron transiciones sobre empresas reales.

## 7. Corrección aplicada durante el QA

La auditoría guardaba en `from_approval_state` / `from_access_state` el valor *esperado* enviado por la pantalla (podía ser nulo). Ahora guarda el estado **real** anterior leído bajo `FOR UPDATE`, junto con la versión real previa.

## Confirmación

Las compañías tienen estados separados de aprobación, condición comercial y acceso operativo; ninguna empresa pública se activa sin revisión humana.
