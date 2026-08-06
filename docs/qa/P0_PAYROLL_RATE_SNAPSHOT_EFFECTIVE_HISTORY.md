# P0 — PAYROLL RATE SNAPSHOT AND EFFECTIVE HISTORY (Fase 2)

Fuentes: `docs/architecture/STAFLY_PAY_VALUES_COMPENSATION_FULL_AUDIT.md`, `docs/qa/P0_PAYROLL_RATE_TRUTH_AND_SAFETY.md`.

Alcance respetado: no se rediseñó UI, no se migró `compensation_profiles`, no se cambió la fórmula de overtime, no se usan horas programadas, no se recalculan periodos `closed`/`paid`, no se modificaron datos históricos.

---

## 1. Auditoría del estado previo

Tabla `payroll_rate_snapshots` (preexistente):

| Hallazgo | Resultado |
|---|---|
| Filas | **0** (vacía) |
| Columnas | `company_id, employee_id, source_record_type, source_record_id, payment_mode, hourly_rate, daily_rate, half_day_rate, ride_rate, snapshot_reason, effective_date, created_at` |
| Periodo de nómina | **No existe** (`payroll_period_id` ausente) |
| Horas reales | **No existen** (ni totales, ni regular/overtime, ni `time_entry_ids`) |
| Regla de overtime | **No existe** |
| Monto bruto | **No existe** |
| Versión / actor / auditoría | **No existen** |
| Inmutabilidad | **Ninguna** (sin trigger; `UPDATE`/`DELETE` posibles) |
| RLS | Activa: `rate_snapshots_select_admin`, `rate_snapshots_select_self`, `rate_snapshots_insert` |
| Código que la escribe | **Ninguno** en `src/` (solo lectura en `useCompensationSnapshot.tsx`) |

**Por qué no se usaba:** fue diseñada como foto de *configuración de compensación* (modos de pago por trabajador), no como foto de *pago consolidado*. No tiene periodo, horas ni monto, así que no puede reconstruir un pago. **Conclusión: inadecuada.** Se deja intacta (no se migra ni se borra) y se crea una tabla canónica nueva.

---

## 2. Snapshot canónico — `public.payroll_period_rate_snapshots`

| Campo | Contenido |
|---|---|
| `company_id`, `employee_id`, `payroll_period_id` | Identidad y tenant |
| `concept_id`, `concept_name` | Concepto de tarifa aplicado (CASO H) |
| `time_entry_ids` (uuid[]), `time_entry_count` | Referencia verificable a horas reales |
| `hours_source` | `time_entries` o `legacy_shifts` — **nunca horas programadas** |
| `total_hours`, `regular_hours`, `overtime_hours` | Horas reales consolidadas |
| `pay_rate`, `currency` | Tarifa aplicada (nunca 0) |
| `rate_source`, `is_legacy_source` | `legacy_shifts` / `concept_employee_rate` / `concept_default` (CASO G) |
| `source_entity_id`, `source_version` | Registro origen y su vigencia (`effective_from` o `unversioned`) |
| `effective_date`, `effective_from`, `effective_to` | Ventana de vigencia usada |
| `rate_changed_mid_period`, `rate_by_work_date` | Detección y detalle por fecha real de trabajo |
| `overtime_multiplier`, `overtime_threshold_hours` | Regla de overtime vigente en la consolidación |
| `gross_base_amount` | Monto base pagado |
| `period_status_at_resolution`, `resolved_at`, `resolved_by` | Contexto y actor |
| `consolidation_version` | Versión incremental por (periodo, trabajador) |
| `audit_reference` | FK lógica a `payroll_consolidation_audit.id` |

Índice único: `(payroll_period_id, employee_id, consolidation_version)`.

Escritura: **solo** desde `consolidate_period_base_pay` (SECURITY DEFINER). `authenticated` tiene únicamente `SELECT` (verificado: `relacl = authenticated=r`). `anon` sin ningún privilegio.

---

## 3. Inmutabilidad

- Trigger `payroll_period_rate_snapshots_no_update` — `BEFORE UPDATE OR DELETE ... FOR EACH ROW` → `RAISE EXCEPTION` (`42501`). **Append-only absoluto**, no solo para periodos cerrados.
- Sin privilegio `UPDATE`/`DELETE` para `authenticated`/`anon` (doble barrera: grants + trigger).
- `consolidate_period_base_pay` sigue fallando cerrado en `closed`/`paid` y ahora **registra el intento** (`result = 'blocked_period_locked'` en `payroll_consolidation_audit`).
- Reconsolidación de un periodo abierto **no modifica** snapshots: agrega `consolidation_version + 1`; la historia previa permanece.

**Brecha reportada (no inventada):** no existe hoy un flujo administrativo de *reverso auditado* ni de *ajuste separado* sobre un periodo cerrado. Las correcciones deben canalizarse por `movements` / `payroll_adjustments`, que no están vinculados a snapshots. Queda como pendiente de Fase 3; **no se implementó**.

---

## 4. Effective dates

Fuentes con fecha efectiva:

| Fuente | Vigencia | Prioridad |
|---|---|---|
| `shifts.hourly_rate_usd` (legacy) | Implícita: el periodo importado | 1 |
| `concept_employee_rates` | `effective_from` / `effective_to` (ambas nullable) | 2 |
| `concepts.default_rate` | **Sin vigencia** | 3 |
| `compensation_profiles` | No participa en el pago (Fase 1) | — |

Reglas definidas (documentadas, sin migración amplia):
- **Vigente desde/hasta:** `effective_from` ≤ fecha ≤ `effective_to`; `NULL` = abierto.
- **Cambio futuro:** una tarifa con `effective_from` posterior a la fecha de trabajo no aplica (CASO B).
- **Cambio retroactivo:** cambia solo resoluciones futuras; los periodos ya consolidados conservan su snapshot.
- **Solapamiento:** gana el `effective_from` más reciente que cubra la fecha (`ORDER BY effective_from DESC NULLS LAST`).

**Qué fecha gobierna:** la **fecha real de trabajo** (`time_entries.clock_in::date`), no la fecha de consolidación ni la fecha del servicio programado. Justificación: es la única fecha respaldada por evidencia de reloj; la fecha de consolidación es administrativa y variable, y la fecha del servicio puede diferir del trabajo efectivo (turnos que cruzan medianoche, reprogramaciones).

**Estado actual, sin cambiar la fórmula:** el cálculo del pago sigue resolviendo la tarifa **a nivel de periodo** (`resolve_payroll_hourly_rate`, ventana del periodo). La Fase 2 añade `resolve_payroll_hourly_rate_at(company, employee, work_date)` y guarda `rate_by_work_date` + `rate_changed_mid_period` en el snapshot, de modo que un cambio de tarifa a mitad de periodo queda **visible y auditable**. Recalcular el pago por fecha de trabajo cambiaría la fórmula y **queda fuera de este alcance** (Fase 3).

---

## 5. Casos obligatorios

| Caso | Comportamiento | Mecanismo |
|---|---|---|
| A — trabajo 1-ago a $20, tarifa sube el 5-ago a $25 | El pago consolidado del 1-ago conserva $20 | Snapshot inmutable + append-only; ninguna lectura posterior consulta la tarifa actual |
| B — tarifa con vigencia 15-ago | No aplica a trabajo anterior | `effective_from <= work_date` en `resolve_payroll_hourly_rate_at`; ventana de periodo en el resolver de pago |
| C — horas aprobadas y luego cambia tarifa | El snapshot explica qué valor se aplicó | `pay_rate`, `rate_source`, `source_entity_id`, `effective_from/to`, `resolved_at`, `rate_by_work_date` |
| D — periodo `closed` | Sin cambios en snapshot | Guard fail-closed + trigger append-only |
| E — periodo `paid` | Sin cambios en snapshot | Igual que D + auditoría del intento |
| F — trabajador sin tarifa | **No** se crea snapshot; no se paga $0 | `WHERE i.result='consolidated' AND rate > 0`; audit `blocked_missing_rate` |
| G — tarifa legacy | Origen explícito | `rate_source='legacy_shifts'`, `is_legacy_source=true`, `hours_source='legacy_shifts'` |
| H — tarifa por concepto | Concepto y versión | `concept_id`, `concept_name`, `source_entity_id`, `source_version=effective_from` |

---

## 6. Reconstrucción histórica

Todo se responde leyendo **solo** el snapshot, sin consultar la tarifa actual:

| Pregunta | Campo |
|---|---|
| Cuánto se pagó | `gross_base_amount` |
| Cuántas horas reales | `total_hours`, `regular_hours`, `overtime_hours`, `time_entry_ids` |
| Qué tarifa | `pay_rate`, `currency` |
| De dónde salió | `rate_source`, `source_entity_id`, `effective_from/to`, `is_legacy_source` |
| Qué regla de overtime | `overtime_threshold_hours`, `overtime_multiplier` |
| Cuándo se resolvió | `resolved_at` |
| Quién consolidó | `resolved_by` |
| Qué versión existía | `consolidation_version`, `source_version`, `audit_reference` |

Lectura en cliente: `src/lib/payroll/rate-snapshot.ts` (`fetchLatestRateSnapshot`, `fetchPeriodRateSnapshots`, `latestPerEmployee`, `describeSnapshot`) y `src/components/payroll/PayrollRateSnapshotCard.tsx`, integrado en `PayrollRateTruthPanel`.

---

## 7. Auditoría

`payroll_consolidation_audit` registra por corrida, con `actor_id`, `company_id`, `period_id`, `period_status`, `created_at`:

- `consolidated` → snapshot creado (`audit_reference` enlaza ambos);
- `blocked_missing_rate` → tarifa faltante, sin snapshot;
- `blocked_period_locked` → intento de reconsolidación sobre `closed`/`paid` (**nuevo**);
- `is_legacy_source` → origen legacy;
- `fallback_used` → tarifa por defecto del concepto.

`activity_log` conserva el resumen de la corrida, ahora con `rate_snapshots_created`.

---

## 8. Seguridad

- RLS activa (`relrowsecurity = t`): lectura para owner global, owner/admin de la empresa o permiso `manage_compensation`; el trabajador ve solo lo suyo.
- Aislamiento multi-tenant: `company_id` en tabla, en todas las políticas y en cada predicado de la consolidación.
- `authenticated` solo `SELECT`; `anon` sin privilegios; `service_role` completo.
- No se tocaron `time_entries`, pay runs, tarifas reales, `compensation_profiles`, RLS previa ni datos de producción.
- Horas pagables provienen exclusivamente de `time_entries`; `scheduled_shifts` se usa solo como referencia de anomalías, nunca como horas pagables.

---

## 9. QA

| Caso | Estado | Evidencia |
|---|---|---|
| Estructura, índices, RLS y grants del snapshot | ✅ | `relrowsecurity=t`, 2 políticas, `relacl` con `authenticated=r`, `anon` ausente |
| Trigger append-only instalado y habilitado | ✅ | `payroll_period_rate_snapshots_no_update`, `BEFORE DELETE OR UPDATE`, `tgenabled='O'` |
| `UPDATE`/`DELETE` desde rol de aplicación | ✅ denegado | `ERROR: permission denied for table payroll_period_rate_snapshots` (prueba en transacción, `ROLLBACK`, 0 filas persistidas) |
| Inserción de snapshot con forma canónica | ✅ | insert de prueba aceptado en transacción y revertido (`rows_after_rollback = 0`) |
| Resolver por fecha real de trabajo | ✅ | `resolve_payroll_hourly_rate_at` devuelve `missing_rate=true` sin inventar $0 |
| Missing rate no genera $0 | ✅ por construcción | filtro `rate > 0` + `result='consolidated'`; sin fallback a 0 en ninguna rama |
| Legacy identificado | ✅ por construcción | `rate_source='legacy_shifts'` propagado desde el resolver |
| Periodos `closed`/`paid` bloqueados | ✅ por construcción | guard fail-closed previo a toda escritura + auditoría del intento |
| Retry idempotente / doble submit | ✅ por diseño | append-only versionado: nunca sobrescribe; `period_base_pay` conserva `ON CONFLICT` previo |
| Multi-tenant aislado | ✅ | `company_id` obligatorio en políticas y predicados |
| Paridad mobile/desktop | ✅ | superficie compartida `PayrollRateTruthPanel` → `PayrollRateSnapshotCard` |
| Typecheck | ✅ | `tsgo --noEmit` sin errores |
| Ejecución end-to-end de `consolidate_period_base_pay` | ✅ **VERIFICADO** (QA aislado, sección 10) | tenant sintético en transacción revertida |
| Disparo del trigger de inmutabilidad con privilegio de escritura | ✅ **VERIFICADO** (QA aislado, sección 10) | `42501` con rol privilegiado del tooling |

---

## 10. QA aislado en vivo (2026-08-06)

Entorno: **transacción controlada con `ROLLBACK` garantizado** sobre datos 100% sintéticos. No se usó ningún trabajador, periodo ni tarifa real; no se recalculó nómina histórica; no se desactivó ningún trigger; no se usó superusuario.

### Datos sintéticos (IDs documentados, todos revertidos)

| Entidad | ID |
|---|---|
| Empresa demo A | `aaaaaaaa-0000-4000-8000-000000000001` |
| Empresa demo B | `bbbbbbbb-0000-4000-8000-000000000002` |
| Worker sintético A / B | `aaaaaaaa-1111-…0001` / `bbbbbbbb-1111-…0002` |
| Periodo `open` A / B | `aaaaaaaa-2222-…0001` / `bbbbbbbb-2222-…0002` |
| Periodo `closed` / `paid` | `aaaaaaaa-2222-…0002` / `aaaaaaaa-2222-…0003` |
| Concepto "Hourly Rate" A / B | `aaaaaaaa-3333-…0001` / `bbbbbbbb-3333-…0002` |
| Tarifa efectiva conocida | A = **$20.00** desde `2026-08-01`; B = **$33.00** |
| `time_entries` aprobados A | 2 × 8h reales (2026-08-03, 2026-08-04) = **16h** |

### 10.1 Consolidación en vivo (periodo `open` A)

`consolidate_period_base_pay` → `success: true`, `employees_consolidated: 1`, `rate_snapshots_created: 1`, `source: time_entries`.

Snapshot resultante, campo por campo:

| Campo | Valor |
|---|---|
| `company_id` / `employee_id` / `payroll_period_id` | A / worker A / periodo open A |
| `time_entry_ids` / `time_entry_count` | 2 ids reales / `2` |
| `hours_source` | `time_entries` (**no** scheduled) |
| `total_hours` / `regular_hours` / `overtime_hours` | `16.00` / `16.00` / `0.00` |
| `pay_rate` / `currency` | `20.00` / `USD` |
| `rate_source` / `is_legacy_source` | `concept_employee_rate` / `false` |
| `source_entity_id` / `source_version` | `6c996e23-…` / `2026-08-01` |
| `effective_date` / `effective_from` / `effective_to` | `2026-08-15` / `2026-08-01` / `null` |
| `overtime_multiplier` / `overtime_threshold_hours` | `1.5` / `40` |
| `gross_base_amount` | `320.00` (= 16 × 20) |
| `resolved_by` (actor) / `resolved_at` | actor de sistema / timestamp |
| `consolidation_version` / `audit_reference` | `1` / `4cf1828d-…` |
| `rate_by_work_date` | `[{2026-08-03, 20}, {2026-08-04, 20}]` |

Verificación cruzada: suma de horas de los `time_entry_ids` = **16.00 h**, idéntica a `total_hours`; todos los ids caen dentro del periodo. `snapshots_con_rate_cero = 0` (ningún snapshot con `missing_rate`).

### 10.2 Retry y doble submit

3 corridas consecutivas sobre el mismo periodo:

- `period_base_pay`: **1 fila** (sin duplicar, `ON CONFLICT`).
- Snapshots: versiones `1, 2, 3`, todas con `rate 20.00`, `hours 16.00`, `gross 320.00`.

Comportamiento correcto por diseño append-only: **no duplica pago ni sobrescribe historia**; cada corrida agrega una versión trazable. Observación abierta (no corregida en esta fase): un doble submit accidental infla el contador de versiones aunque el contenido sea idéntico; una deduplicación por hash de payload queda como mejora opcional.

### 10.3 Cambio de tarifa posterior

Tarifa sintética cambiada de `20.00` → `99.00`:

- `resolve_payroll_hourly_rate_at(...,'2026-08-03')` devuelve **99.00** (resolución actual).
- Snapshots v1/v2/v3 siguen en **20.00 / $320.00**.
- `period_base_pay` del periodo original sigue en **$320.00 / 16.00 h**.

Historia inmutable confirmada.

### 10.4 Trigger de inmutabilidad

Ejecutado con el **rol privilegiado controlado** del tooling (no superusuario, trigger activo):

| Intento | Resultado |
|---|---|
| `UPDATE payroll_period_rate_snapshots` | `42501` — *append-only: UPDATE is not allowed (period …, employee …)* |
| `DELETE payroll_period_rate_snapshots` | `42501` — *append-only: DELETE is not allowed (period …, employee …)* |
| Estado posterior | 3 filas intactas, `pay_rate` = `20.00, 20.00, 20.00` — **cero cambios** |

Barreras verificadas: `relrowsecurity = true`; `relacl` = `authenticated=r` (solo lectura), `service_role` completo, `anon` ausente; trigger `payroll_period_rate_snapshots_no_update` con `tgenabled = 'O'` (habilitado). El rol de aplicación (`authenticated`) no tiene siquiera privilegio de escritura, y el trigger bloquea incluso a roles con privilegio.

### 10.5 CLOSED / PAID — defecto detectado y corregido

**Hallazgo (defecto real):** al intentar consolidar un periodo `closed` o `paid`, la función fallaba con `23502 null value in column "employee_id" of relation "payroll_consolidation_audit"`. El fail-closed se mantenía (0 snapshots, 0 `period_base_pay`), pero **la auditoría del intento nunca se guardaba** y la UI recibía un error crudo en vez del mensaje controlado.

**Corrección aplicada:** `payroll_consolidation_audit.employee_id` pasa a ser nullable (los registros de alcance de periodo, como `blocked_period_locked`, no corresponden a un trabajador). UI ajustada: `PayrollMissingRateBanner` ignora filas sin trabajador al contar por persona.

**Reverificación aislada tras el fix:**

| Periodo | Retorno | Auditoría | Snapshots | `period_base_pay` |
|---|---|---|---|---|
| `closed` | `success:false`, `error_code: period_locked`, mensaje controlado | `blocked_period_locked` (`employee = null`) | 0 | 0 |
| `paid` | `success:false`, `error_code: period_locked`, mensaje controlado | `blocked_period_locked` (`employee = null`) | 0 | 0 |

### 10.6 Multi-tenant

| Verificación | Resultado |
|---|---|
| Consolidación empresa B | `success: true`, snapshot `rate 33.00`, `5.00 h`, `gross 165.00` |
| Aislamiento de snapshots | Cada snapshot lleva su `company_id`; A y B no se mezclan |
| Escritura cruzada (periodo de B con `company_id` de A) | Rechazada: `"Period not found or does not belong to company"`; `snapshots_de_B_bajo_company_A = 0` |
| Lectura cruzada | RLS activa, políticas `period_rate_snapshots_select_admin` y `…_select_self`, ambas de solo lectura y con `company_id` |

### 10.7 Limpieza y cero impacto

Toda la prueba se ejecutó dentro de una transacción abortada deliberadamente (`RAISE EXCEPTION` final), lo que garantiza el rollback. Verificación posterior en la base:

`payroll_period_rate_snapshots = 0`, `payroll_consolidation_audit = 0`, empresas demo = 0, periodos sintéticos = 0, `time_entries` sintéticos = 0, empleados sintéticos = 0, `period_base_pay` sintético = 0.

No se borró auditoría de nómina real (no existía ninguna previa a esta prueba). No se tocó ningún periodo, tarifa, trabajador ni pago productivo. El único cambio permanente es la corrección de esquema del punto 10.5.

---

## Criterios de aceptación

| Criterio | Estado |
|---|---|
| Cada consolidación crea un snapshot verificable | ✅ verificado en vivo (10.1) |
| El snapshot usa horas reales de `time_entries` | ✅ verificado (16h reales = snapshot) |
| Cambios futuros de tarifa no alteran historia | ✅ verificado (10.3) |
| Periodos `closed` y `paid` inmutables | ✅ verificado tras el fix (10.5) |
| Retry / doble submit idempotente | ✅ verificado (10.2) |
| Trigger de inmutabilidad efectivo | ✅ verificado con rol privilegiado (10.4) |
| Multi-tenant aislado | ✅ verificado (10.6) |
| Missing rate nunca genera $0 | ✅ |
| Fuente de tarifa explícita | ✅ |
| Payroll reconstruible sin consultar tarifas actuales | ✅ |
| Cero impacto en payroll real | ✅ verificado (10.7) |

---

## Confirmación

**Cada consolidación crea un snapshot histórico inmutable y el trigger bloquea cualquier modificación posterior, sin tocar nómina real.**
