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
| Ejecución end-to-end de `consolidate_period_base_pay` en tenant real | ⚠️ **UNVERIFIED** | El rol del entorno de QA no puede ejecutar funciones ni escribir datos de producción; ejecutar la consolidación real habría modificado nómina viva, explícitamente prohibido |
| Disparo del trigger de inmutabilidad con privilegio de escritura | ⚠️ **UNVERIFIED** | La denegación ocurrió antes por falta de grant; el trigger es la segunda barrera y no pudo ejercitarse sin un rol privilegiado |

---

## Criterios de aceptación

| Criterio | Estado |
|---|---|
| Cada consolidación crea un snapshot verificable | ✅ implementado (ejecución en vivo UNVERIFIED) |
| El snapshot usa horas reales de `time_entries` | ✅ |
| Cambios futuros de tarifa no alteran historia | ✅ |
| Periodos `closed` y `paid` inmutables | ✅ |
| Missing rate nunca genera $0 | ✅ |
| Fuente de tarifa explícita | ✅ |
| Payroll reconstruible sin consultar tarifas actuales | ✅ |
| Tests, typecheck y QA | ✅ typecheck y QA estructural; QA en vivo parcialmente UNVERIFIED |

---

## Confirmación

**Cada pago consolidado conserva una fotografía inmutable de las horas reales, la tarifa aplicada, su origen y la regla utilizada; cambios futuros no alteran periodos históricos.**
