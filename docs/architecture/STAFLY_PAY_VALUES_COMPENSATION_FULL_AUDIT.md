# STAFLY — Auditoría completa: valores a pagar, tarifas y compensación

**Fecha:** 2026-08-05
**Tipo:** Investigación y reporte. **Cero cambios.**
**Método:** lectura estática de código (`src/`, `supabase/migrations/`, `supabase/functions/`) + consultas `SELECT` de solo lectura al catálogo y a conteos agregados. No se ejecutó ningún `INSERT`/`UPDATE`/`DELETE`/`ALTER`, ninguna migración y ninguna RPC de escritura.

---

## 1. Resumen ejecutivo

1. **Payroll nativo usa horas reales.** El único cálculo de pago ejecutado es el RPC `public.consolidate_period_base_pay(_company_id, _period_id)`, que lee `time_entries` con `status='approved'` y `clock_out IS NOT NULL`. **`scheduled_shifts` nunca se convierte en horas pagables**: solo se usa como referencia anti-fraude (desviación >3x) y para excluir turnos `pay_type='daily'` del cómputo horario. La regla está escrita explícitamente en `src/lib/payroll-reconciliation-engine.ts:5-11`.
2. **La tarifa que paga el sistema NO es la tarifa que edita la UI.** La cascada real del RPC es `shifts.hourly_rate_usd` (tabla legacy de import) → `concept_employee_rates.rate` → `concepts.default_rate` → `0`. La pantalla de Compensación edita `compensation_profiles.default_hourly_rate`, que **el RPC nunca lee**. Éste es el hallazgo crítico nº1.
3. **Existen dos subsistemas de compensación desconectados**: (A) `concepts` + `concept_employee_rates` + `movements` (el que paga), y (B) `compensation_profiles` + `company_compensation_rules` + `payroll_rate_snapshots` (el que se ve y se edita). Solo (B) está bajo VWC.
4. **Overtime es 1.5x hardcodeado en SQL** sobre umbral semanal configurable (default 40h). `overtime_hourly_rate` y `double_pay_hourly_rate` existen en tabla y en UI pero **no tienen consumidor de cálculo** (campos muertos). Double time real no existe.
5. **No hay snapshot histórico efectivo.** `payroll_rate_snapshots` tiene **0 filas** en producción; el helper existe (`useCompensationSnapshot.tsx`) pero no está cableado a un flujo activo. Payroll consulta la tarifa **vigente al momento de consolidar**, no la del día del servicio.
6. **Un periodo cerrado puede reconsolidarse.** No hay trigger ni política RLS que bloquee escrituras en `period_base_pay`/`movements` cuando `pay_periods.status IN ('closed','paid')` (138 cerrados, 8 pagados). La única protección real es `period_base_pay.import_id IS NOT NULL` (176 de 2 808 filas).
7. **Pay rate y bill rate viven separados en datos pero comparten etiqueta en UI** ("Rate"/"Tarifa" sin calificar). Y el generador legacy de líneas de factura tiene una tarifa **hardcodeada de $25/h** (`src/pages/admin/Invoices.tsx:150-159`).
8. **VWC cubre compensación pero no tarifas ni facturación.** `concept_employee_rates`, `company_compensation_rules`, `company_financial_policies`, `billing_clients`, `billable_service_blocks`, `invoices` y `legacy_invoices` se escriben con `.update()` directo, sin `expected_version`, sin trigger `vwc_bump_version` y sin auditoría.

---

## 2. Arquitectura actual

```
      EDICIÓN (lo que ve el admin)              CÁLCULO (lo que paga)
      ───────────────────────────               ─────────────────────
      compensation_profiles  ── VWC ✅               time_entries (approved)
        default_hourly_rate                               │ horas reales
        default_daily_rate                                ▼
        overtime_hourly_rate  ✖ muerto        consolidate_period_base_pay()
        double_pay_hourly_rate ✖ muerto                   │
        kitchen / bonus_transport ✖                       │ rate cascade:
              │                                           │  1 shifts.hourly_rate_usd (legacy import)
              │  (sin conexión)                           │  2 concept_employee_rates.rate
              ▼                                           │  3 concepts.default_rate
      payroll_rate_snapshots (0 filas)                    │  4 → 0
      company_compensation_rules (0 filas)                ▼
              │                                    period_base_pay + movements
              └── payroll-interpreter (imports)           │
                                                          ▼
                                              PayrollReviewQueue (read-only)
                                                          ▼
                                       export Connecteam / send-payroll-email
                                              (sin pay run financiero)

      BILL RATE (carril paralelo, sin conexión autoritativa)
      billing_clients → billable_service_blocks.rate → invoices / legacy_invoices
```

---

## 3. Inventario de datos

### 3.1 Tablas de tarifa / compensación (producción, conteos reales)

| Tabla | Filas | Claves | Effective date | Versión | Auditoría | RLS | Rol real |
|---|---:|---|---|---|---|---|---|
| `compensation_profiles` | 360 (348 activos, 349 empleados) | company_id, employee_id | `effective_from`/`effective_to` (12 con fin) | ✅ `version` + trigger `vwc_bump_version` | `compensation_change_log` (531) | ✅ 5 pol. | Fuente de UI, **no de payroll** |
| `concept_employee_rates` | 382 | employee_id, concept_id | `effective_from`/`to` (**0 filas con fecha**) | ❌ | ❌ ningún trigger | ✅ 7 pol. | **Fuente real de tarifa** (paso 2) |
| `concepts` | 49 (28 con `default_rate`) | company_id | — | ❌ | ❌ | ✅ 7 pol. | Fallback de tarifa (paso 3) |
| `shifts` (legacy import) | 10 | company_id, employee_id, period_id, import_id | — | ❌ | ❌ | ✅ 7 pol. | **Máxima prioridad** de tarifa (paso 1) |
| `payroll_rate_snapshots` | **0** | company_id, employee_id, source_record_type/id | `effective_date` | ❌ | insert-only | ✅ 3 pol. | Diseñado pero **no cableado** |
| `company_compensation_rules` | **0** | company_id | — | ❌ | ❌ | ✅ 2 pol. | Solo usado por el intérprete de imports |
| `period_base_pay` | 2 808 (176 con `import_id`) | company_id, employee_id, period_id | — | ❌ | `activity_log` del RPC | ✅ 7 pol. | Resultado del cálculo |
| `movements` | 872 (184 pendientes) | company_id, employee_id, period_id, concept_id | — | ❌ | `approval_status`, `approved_by` | ✅ 7 pol. | Bonos/deducciones/daily pay |
| `time_entries` | 7 411 | company_id, employee_id, shift_id | — | ✅ `version` + trigger | `updated_by`, `approved_by` | ✅ 8 pol. | **Horas pagables** |
| `pay_periods` | 212 (138 closed, 8 paid, 66 open) | company_id | `start_date`/`end_date` | ❌ | secuencia | ✅ 7 pol. | Ventana |
| `employee_financial_records` | 0 | company_id, employee_id | — | ✅ VWC (fase 2) | `employee_financial_ledger` | ✅ | Adelantos/préstamos |
| `company_financial_policies` | — | company_id | — | ❌ | ❌ | ✅ 3 pol. | Topes de anticipos/deducciones |
| `historical_payroll_entries` | 0 | company_id, employee_id, period_id | — | ❌ | ✅ 6 pol. | ✅ | Import Connecteam (read-only) |
| `billable_service_blocks` | 0 | company_id, client, shift | — | ❌ | `updated_at` | ✅ 4 pol. | **Bill rate** |
| `billing_clients` / `invoices` / `legacy_invoices` | 0 / 0 / — | company_id | — | ❌ | `invoice_activity_log` (solo invoices) | ✅ | Facturación |

### 3.2 Columnas monetarias de `compensation_profiles`

`default_hourly_rate`, `default_daily_rate`, `default_half_day_rate`, `default_ride_rate_regular`, `default_ride_rate_special`, `overtime_hourly_rate`, `kitchen_hourly_rate`, `bonus_transport_hourly_rate`, `double_pay_hourly_rate`, `inferred_hourly_rate`, `previous_inferred_rate` — todas `numeric NULL`. Solo 230 de 360 filas tienen `default_hourly_rate` y 230 `default_daily_rate`. **Ninguna es leída por el RPC de pago.**

### 3.3 Funciones relevantes

| Función | SECURITY | Rol |
|---|---|---|
| `consolidate_period_base_pay(uuid,uuid)` | DEFINER | Único cálculo de pago ejecutado |
| `versioned_update_compensation_profile(...)` | INVOKER | VWC de compensación |
| `apply_advance_balance_delta(...)` | INVOKER | Saldos de adelantos, atómico |
| `deactivate_old_compensation_profiles()` | DEFINER (trigger) | Cierra perfiles previos al insertar uno nuevo |
| `employee_has_locked_payroll(uuid)` | DEFINER | Consulta, **no bloquea escrituras** |
| `flag_pay_period_imported()` | DEFINER (trigger) | Marca periodos importados |

---

## 4. Tipos de compensación soportados

| Tipo | Clasificación | Evidencia |
|---|---|---|
| Pago por hora | **A** funcional | RPC líneas 130-157; `concept_employee_rates` |
| Salario fijo | **F** no existe | Sin columna ni concepto |
| Pago fijo por servicio | **E** parcial | `scheduled_shifts.pay_type='daily'` + concepto "Daily Pay" → `movements` |
| Tarifa por día / medio día | **B** dato sin cálculo | `default_daily_rate`, `default_half_day_rate` en UI; el RPC usa concepto "Daily Pay", no el perfil |
| Tarifa por rol / posición | **F** no existe | Sin `role_rate`/`position_rate` en el esquema |
| Tarifa por cliente | **C** (bill), **F** (pay) | Bill rate en `billable_service_blocks`; no hay pay rate por cliente |
| Tarifa por ubicación | **F** | Solo bill (`billing_client_locations`) |
| Tarifa por servicio específico | **E** | `scheduled_shifts.pay_override` (booleano de tipo, no de monto) |
| Overtime | **E** | 1.5x hardcodeado; `overtime_hourly_rate` es campo muerto (**C**) |
| Double time | **C** | `double_pay_hourly_rate` editable en UI, sin consumidor |
| Bonos | **A** | `concepts.category='extra'` → `movements` |
| Deducciones | **A** | `concepts.category='deduction'` → `movements` |
| Propinas | **E** | `import-payroll-extras` con `concept_id` hardcodeado |
| Reembolsos | **E** | Igual que propinas |
| Mileage | **F** | Sin implementación en el repo |
| Adelantos | **A** | `employee_financial_records` + `apply_advance_balance_delta` + `advance-deduction-engine.ts` (corre **fuera** del RPC) |
| Tarifa temporal / con fecha efectiva | **E** | Columnas existen (`effective_from/to`) pero **0 filas de `concept_employee_rates` las usan** |
| Tarifa por tenant | **A** | `compensation_profiles` está scopeado por `company_id`; 0 workers multi-empresa hoy |
| Kitchen / bonus transporte / ride rates | **C** | Editables, sin consumidor de cálculo |

---

## 5. Jerarquía real de tarifas

**La jerarquía que existe hoy (no inventada):**

```
shifts.hourly_rate_usd          (AVG del periodo; tabla legacy de import Connecteam)
  → concept_employee_rates.rate (concepto "Hourly Rate", filtrado por vigencia)
  → concepts.default_rate       (default de empresa para el concepto)
  → 0                           (silencioso, sin error)
```

Respuestas puntuales:

1. **¿Tarifa base por empleado?** Sí, dos: `compensation_profiles.default_hourly_rate` (visible, no usada) y `concept_employee_rates.rate` (invisible en su mayoría, usada).
2. **¿Tarifa por empresa?** Sí: `concepts.default_rate` por `company_id`. `company_compensation_rules` existe pero con 0 filas.
3. **¿Tarifa por rol?** No.
4. **¿Tarifa por servicio?** Solo indirecta vía `shifts.hourly_rate_usd` importado y `pay_type='daily'`.
5. **¿Tarifa por asignación?** No. `shift_assignments` no tiene columna de tarifa.
6. **¿Tarifa por cliente?** Solo bill rate, nunca pay rate.
7. **¿Varias tarifas por persona?** Sí: un perfil de compensación + N filas de `concept_employee_rates` (una por concepto).
8. **¿Cuál gana?** La del paso 1 disponible en la cascada; entre filas de `concept_employee_rates` gana `ORDER BY effective_from DESC NULLS LAST LIMIT 1` — y como **las 382 filas tienen `effective_from` NULL**, el orden es no determinista si hubiera duplicados.
9. **¿Fallback?** Sí, a `0` — pago cero silencioso, sin excepción ni alerta.
10. **¿Congelada o consultada?** **Consultada al consolidar.** No hay congelación.
11. **¿Un cambio futuro altera el histórico?** Sí, si se reconsolida un periodo. Filas con `import_id` están protegidas; las demás no.
12. **¿Effective date?** Columna sí, uso real no (0 filas).
13. **¿Historial?** Solo de `compensation_profiles` (`compensation_change_log`, 531 filas). `concept_employee_rates` no tiene historial.
14. **¿Se conserva el actor?** En `compensation_profiles` sí (`created_by`, `updated_by`, `confirmed_by`). En `concept_employee_rates` **no**.
15. **¿Tarifas distintas por tenant para el mismo worker?** Estructuralmente sí; hoy **0 casos** en datos.

---

## 6. Flujo real de payroll

| Paso | Archivo / objeto | Detalle |
|---|---|---|
| Disparo | `supabase/functions/payroll-consolidate/index.ts:56-74` | Valida `has_action_permission('aprobar_nomina')` y llama al RPC |
| Fuente de horas | `time_entries` `status='approved'`, `clock_out IS NOT NULL` | Si no hay ninguna, **fallback a `shifts.shift_hours`** (import legacy) |
| Fórmula de horas | `EXTRACT(EPOCH FROM (clock_out - clock_in))/3600 - break_minutes/60` | Sin redondeo de reloj (ni a 15 min) |
| Anti-fraude | >16 h por entrada, o >3x horas programadas | Excluidas del total, reportadas en `anomaly_flags` |
| Exclusión | Entradas cuyo `scheduled_shifts.pay_type='daily'` | Van a `movements`, no a horas |
| Tarifa | Cascada de §5 | Consultada en el momento de consolidar |
| Regular / OT | `LEAST(h, threshold)` / `GREATEST(h-threshold,0)` | `threshold` = `company_settings.payroll_config.ot_weekly_threshold`, default 40 |
| Importe | `regular*rate + ot*rate*1.5` | `ROUND(...,2)` |
| Persistencia | `period_base_pay` (upsert por `(period_id, employee_id)`) | `WHERE period_base_pay.import_id IS NULL` |
| Daily pay | `INSERT INTO movements ... 'Auto: Daily Pay'` con `approval_status='pending'` | Tarifa de `concept_employee_rates` del concepto "Daily Pay" |
| Auditoría | `activity_log` acción `consolidate_clock` | Incluye conteos y fuente usada |
| Revisión | `src/pages/admin/PayrollReviewQueue.tsx`, `WeeklyPayBreakdownDrawer.tsx`, `src/lib/weekly-pay-breakdown.ts` | **Read-only**, nunca recalcula |
| Salida | `src/lib/integrations/connecteam-export.ts`, `supabase/functions/send-payroll-email` | **No existe pay run financiero (ACH/Stripe payout)** |

Confirmaciones explícitas:

- ✅ Payroll usa `time_entries`.
- ✅ No usa horas programadas como fuente pagable.
- ⚠️ La tarifa se calcula **en el RPC, al consolidar** — no antes.
- ❌ El valor **nunca se congela**: no hay snapshot activo.
- ⚠️ Si no existe tarifa → `rate = 0` y `base_total_pay = 0`, sin error ni bandera.
- ⚠️ Si la tarifa cambia después del servicio, una reconsolidación recalcula el pasado con la nueva tarifa.
- ⚠️ `time_entries` aprobados pueden seguir siendo editados (VWC controla la concurrencia, no el bloqueo por periodo cerrado).
- ⚠️ Un periodo `closed`/`paid` **no bloquea** la reconsolidación ni la edición de `period_base_pay`/`movements`.

**Timezone:** el RPC compara con `clock_in::date` (timezone de sesión de Postgres, típicamente UTC). El resolver de UI aplica un cutoff de 03:00 para turnos nocturnos (documentado en `docs/engineering-system/mri/MRI-001-ATTENDANCE-TO-PAYROLL-TRUTH.md:16`). Divergencia conocida y no resuelta.

---

## 7. Pay rate vs bill rate

| Concepto | Dónde vive | Estado |
|---|---|---|
| Pay rate (worker) | `concept_employee_rates.rate`, `shifts.hourly_rate_usd`, `compensation_profiles.*` | Fragmentado en 3 fuentes |
| Bill rate (cliente) | `billable_service_blocks.rate` → `invoice_lines` | Carril separado, 0 filas |
| Precio del servicio | `invoices.total`, `legacy_invoices.grand_total` | Sin conexión autoritativa al costo |
| Costo total del servicio | **No existe** | No hay agregado de pay + cargas |
| Margen | **No existe** | Ninguna vista lo calcula |
| Overtime facturado | **No existe** | El OT solo vive del lado pay |

**Etiquetas ambiguas confirmadas:**

- `src/pages/admin/InvoicingServiceBlocks.tsx:250,289`, `InvoicingInvoiceNew.tsx:239,304`, `InvoicingInvoiceDetail.tsx:153` → columna **"Rate"** (bill rate, sin calificar).
- `src/components/employee/EmployeeProfileTabs.tsx:361-376` y `BulkRateAssignment.tsx:307` → **"Tarifa"** (pay rate, sin calificar).
- `src/pages/admin/Invoices.tsx:150-159` → tarifa **hardcodeada `25`** al generar líneas legacy ("default rate placeholder").

---

## 8. Superficies de interfaz

| Pantalla | Archivo | Valor | Fuente | Edita | VWC | ¿Afecta payroll? |
|---|---|---|---|---|---|---|
| Perfil / Compensación | `components/compensation/EmployeeCompensationTab.tsx`, `CompensationEditDialog.tsx:124` | hourly/daily/half-day/ride/OT/kitchen | `compensation_profiles` | admin | ✅ | **No** |
| Perfil / Conceptos | `components/employee/EmployeeProfileTabs.tsx:373` | "Tarifa" genérica | `concept_employee_rates` | admin/manager con `concepts:edit` | ❌ directo | **Sí** |
| Asignación masiva de tarifas | `components/employee/BulkRateAssignment.tsx:178-193` | "Nueva tarifa ($)" | `concept_employee_rates` | idem | ❌ directo, en lotes de 50 | **Sí** |
| Compensation Validation | `pages/admin/CompensationValidation.tsx:190,252,292,356` | hourly inferido | lee `concept_employee_rates`, escribe `compensation_profiles` | admin | mixto (insert directo + VWC) | No |
| Reglas de compensación | `hooks/useCompensation.tsx:305-317` | montos de regla | `company_compensation_rules` | admin | ❌ directo | Solo imports |
| Políticas financieras | `components/advances/CompanyFinancialPolicies.tsx:114` | topes de anticipo/deducción | `company_financial_policies` | admin | ❌ directo | Indirecto |
| Payroll Review Queue | `pages/admin/PayrollReviewQueue.tsx` | horas y totales | `period_base_pay` | — | read-only | No |
| Weekly Pay Breakdown | `lib/weekly-pay-breakdown.ts` | desglose | `period_base_pay` + `historical_payroll_entries` | — | read-only | No |
| Turno / PaySection | `components/shifts/form/PaySection.tsx` | `pay_type`, `day_type`, `pay_override` (sin monto) | `scheduled_shifts` | admin | ✅ | Indirecto (daily) |
| Shift Operations / mobile edit | `pages/admin/ShiftOperations.tsx`, `MobileShiftEditSheet.tsx:162` | sin montos | `scheduled_shifts` | admin | ✅ | No |
| Invoicing — bloques | `pages/admin/InvoicingServiceBlocks.tsx`, `hooks/useBillableServiceBlocks.tsx:158,179` | **"Rate"** (bill) | `billable_service_blocks` | admin | ❌ directo | No |
| Invoicing — facturas | `hooks/useInvoices.tsx:191,266,313,323` | montos | `invoices`, `invoice_lines` | admin | ❌ directo | No |
| Facturas legacy | `pages/admin/Invoices.tsx:119,150-171` | totales, **$25 hardcodeado** | `legacy_invoices` | admin | ❌ directo | No |
| Portal — PayStub / MyPayments / PayReports | `pages/portal/*` | `quantity × $rate`, totales | `movements`, `period_base_pay` | — | read-only | No |
| Onboarding (empresa y empleado) | `OnboardingWizard.tsx`, `EmployeeOnboarding.tsx` | ninguno | — | — | — | No |

Mobile: las superficies de dinero en móvil son de lectura (portal) o no contienen montos (edición de turno). No hay editor de tarifas usable en móvil.

---

## 9. Permisos y privacidad

| Objeto | Regla observada |
|---|---|
| `compensation_profiles` | 5 políticas; escritura restringida a admin/owner de la empresa; VWC + `compensation_change_log` |
| `concept_employee_rates` | `admin` (`has_role`), o `has_module_permission(uid,'concepts','edit')`, o `is_global_owner`. Scope por `concepts.company_id ∈ user_company_ids()` |
| `movements` | `admin` o `has_module_permission(uid,'movements','edit')`, o global owner |
| `period_base_pay` | `admin` o `has_module_permission(uid,'import','edit')` — **el permiso que gobierna base pay es "import"**, un naming engañoso |
| `time_entries` | 8 políticas; VWC; trigger anti-solape |
| Aislamiento entre empresas | Consistente vía `user_company_ids(auth.uid())` en todas las tablas auditadas |
| Worker | Solo lectura de lo propio (portal); no puede ver tarifas ajenas |
| Cliente | Sin acceso a tablas de pay rate |
| `is_global_owner` | Bypass total en `concept_employee_rates`, `movements`, `period_base_pay`, `concepts` |

Brechas:

- No existe un rol diferenciado "payroll manager"; el control es `has_module_permission` por módulo.
- Un `manager` con `concepts:edit` puede cambiar la tarifa que realmente se paga, **sin dejar historial ni actor**.
- No hay separación de límites entre pay rate y bill rate: ambos dependen del rol admin de empresa.

---

## 10. Versioned Write Contract

`src/lib/data/versioned-write.ts` declara 5 entidades: `scheduled_shifts`, `time_entries`, `compensation_profiles`, `contractor_w9`, `employee_documents`. El propio comentario del archivo advierte: *"No toca payroll, fichajes, tarifas, asignaciones ni saldos."*

| Editor financiero | VWC | Trigger `vwc_bump_version` |
|---|---|---|
| `compensation_profiles` | ✅ `versioned_update_compensation_profile` | ✅ |
| `time_entries` | ✅ | ✅ |
| `employee_financial_records` (saldos) | ✅ `apply_advance_balance_delta` (idempotente por `intent_key`) | — |
| `concept_employee_rates` | ❌ write directo | ❌ |
| `company_compensation_rules` | ❌ | ❌ |
| `company_financial_policies` | ❌ | ❌ |
| `billing_clients`, `billable_service_blocks`, `invoices`, `legacy_invoices` | ❌ | ❌ (solo `updated_at`) |
| `period_base_pay`, `movements` | ❌ (escritos por el RPC, sin versión) | ❌ |

Verificado por catálogo: los únicos triggers de versión en tablas financieras son `trg_zz_bump_compensation_version` y `trg_zz_bump_time_entry_version`. Todo lo demás solo tiene `update_updated_at_column`.

---

## 11. Historial y fechas efectivas

1. **¿Cambiar la tarifa hoy modifica el pasado?** No por sí solo, **pero sí en cuanto se reconsolide el periodo** (`period_base_pay` sin `import_id` se sobrescribe).
2. **¿Los servicios históricos conservan el valor original?** No, salvo los importados (`import_id`, 176/2 808 filas).
3. **¿`time_entries` guarda rate snapshot?** No. Sus columnas no incluyen ninguna tarifa.
4. **¿La asignación guarda rate snapshot?** No.
5. **¿Payroll consulta la tarifa actual o la histórica?** La **actual** al momento de consolidar.
6. **¿Puede recalcularse accidentalmente un periodo viejo?** **Sí.** No hay guarda por `pay_periods.status`; solo la protección `import_id`.

`compensation_profiles` sí tiene un modelo temporal decente (`effective_from`/`effective_to`, `is_active`, trigger de desactivación, `compensation_change_log` con actor y motivo) — pero es el subsistema que no paga.

---

## 12. Casos reales (reconstruidos sobre el código y datos agregados)

| Caso | Comportamiento actual |
|---|---|
| **A** — una sola tarifa horaria | Si está en `concept_employee_rates` (concepto "Hourly Rate"), paga bien. Si solo está en `compensation_profiles`, **paga $0**. |
| **B** — tarifas distintas por empresa | Soportado estructuralmente (0 casos hoy); la cascada está scopeada por `company_id`. |
| **C** — tarifa distinta por rol | **No soportado.** No existe rate por rol. |
| **D** — servicio con tarifa especial | Solo vía `shifts.hourly_rate_usd` importado (legacy) o concepto "Daily Pay". No hay override de monto en el turno. |
| **E** — cambio con fecha futura | `concept_employee_rates` acepta `effective_from`, pero **0 filas lo usan** y ninguna UI lo expone; en la práctica el cambio es inmediato. |
| **F** — cambio después de un servicio trabajado | Si el periodo no se reconsolida, el importe queda. Si se reconsolida, se recalcula con la tarifa nueva. |
| **G** — horas aprobadas + tarifa modificada | Las horas no cambian; el importe sí, al reconsolidar. |
| **H** — pay run procesado + tarifa modificada | **No hay guarda.** Un periodo `paid` puede reconsolidarse y alterar `base_total_pay`. Riesgo crítico. |
| **I** — worker sin tarifa | `rate = 0`, `base_total_pay = 0`, sin error ni bandera. Silencioso. |
| **J** — overtime | Semanal, umbral configurable, factor 1.5 hardcodeado. Sin OT diario, sin double time, sin OT facturado. |

---

## 13. Duplicaciones y legacy

| Fuente | Consumidor | Activa | Legacy | Riesgo |
|---|---|:--:|:--:|---|
| `compensation_profiles.default_hourly_rate` | UI de perfil, analytics | Sí | No | **CRÍTICO** — se edita creyendo que paga; no paga |
| `concept_employee_rates.rate` | `consolidate_period_base_pay` | Sí | No | **CRÍTICO** — paga sin historial ni actor |
| `shifts.hourly_rate_usd` (10 filas) | RPC, prioridad máxima | Sí | Sí | **CRÍTICO** — tabla de import legacy gana sobre todo lo demás |
| `concepts.default_rate` | RPC, fallback | Sí | No | ALTO — fallback silencioso a nivel empresa |
| `payroll_rate_snapshots` (0 filas) | `useCompensationSnapshot` | No | — | ALTO — infraestructura de congelación existente pero apagada |
| `company_compensation_rules` (0 filas) | `payroll-interpreter.ts` | No | — | MEDIO |
| `overtime_hourly_rate`, `double_pay_hourly_rate`, `kitchen_hourly_rate`, `bonus_transport_hourly_rate` | ninguno | No | — | ALTO — UI editable sin efecto |
| `historical_payroll_entries` (0 filas) | `weekly-pay-breakdown.ts` (lectura) | No | — | MEDIO |
| `payroll-reconciliation-engine.ts` (894 líneas) | reconciliación | Sí | Parcial | ALTO — tolerancias propias distintas del RPC |
| `weekly-payroll-reconciliation.ts` (443) + `payroll-truth-parser.ts` | reconciliación | Sí | Parcial | ALTO — tercer motor |
| `payroll-interpreter.ts` (405) | imports | Sí | No | ALTO — heurística hourly/daily/ride propia |
| 11 versiones de `consolidate_period_base_pay` en migraciones | — | 1 vigente | 10 | MEDIO — deriva histórica |
| `legacy_invoices` con tarifa `$25` hardcodeada | `Invoices.tsx` | Sí | Sí | ALTO — factura con valor ficticio |

---

## 14. Riesgos priorizados

### CRÍTICO
1. **La UI de Compensación no alimenta el pago.** Un admin sube el hourly rate en el perfil y el pago no cambia. Puede pagarse con tarifa incorrecta o $0.
2. **Fallback silencioso a `rate = 0`.** Sin tarifa en `concept_employee_rates`/`concepts`, el sistema consolida un pago de cero sin error visible.
3. **Reconsolidación de periodos cerrados/pagados.** 138 `closed` + 8 `paid` sin guarda; una reconsolidación reescribe el histórico con tarifas actuales.
4. **`shifts.hourly_rate_usd` (tabla legacy de 10 filas) tiene prioridad máxima** sobre toda tarifa configurada.
5. **Ausencia total de rate snapshot** (`payroll_rate_snapshots` vacía): no hay forma de reconstruir con qué tarifa se pagó un periodo.

### ALTO
6. `concept_employee_rates` — la tarifa que sí paga — se edita sin VWC, sin historial, sin actor y en lote (`BulkRateAssignment`).
7. Tres motores de reconciliación con reglas distintas del RPC.
8. Campos monetarios muertos editables (`overtime_hourly_rate`, `double_pay_hourly_rate`, kitchen, transporte).
9. El permiso que gobierna `period_base_pay` se llama `import`, no `payroll`.
10. Divergencia de timezone/overnight entre UI (cutoff 03:00) y RPC (`clock_in::date`).

### MEDIO
11. Etiqueta "Rate"/"Tarifa" idéntica para pay y bill.
12. `$25` hardcodeado en generación de líneas de factura legacy.
13. `effective_from` existe pero ninguna UI lo expone (0 filas lo usan).
14. Billing sin VWC ni versión.

### BAJO
15. Orden visual y densidad de las tablas de compensación en móvil.
16. Mezcla de inglés/español en headers de facturación.

---

## 15. Comparación con la experiencia de referencia

| Dimensión | Stafly hoy |
|---|---|
| Tarifa visible desde perfil | ✅ Existe, con más dimensiones que la referencia (ride, kitchen, medio día)… pero **no es la que paga** |
| Múltiples rates | ✅ Modelo de conceptos más flexible que un simple pay rate |
| Rates por trabajo/rol | ❌ Falta |
| Pay type | Parcial (hourly/daily) |
| Historial | ✅ Solo en `compensation_profiles`, con actor y motivo — mejor que la referencia, pero en el subsistema equivocado |
| Permisos | ✅ RLS multi-tenant sólido, superior a la media |
| Claridad de edición | ❌ Dos lugares para "la tarifa", ninguno señalizado |

- **Mejor que la referencia:** aislamiento multi-tenant, `compensation_change_log`, VWC, anti-fraude de horas.
- **Existe pero oculto:** effective dates, snapshots, reglas de compensación, OT rate personalizado.
- **Falta:** rate por rol/servicio, congelación al asignar, guarda de periodo cerrado, pay vs bill explícito.
- **No copiar:** editar tarifa directamente sobre el registro sin versión ni motivo.
- **Vendible:** "cada dólar pagado tiene tarifa, origen, actor y fecha demostrables".

---

## 16. Modelo canónico propuesto (no implementado)

```
person (passport)
  └── person_company_relationship (tenant scope)
        └── compensation_profile (por tenant, VWC, effective_from/to, actor, motivo)
              ├── rate_line[]   (kind: hourly|daily|half_day|ride|overtime, valor, vigencia)
              └── override[]    (por role / service_category / client, con autorización explícita)

assignment  ──► rate_snapshot (congelado al asignar: valor + origen + regla aplicada)
time_entry  ──► horas reales
                 └── payroll_line = horas × rate_snapshot   (nunca la tarifa vigente)

bill_rate   ──► client_rate_card (separado, etiquetado "Tarifa al cliente")
```

Principios: una sola cascada resuelta por una función única (`resolve_pay_rate(employee, company, date, context) → {rate, source, rule_id}`); snapshot obligatorio; error explícito si no hay tarifa (nunca `0`); periodo cerrado bloqueado por trigger; pay rate y bill rate con nombres distintos en datos y en UI; todo write bajo VWC.

---

## 17. Experiencia propuesta (no implementada)

- **Perfil del worker → Compensación:** tarifa actual con su **origen** ("Concepto: Hourly Rate"), tipo de pago, vigente desde, variaciones, historial con actor y motivo, acceso restringido con marca de auditoría.
- **Servicio / asignación:** tarifa aplicable + origen + botón de override autorizado; advertencia bloqueante si no hay tarifa; sello "tarifa congelada" tras asignar.
- **Payroll Review:** horas reales · tarifa aplicada · origen · total · badge de conflicto si la tarifa vigente difiere del snapshot · enlace a auditoría.
- **Mobile:** lectura clara sin tablas densas, edición deshabilitada, montos ocultos tras interacción explícita.

---

## 18. Quick wins (sin tocar cálculos)

1. Banner en la pestaña de Compensación: "Esta tarifa no alimenta hoy el cálculo de nómina" hasta unificar fuentes.
2. Renombrar labels: "Tarifa al trabajador" vs "Tarifa al cliente".
3. Ocultar los campos muertos (`double_pay_hourly_rate`, `kitchen_hourly_rate`, `bonus_transport_hourly_rate`) o marcarlos "no usado en cálculo".
4. Mostrar en Payroll Review una bandera visible cuando `base_total_pay = 0` con horas > 0.
5. Retirar el `$25` hardcodeado del generador de líneas legacy y exigir tarifa explícita.
6. Renombrar el permiso `import:edit` que gobierna `period_base_pay`.

## 19. Qué no tocar

Cálculos de payroll, `time_entries`, `scheduled_shifts`, pay runs, tarifas reales, overtime, saldos, adelantos, compensación, RLS, auth, tenants, contratos VWC y datos de producción. Nada de esto fue modificado.

## 20. Recomendación por fases

- **Fase 0 — Verdad visible (sin riesgo):** quick wins 1-6; instrumentar cuántos empleados consolidarían a $0 hoy.
- **Fase 1 — Guardas:** trigger que bloquee escrituras en `period_base_pay`/`movements` de periodos `closed`/`paid`; error explícito en vez de `rate = 0`.
- **Fase 2 — Fuente única:** `resolve_pay_rate()` como única cascada, consumida por RPC y UI; retirar `shifts.hourly_rate_usd` de la prioridad máxima.
- **Fase 3 — Congelación:** activar `payroll_rate_snapshots` al asignar y hacer que la consolidación lea el snapshot.
- **Fase 4 — VWC:** llevar `concept_employee_rates`, `company_compensation_rules`, `company_financial_policies` y billing al carril versionado.
- **Fase 5 — Modelo canónico:** overrides por rol/servicio y separación formal pay/bill.

---

**No se modificaron tarifas, payroll, time_entries, pay runs, RLS, contratos ni datos reales durante esta auditoría.**
